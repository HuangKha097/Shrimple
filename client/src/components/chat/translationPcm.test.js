import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmPacketizer } from './translationPcmWorklet.js';
import { createPcmCapture } from './translationPcmCapture.js';
import { createTranslationPcmSocket } from './translationPcmSocket.js';
import { reduceTranslationNotes, interruptTranslationNotes } from './translationNotesState.js';
import { conversationTranslationSources } from './translationStream.js';

const collect = (rate, channels, blockSize) => {
    const packets = [];
    const packetizer = new PcmPacketizer(rate, audio => packets.push(audio));
    for (let offset = 0; offset < channels[0].length; offset += blockSize) {
        packetizer.push(channels.map(channel => channel.subarray(offset, offset + blockSize)));
    }
    const samples = packets.flatMap(packet => Array.from({ length: packet.byteLength / 2 },
        (_, index) => new DataView(packet).getInt16(index * 2, true)));
    return { packets, samples };
};

test('44.1/48 kHz produce exact 128 ms PCM packets independent of render boundaries and preserve voice frequency', () => {
    for (const rate of [44100, 48000]) {
        const input = Float32Array.from({ length: rate * 3 }, (_, index) => 0.6 * Math.sin(2 * Math.PI * 440 * index / rate));
        const result = collect(rate, [input], 128);
        assert.equal(result.packets.length, Math.floor(3 * 16000 / 2048));
        assert.ok(result.packets.every(packet => packet.byteLength === 4096));
        assert.deepEqual(result.samples, collect(rate, [input], 173).samples);
        assert.deepEqual(result.samples, collect(rate, [input], input.length).samples);
        let crossings = 0;
        for (let index = 1; index < result.samples.length; index += 1) {
            if (result.samples[index - 1] <= 0 && result.samples[index] > 0) crossings += 1;
        }
        assert.ok(Math.abs(crossings / (result.samples.length / 16000) - 440) < 1);
        const rms = Math.sqrt(result.samples.reduce((sum, value) => sum + (value / 32768) ** 2, 0) / result.samples.length);
        assert.ok(rms > 0.42 && rms < 0.43);
    }
});

test('PCM is mono, finite, clamped and explicitly little-endian', () => {
    const positive = new Float32Array(6144).fill(0.75);
    const negative = new Float32Array(6144).fill(-0.75);
    const downmixed = collect(48000, [positive, negative], 128).samples;
    assert.equal(downmixed.length, 2048);
    assert.ok(downmixed.every(sample => sample === 0));
    const input = new Float32Array(2048);
    input.set([2, -2, 0.5, -0.5, NaN, Infinity]);
    const { packets, samples } = collect(16000, [input], 128);
    assert.deepEqual(samples.slice(0, 6), [32767, -32768, 16384, -16384, 0, 0]);
    assert.deepEqual([...new Uint8Array(packets[0]).slice(0, 8)], [255, 127, 0, 128, 0, 64, 0, 192]);
    assert.throws(() => new PcmPacketizer(8000, () => {}), /sample rate/);
});

test('registered worklet emits transferable PCM and silences its graph output without playing the remote track again', async () => {
    const previousBase = globalThis.AudioWorkletProcessor;
    const previousRegister = globalThis.registerProcessor;
    let Processor;
    const packets = [];
    globalThis.AudioWorkletProcessor = class {
        constructor() { this.port = { postMessage: (audio, transfer) => { assert.equal(transfer[0], audio); packets.push(audio); } }; }
    };
    globalThis.registerProcessor = (name, implementation) => { assert.equal(name, 'translation-pcm'); Processor = implementation; };
    try {
        await import('./translationPcmWorklet.js?registration-test');
        const processor = new Processor({ processorOptions: { inputSampleRate: 48000 } });
        const incoming = new Float32Array(128).fill(0.5);
        const outgoing = new Float32Array(128).fill(1);
        for (let index = 0; index < 48; index += 1) assert.equal(processor.process([[incoming]], [[outgoing]]), true);
        assert.equal(packets.length, 1);
        assert.equal(packets[0].byteLength, 4096);
        assert.ok(outgoing.every(value => value === 0));
        processor.port.onmessage({ data: 'stop' });
        assert.equal(processor.process([[incoming]], [[outgoing]]), false);
        assert.equal(packets.length, 1);
    } finally {
        if (previousBase === undefined) delete globalThis.AudioWorkletProcessor;
        else globalThis.AudioWorkletProcessor = previousBase;
        if (previousRegister === undefined) delete globalThis.registerProcessor;
        else globalThis.registerProcessor = previousRegister;
    }
});

test('stopping while the worklet module loads creates no graph and never stops the WebRTC track', async () => {
    let resolveModule;
    const moduleReady = new Promise(resolve => { resolveModule = resolve; });
    let graphCount = 0;
    let stopCount = 0;
    const context = { state: 'running', createMediaStreamSource() { graphCount += 1; } };
    const capture = createPcmCapture({ context, moduleReady, track: { stop() { stopCount += 1; } },
        onPacket() { assert.fail('Stopped capture emitted audio.'); }, onError() { assert.fail('Stopped capture reported failure.'); } });
    capture.stop();
    resolveModule();
    await capture.ready;
    assert.equal(graphCount, 0);
    assert.equal(stopCount, 0);
});

test('capture uses the actual context rate and disconnects only its own graph', async () => {
    const connections = [];
    let node;
    let stoppedTrack = false;
    const track = { stop() { stoppedTrack = true; } };
    class FakeStream { constructor(tracks) { assert.deepEqual(tracks, [track]); } }
    class FakeNode {
        constructor(context, name, options) {
            assert.equal(name, 'translation-pcm');
            assert.equal(options.processorOptions.inputSampleRate, 44100);
            this.port = { postMessage: value => connections.push(value), close: () => connections.push('port-closed') };
            node = this;
        }
        connect(destination) { connections.push(destination); }
        disconnect() { connections.push('node-disconnected'); }
    }
    const source = { connect(value) { connections.push(value); }, disconnect() { connections.push('source-disconnected'); } };
    const context = { state: 'running', sampleRate: 44100, destination: 'destination', createMediaStreamSource: () => source };
    const received = [];
    const capture = createPcmCapture({ context, moduleReady: Promise.resolve(), track, WorkletNode: FakeNode,
        MediaStreamClass: FakeStream, onPacket: packet => received.push(packet), onError: assert.fail });
    await capture.ready;
    const audio = new ArrayBuffer(4096);
    node.port.onmessage({ data: audio });
    assert.deepEqual(received, [audio]);
    capture.stop();
    capture.stop();
    assert.equal(node.port.onmessage, null);
    assert.ok(connections.includes('source-disconnected'));
    assert.ok(connections.includes('node-disconnected'));
    assert.equal(stoppedTrack, false);
});

const transcript = (overrides = {}) => ({ type: 'transcript', streamId: 'stream-a', speakerId: 'bob', speakerName: 'Bob',
    utteranceId: 'utterance-a', revision: 1, original: 'Hello', sourceLanguage: 'en', targetLanguage: 'vi', isFinal: false, ...overrides });

test('growing transcript stays in one note, freezes at final, and only its final revision can translate', () => {
    let notes = reduceTranslationNotes([], transcript(), '00:01');
    notes = reduceTranslationNotes(notes, transcript({ revision: 2, original: 'Hello there' }), '00:02');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].original, 'Hello there');
    assert.equal(notes[0].time, '00:01');
    assert.equal(notes[0].translationState, 'pending');
    const current = notes;
    assert.equal(reduceTranslationNotes(notes, { ...transcript(), type: 'translation', translated: 'early' }, '00:02'), current);
    notes = reduceTranslationNotes(notes, transcript({ revision: 3, original: 'Hello there!', isFinal: true }), '00:03');
    const final = notes;
    assert.equal(reduceTranslationNotes(notes, transcript({ revision: 4, original: 'Wrong later revision' }), '00:04'), final);
    assert.equal(reduceTranslationNotes(notes, { ...transcript(), type: 'translation', translated: 'stale' }, '00:04'), final);
    assert.equal(reduceTranslationNotes(notes, { ...transcript(), type: 'status', revision: 3, status: 202 }, '00:04'), final);
    notes = reduceTranslationNotes(notes, { ...transcript(), type: 'translation', revision: 3, translated: 'Xin chào!' }, '00:05');
    assert.equal(notes[0].translated, 'Xin chào!');
    assert.equal(notes[0].translationState, 'complete');
});

test('delayed and out-of-order translations stay attached to the correct stream and utterance', () => {
    let notes = [];
    for (const event of [transcript({ isFinal: true }), transcript({ utteranceId: 'utterance-b', original: 'Second', isFinal: true }),
        transcript({ streamId: 'stream-b', speakerId: 'carol', original: 'Other speaker', isFinal: true })]) {
        notes = reduceTranslationNotes(notes, event, '00:01');
    }
    for (const [streamId, utteranceId, translated] of [['stream-b', 'utterance-a', 'C'], ['stream-a', 'utterance-b', 'B'], ['stream-a', 'utterance-a', 'A']]) {
        notes = reduceTranslationNotes(notes, { type: 'translation', streamId, utteranceId, revision: 1, translated });
    }
    assert.deepEqual(notes.map(note => note.translated), ['A', 'B', 'C']);
});

test('busy partial statuses retain pending text so a later final revision and translation can complete', () => {
    let notes = reduceTranslationNotes([], transcript(), '00:01');
    const partial = notes;
    for (const status of [202, 429, 503]) {
        notes = reduceTranslationNotes(notes, { ...transcript(), type: 'status', status, message: 'Processing speech.' }, '00:02');
        assert.equal(notes, partial);
        assert.equal(notes[0].original, 'Hello');
        assert.equal(notes[0].translationState, 'pending');
    }
    notes = reduceTranslationNotes(notes, transcript({ revision: 2, original: 'Hello there!', isFinal: true }), '00:03');
    notes = reduceTranslationNotes(notes, { ...transcript(), revision: 2, type: 'translation', translated: 'Xin chào!' }, '00:04');
    assert.equal(notes[0].original, 'Hello there!');
    assert.equal(notes[0].translationState, 'complete');
});

test('error/interruptions retain originals and never allow a late translation to revive a stopped note', () => {
    let notes = reduceTranslationNotes([], transcript({ isFinal: true }), '00:01');
    notes = reduceTranslationNotes(notes, { ...transcript(), type: 'error', status: 429, message: 'Translation busy.' });
    assert.equal(notes[0].original, 'Hello');
    assert.equal(notes[0].translationState, 'error');
    assert.equal(notes[0].message, 'Translation busy.');
    notes = reduceTranslationNotes(notes, transcript({ streamId: 'stream-b', isFinal: true }), '00:02');
    notes = interruptTranslationNotes(notes, 'stream-b');
    assert.equal(notes[1].translationState, 'interrupted');
    assert.equal(reduceTranslationNotes(notes, { ...transcript(), streamId: 'stream-b', type: 'translation', translated: 'late' }), notes);
});

test('unclear final preserves the last safe partial and a later utterance can complete', () => {
    let notes = reduceTranslationNotes([], transcript(), '00:01');
    notes = reduceTranslationNotes(notes, { ...transcript(), type: 'error', status: 422, message: 'Please repeat this part.' });
    assert.equal(notes[0].original, 'Hello');
    assert.equal(notes[0].translationState, 'error');
    assert.equal(reduceTranslationNotes(notes, transcript({ revision: 2, isFinal: true, original: 'stale' })), notes);
    notes = reduceTranslationNotes(notes, transcript({ utteranceId: 'utterance-b', original: 'Next sentence', isFinal: true }), '00:02');
    notes = reduceTranslationNotes(notes, { ...transcript(), utteranceId: 'utterance-b', type: 'translation', translated: 'Câu tiếp theo' });
    assert.equal(notes[1].translationState, 'complete');
    assert.equal(notes[1].translated, 'Câu tiếp theo');
});

test('notes retain at most 50 utterances and reject empty/invalid language/revision data', () => {
    let notes = [];
    for (let index = 0; index < 60; index += 1) notes = reduceTranslationNotes(notes, transcript({ utteranceId: `u-${index}` }), '00:01');
    assert.equal(notes.length, 50);
    assert.equal(notes[0].utteranceId, 'u-10');
    for (const overrides of [{ original: '' }, { targetLanguage: 'en' }, { revision: NaN }, { isFinal: undefined }, { speakerId: '' }]) {
        assert.equal(reduceTranslationNotes(notes, transcript({ utteranceId: 'invalid', ...overrides })), notes);
    }
});

class FakeSocket {
    connected = true;
    handlers = new Map();
    sent = [];
    on(type, callback) { const handlers = this.handlers.get(type) || new Set(); handlers.add(callback); this.handlers.set(type, handlers); }
    off(type, callback) { this.handlers.get(type)?.delete(callback); }
    emit(type, data, ack) { this.sent.push({ type, data, ack }); }
    receive(type, data) { for (const callback of [...this.handlers.get(type) || []]) callback(data); }
}
const startAck = { ok: true, streamId: 'stream-a', sampleRate: 16000, channels: 1, packetSamples: 2048 };
const socketHarness = () => {
    const socket = new FakeSocket();
    const timers = new Map();
    let timerIndex = 0;
    const seen = [];
    const failures = [];
    const ready = [];
    const stream = createTranslationPcmSocket({ socket, request: { speakerId: 'bob', sourceLanguage: 'en', targetLanguage: 'vi' },
        onReady: id => ready.push(id), onEvent: event => seen.push(event), onFailure: error => failures.push(error),
        setTimer: callback => { const id = ++timerIndex; timers.set(id, callback); return id; }, clearTimer: id => timers.delete(id) });
    return { socket, stream, timers, seen, failures, ready };
};

test('no PCM leaves before start acknowledgement; exact frames have increasing sequence and bounded acknowledgements', () => {
    const { socket, stream, failures, timers } = socketHarness();
    const audio = new ArrayBuffer(4096);
    assert.equal(stream.send(audio), false);
    assert.deepEqual(socket.sent.map(event => event.type), ['translation:start']);
    socket.sent[0].ack(startAck);
    assert.equal(stream.send(audio), true);
    assert.equal(stream.send(audio), true);
    socket.sent[1].ack({ ok: true });
    assert.equal(stream.send(audio), true);
    assert.deepEqual(socket.sent.filter(event => event.type === 'translation:audio').map(event => event.data.seq), [0, 1, 2]);
    assert.equal(stream.send(audio), false);
    assert.equal(failures[0].status, 429);
    assert.equal(timers.size, 0);
    assert.equal(socket.sent.at(-1).type, 'translation:stop');
    assert.equal(socket.handlers.get('translation:event').size, 0);
});

test('disconnect cancels listeners and timers with zero offline replay, including late start acknowledgement', () => {
    const { socket, stream, failures, timers, ready } = socketHarness();
    socket.connected = false;
    socket.receive('disconnect');
    assert.equal(stream.send(new ArrayBuffer(4096)), false);
    assert.equal(timers.size, 0);
    assert.equal(failures.length, 1);
    assert.equal(socket.sent.length, 1);
    socket.connected = true;
    socket.sent[0].ack(startAck);
    assert.equal(socket.sent.at(-1).type, 'translation:stop');
    assert.deepEqual(ready, []);
    assert.equal(stream.send(new ArrayBuffer(4096)), false);
});

test('cancelled start cannot leak a server stream and stream replacement cannot receive stale/cross-speaker events', () => {
    const first = socketHarness();
    first.stream.stop();
    first.socket.sent[0].ack(startAck);
    assert.equal(first.socket.sent.at(-1).type, 'translation:stop');
    const { socket, stream, seen } = socketHarness();
    socket.sent[0].ack(startAck);
    for (const event of [transcript({ streamId: 'old' }), transcript({ speakerId: 'carol' }), transcript({ targetLanguage: 'en' }), transcript()]) {
        socket.receive('translation:event', event);
    }
    assert.deepEqual(seen, [transcript()]);
    stream.stop();
    socket.receive('translation:event', transcript());
    assert.equal(seen.length, 1);
});

test('start/audio timeouts and 401/403 failures terminate only once and settle resources', () => {
    for (const status of [401, 403, 429, 503]) {
        const { socket, failures, timers } = socketHarness();
        socket.sent[0].ack({ ok: false, status, message: 'Cannot start.' });
        assert.equal(failures[0].status, status);
        assert.equal(timers.size, 0);
    }
    for (const ackStarted of [false, true]) {
        const { socket, stream, failures, timers } = socketHarness();
        if (ackStarted) { socket.sent[0].ack(startAck); stream.send(new ArrayBuffer(4096)); }
        const [timerId, callback] = [...timers.entries()][0];
        timers.delete(timerId);
        callback();
        assert.equal(failures[0].status, 504);
        assert.equal(timers.size, 0);
        socket.receive('disconnect');
        assert.equal(failures.length, 1);
    }
});

test('utterance busy errors keep the stream alive while stream-level errors stop it', () => {
    const { socket, stream, seen, failures } = socketHarness();
    socket.sent[0].ack(startAck);
    socket.receive('translation:event', { ...transcript(), type: 'error', status: 429 });
    assert.equal(seen.length, 1);
    assert.equal(failures.length, 0);
    assert.equal(stream.send(new ArrayBuffer(4096)), true);
    socket.receive('translation:event', { type: 'error', streamId: 'stream-a', speakerId: 'bob', status: 403 });
    assert.equal(failures[0].status, 403);
    assert.equal(stream.send(new ArrayBuffer(4096)), false);
});

test('conversationTranslationSources captures both live unmuted self and remote tracks and reduceTranslationNotes keeps self speech original-only', () => {
    const selfTrack = { readyState: 'live', enabled: true };
    const peerTrack = { readyState: 'live', enabled: true };
    const sources = conversationTranslationSources([
        { id: 'me', stream: { getAudioTracks: () => [selfTrack] }, muted: false },
        { id: 'peer', stream: { getAudioTracks: () => [peerTrack] }, muted: false },
        { id: 'muted-peer', stream: { getAudioTracks: () => [peerTrack] }, muted: true },
    ], 'me');
    assert.deepEqual(sources, [
        { id: 'me', track: selfTrack, isSelf: true },
        { id: 'peer', track: peerTrack, isSelf: false },
    ]);
    let notes = reduceTranslationNotes([], {
        type: 'transcript', streamId: 'stream-self', utteranceId: 'u-self', revision: 1,
        speakerId: 'me', speakerName: 'Bạn', original: 'Xin chào',
        sourceLanguage: 'vi', targetLanguage: 'vi', isFinal: false, translate: false,
    }, '00:05');
    notes = reduceTranslationNotes(notes, {
        type: 'transcript', streamId: 'stream-self', utteranceId: 'u-self', revision: 2,
        speakerId: 'me', speakerName: 'Bạn', original: 'Xin chào bạn',
        sourceLanguage: 'vi', targetLanguage: 'vi', isFinal: true, translate: false,
    }, '00:06');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].original, 'Xin chào bạn');
    assert.equal(notes[0].translationState, 'self');
    assert.equal(notes[0].translate, false);
    assert.equal(interruptTranslationNotes(notes, 'stream-self')[0].translationState, 'self');
});

