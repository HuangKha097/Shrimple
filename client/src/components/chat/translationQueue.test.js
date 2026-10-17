import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslationQueue } from './translationQueue.js';
import { consumeTranslationStream } from './translationStream.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((finish, fail) => { resolve = finish; reject = fail; });
    return { promise, resolve, reject };
};

function fixture() {
    const started = [];
    const requests = new Map();
    const errors = [];
    let skipped = 0;
    const queue = createTranslationQueue((clip, releaseRecognition) => {
        started.push(clip);
        const request = { ...deferred(), releaseRecognition };
        requests.set(clip, request);
        return request.promise;
    }, { onChange() {}, onSkipped() { skipped++; }, onError(error) { errors.push(error); } });
    return { queue, started, requests, errors, get skipped() { return skipped; } };
}

test('a later original arrives while the earlier translation remains pending', async () => {
    const writers = new Map();
    const seen = [];
    const started = [];
    const errors = [];
    const encoder = new TextEncoder();
    const emit = (clip, event) => writers.get(clip).enqueue(encoder.encode(JSON.stringify(event) + '\n'));
    const original = clip => ({ type: 'transcript', speakerId: 'bob', original: `Original ${clip}`, sourceLanguage: 'en', targetLanguage: 'vi' });
    const queue = createTranslationQueue(async (clip, releaseRecognition) => {
        started.push(clip);
        const stream = new ReadableStream({ start(writer) { writers.set(clip, writer); } });
        try {
            await consumeTranslationStream(stream, event => {
                seen.push({ clip, ...event });
                if (event.type === 'transcript') releaseRecognition();
            });
        } catch (error) {
            if (error.status !== 429) throw error;
        }
    }, { onChange() {}, onSkipped() {}, onError(error) { errors.push(error); } });
    queue.push('first');
    queue.push('second');
    assert.deepEqual(started, ['first']);
    emit('first', original('first'));
    await flush();
    assert.deepEqual(started, ['first', 'second']);
    emit('second', original('second'));
    await flush();
    assert.deepEqual(seen.map(event => [event.clip, event.type]), [['first', 'transcript'], ['second', 'transcript']]);
    assert.equal(queue.size, 2);
    queue.push('third');
    assert.deepEqual(started, ['first', 'second']);
    emit('second', { type: 'error', status: 429, message: 'Translation busy.' });
    await flush();
    assert.deepEqual(started, ['first', 'second', 'third']);
    emit('third', original('third'));
    emit('third', { type: 'translation', translated: 'Bản dịch ba' });
    writers.get('third').close();
    await flush();
    emit('first', { type: 'translation', translated: 'Bản dịch một' });
    writers.get('first').close();
    await flush();
    assert.deepEqual(seen.filter(event => event.type === 'translation').map(event => event.clip), ['third', 'first']);
    assert.equal(queue.size, 0);
    assert.deepEqual(errors, []);
});

test('only one recognition runs and at most two streams plus the newest clip remain queued', async () => {
    const state = fixture();
    state.queue.push('a');
    state.queue.push('b');
    state.queue.push('c');
    assert.deepEqual(state.started, ['a']);
    assert.equal(state.skipped, 1);
    assert.equal(state.queue.size, 2);
    state.requests.get('a').releaseRecognition();
    assert.deepEqual(state.started, ['a', 'c']);
    state.requests.get('a').releaseRecognition();
    state.queue.push('d');
    state.queue.push('e');
    assert.equal(state.queue.size, 3);
    assert.equal(state.skipped, 2);
    state.requests.get('a').resolve();
    await flush();
    assert.deepEqual(state.started, ['a', 'c']);
    state.requests.get('c').releaseRecognition();
    assert.deepEqual(state.started, ['a', 'c', 'e']);
    state.requests.get('c').resolve();
    state.requests.get('e').resolve();
    await flush();
    assert.equal(state.queue.size, 0);
});

test('failure before recognition releases its lane so pending audio can continue', async () => {
    const state = fixture();
    state.queue.push('a');
    state.queue.push('b');
    const failure = new Error('STT rejected.');
    state.requests.get('a').reject(failure);
    await flush();
    assert.deepEqual(state.started, ['a', 'b']);
    assert.deepEqual(state.errors, [failure]);
    state.requests.get('b').resolve();
    await flush();
    assert.equal(state.queue.size, 0);
});

test('stop ignores stale transcript/completion callbacks and prevents pending audio restart', async () => {
    const state = fixture();
    state.queue.push('a');
    state.requests.get('a').releaseRecognition();
    state.queue.push('b');
    state.queue.push('c');
    state.queue.stop();
    state.queue.push('d');
    state.requests.get('b').releaseRecognition();
    state.requests.get('b').reject(new Error('aborted'));
    state.requests.get('a').resolve();
    await flush();
    assert.deepEqual(state.started, ['a', 'b']);
    assert.deepEqual(state.errors, []);
    assert.equal(state.queue.size, 0);
});
