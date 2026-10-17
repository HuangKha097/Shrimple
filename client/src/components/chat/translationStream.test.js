import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeTranslationStream, defaultTranslationDirection, remoteTranslationSources, translationRequestError } from './translationStream.js';

const encoder = new TextEncoder();
const transcript = (speakerId = 'bob') => ({ type: 'transcript', speakerId, speakerName: 'Bảo', original: 'Xin chào, bạn khỏe không?', sourceLanguage: 'vi', targetLanguage: 'en' });
const translation = { type: 'translation', translated: 'Hello, how are you?' };
const bytes = (...events) => encoder.encode(events.map(event => JSON.stringify(event)).join('\n') + '\n');
const streamOf = (...chunks) => new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } });
const expected = { speakerId: 'bob', sourceLanguage: 'vi', targetLanguage: 'en' };

test('original is delivered before a later translation, without waiting for EOF', async () => {
    let writer;
    let markOriginal;
    const originalSeen = new Promise(resolve => { markOriginal = resolve; });
    const stream = new ReadableStream({ start(controller) { writer = controller; } });
    const seen = [];
    let finished = false;
    const reading = consumeTranslationStream(stream, event => {
        seen.push(event);
        if (event.type === 'transcript') markOriginal();
    }, expected).then(() => { finished = true; });
    writer.enqueue(bytes(transcript()));
    await originalSeen;
    assert.deepEqual(seen, [transcript()]);
    assert.equal(finished, false);
    writer.enqueue(bytes(translation));
    writer.close();
    await reading;
    assert.deepEqual(seen, [transcript(), translation]);
});

test('JSON and Vietnamese UTF-8 survive every possible single-byte network boundary', async () => {
    const all = bytes(transcript(), translation);
    const seen = [];
    await consumeTranslationStream(streamOf(...[...all].map(byte => Uint8Array.of(byte))), event => seen.push(event), expected);
    assert.deepEqual(seen, [transcript(), translation]);
});

test('simultaneous speakers keep transcript and translation events isolated', async () => {
    const seen = { bob: [], carol: [] };
    await Promise.all(Object.keys(seen).map(speakerId => consumeTranslationStream(
        streamOf(bytes(transcript(speakerId)), bytes({ ...translation, translated: speakerId })),
        event => seen[speakerId].push(event), { ...expected, speakerId }
    )));
    assert.equal(seen.bob[0].speakerId, 'bob');
    assert.equal(seen.bob[1].translated, 'bob');
    assert.equal(seen.carol[0].speakerId, 'carol');
    assert.equal(seen.carol[1].translated, 'carol');
});

test('reordered, duplicated and cross-speaker events are rejected', async () => {
    const invalid = [
        [translation, transcript()],
        [transcript(), transcript(), translation],
        [transcript('alice'), translation],
        [transcript(), translation, translation],
        [{ ...transcript(), targetLanguage: 'vi' }, translation],
    ];
    for (const events of invalid) {
        await assert.rejects(consumeTranslationStream(streamOf(bytes(...events)), () => {}, expected), /Invalid translation stream/);
    }
});

test('source and destination follow the counterpart-to-reader direction for either UI language', async () => {
    for (const [uiLanguage, spoken, read] of [['vi-VN', 'en', 'vi'], ['en-US', 'vi', 'en']]) {
        const [sourceLanguage, targetLanguage] = defaultTranslationDirection(uiLanguage).split('-');
        const seen = [];
        await consumeTranslationStream(streamOf(bytes({ ...transcript(), sourceLanguage: spoken, targetLanguage: read }, translation)),
            event => seen.push(event), { speakerId: 'bob', sourceLanguage, targetLanguage });
        assert.equal(seen[0].sourceLanguage, spoken);
        assert.equal(seen[0].targetLanguage, read);
        await assert.rejects(consumeTranslationStream(streamOf(bytes({ ...transcript(), sourceLanguage: read, targetLanguage: spoken }, translation)),
            () => {}, { speakerId: 'bob', sourceLanguage, targetLanguage }), /Invalid translation stream/);
    }
});

test('busy and permission errors before transcription retain their HTTP status', async () => {
    for (const status of [401, 403, 429]) {
        const seen = [];
        await assert.rejects(consumeTranslationStream(streamOf(bytes({ type: 'error', status, message: 'Cannot process.' })), event => seen.push(event)),
            error => error.status === status);
        assert.deepEqual(seen, []);
    }
});

test('translation failure after transcription leaves the original delivered', async () => {
    const seen = [];
    await assert.rejects(consumeTranslationStream(streamOf(bytes(transcript(), { type: 'error', status: 504, message: 'Timed out.' })),
        event => seen.push(event), expected), error => error.status === 504);
    assert.deepEqual(seen, [transcript()]);
});

test('premature EOF preserves the original and reports incomplete translation', async () => {
    const seen = [];
    await assert.rejects(consumeTranslationStream(streamOf(bytes(transcript())), event => seen.push(event), expected), /before a result/);
    assert.deepEqual(seen, [transcript()]);
});

test('empty speech can finish without manufacturing a note', async () => {
    const seen = [];
    await consumeTranslationStream(streamOf(bytes({ ...transcript(), original: '' }, { type: 'translation', translated: '' })), event => seen.push(event), expected);
    assert.equal(seen[0].original, '');
    assert.equal(seen[1].translated, '');
});

test('malformed, oversized and invalid UTF-8 events are rejected and cancel the reader', async () => {
    for (const data of [encoder.encode('{nope}\n'), encoder.encode('x'.repeat(128 * 1024 + 1)), Uint8Array.of(0xff), bytes({ type: 'error', status: 200, message: 'wrong' })]) {
        let cancelled = false;
        const stream = new ReadableStream({ start(controller) { controller.enqueue(data); }, cancel() { cancelled = true; } });
        await assert.rejects(consumeTranslationStream(stream, () => {}));
        assert.equal(cancelled, true);
    }
});

test('abort stops a blocked stream read and prevents later callback updates', async () => {
    const controller = new AbortController();
    let markOriginal;
    const originalSeen = new Promise(resolve => { markOriginal = resolve; });
    let cancelled = false;
    const seen = [];
    const stream = new ReadableStream({ start(writer) { writer.enqueue(bytes(transcript())); }, cancel() { cancelled = true; } });
    const reading = consumeTranslationStream(stream, event => { seen.push(event); markOriginal(); }, expected, controller.signal);
    await originalSeen;
    controller.abort();
    await assert.rejects(reading, error => error.name === 'AbortError');
    assert.equal(cancelled, true);
    assert.deepEqual(seen, [transcript()]);
});

test('fetch adapter JSON errors are decoded with bounded non-JSON fallback', async () => {
    const detail = await translationRequestError({ response: { status: 403, data: streamOf(encoder.encode('{"message":"Call ended."}')) } });
    assert.deepEqual(detail, { status: 403, message: 'Call ended.' });
    const malformed = await translationRequestError({ response: { status: 503, data: streamOf(encoder.encode('<html>Unavailable</html>')) } });
    assert.deepEqual(malformed, { status: 503, message: '' });
    const large = await translationRequestError({ response: { status: 503, data: streamOf(encoder.encode('x'.repeat(16385))) } });
    assert.deepEqual(large, { status: 503, message: '' });
});

test('remote source selection excludes self, muted and ended tracks, and deduplicates peers', () => {
    const liveTrack = { readyState: 'live' };
    const latestTrack = { readyState: 'live' };
    const source = (id, track = liveTrack, muted = false) => ({ id, muted, stream: { getAudioTracks: () => track ? [track] : [] } });
    const sources = [source('alice'), source({ _id: 'alice' }), source('bob'), source('bob', latestTrack),
        source('carol', liveTrack, true), source('dave', { readyState: 'ended' }), source('erin', null), source({})];
    assert.deepEqual(remoteTranslationSources(sources, 'alice'), [{ id: 'bob', track: latestTrack }]);
    assert.deepEqual(remoteTranslationSources(sources, { _id: 'alice' }), [{ id: 'bob', track: latestTrack }]);
    assert.deepEqual(remoteTranslationSources(sources, undefined), []);
});
