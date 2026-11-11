import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDirectCallSession } from '../../client/src/components/chat/directCallSession.js';
import { createPcmCapture } from '../../client/src/components/chat/translationPcmCapture.js';
import { conversationTranslationSources, createTranslationRequest } from '../../client/src/components/chat/translationStream.js';
import { interruptTranslationNotes, reduceTranslationNotes } from '../../client/src/components/chat/translationNotesState.js';
import { createTranslationPcmBridge } from '../src/socket/translationPcm.js';

class Socket extends EventEmitter {
    connected = true;
    sent = [];
    emit(event, ...args) { this.sent.push([event, ...args]); }
    receive(event, ...args) { super.emit(event, ...args); }
}

const media = (video = false) => {
    const track = () => ({ enabled: true, muted: false, readyState: 'live', stops: 0,
        stop() { this.stops++; this.readyState = 'ended'; } });
    const audio = track();
    const camera = video ? track() : null;
    return { getAudioTracks: () => [audio], getVideoTracks: () => camera ? [camera] : [],
        getTracks: () => camera ? [audio, camera] : [audio] };
};

function fixture(options = {}) {
    const socket = new Socket();
    const peers = [];
    const streams = [];
    const errors = [];
    const muted = [];
    let requests = 0;
    let accepted = 0;
    let ended = 0;
    const session = createDirectCallSession({
        socket, peerId: 'remote', incoming: true, signal: { type: 'offer' }, isVideo: false,
        getUserMedia: async () => { requests++; return media(); },
        createPeer: config => {
            const peer = new EventEmitter();
            peer.config = config;
            peer.signals = [];
            peer.signal = value => peer.signals.push(value);
            peer.destroy = () => { peer.destroyed = true; peer.emit('close'); };
            peers.push(peer);
            return peer;
        },
        onLocalStream: stream => streams.push(stream), onRemoteStream: () => {},
        onAccepted: () => accepted++, onRemoteMute: value => muted.push(value),
        onEnded: () => ended++, onError: reason => errors.push(reason),
        ...options,
    });
    return { session, socket, peers, streams, errors, muted,
        get requests() { return requests; }, get accepted() { return accepted; }, get ended() { return ended; } };
}

test('incoming accept uses one mic; mute disables the exact audio track sent by the peer and used by notes', async () => {
    const f = fixture();
    await f.session.start();
    assert.equal(f.requests, 0, 'ringing does not open the microphone');
    await Promise.all([f.session.answer(), f.session.answer()]);
    assert.equal(f.requests, 1, 'a fast double answer cannot acquire two streams');
    assert.equal(f.peers.length, 1);
    assert.equal(f.accepted, 1);
    const sent = f.peers[0].config.stream;
    assert.equal(sent, f.streams[0]);
    await f.session.start();
    assert.equal(f.requests, 1, 'accepting/rerendering must retain the peer stream');
    const sources = [{ id: 'self', stream: sent }];
    assert.equal(conversationTranslationSources(sources, 'self').length, 1);
    f.session.setMicEnabled(false);
    assert.equal(sent.getAudioTracks()[0].enabled, false);
    assert.deepEqual(conversationTranslationSources(sources, 'self'), []);
    assert.deepEqual(f.socket.sent.at(-1), ['callMediaState', { to: 'remote', isMuted: true }]);
    f.session.setMicEnabled(true);
    assert.equal(sent.getAudioTracks()[0].enabled, true);
    assert.equal(f.requests, 1);
    f.session.end();
    assert.equal(sent.getAudioTracks()[0].stops, 1);
    assert.equal(f.peers[0].destroyed, true);
    assert.equal(f.ended, 1);
});

test('caller keeps answer listener until accepted; remote mute filters the remote translation source', async () => {
    const f = fixture({ incoming: false });
    await f.session.start();
    await f.session.start();
    assert.equal(f.requests, 1);
    f.socket.receive('callAccepted', { type: 'answer' });
    assert.equal(f.accepted, 1);
    assert.deepEqual(f.peers[0].signals, [{ type: 'answer' }]);
    f.socket.receive('callMediaState', { from: 'someone-else', isMuted: true });
    assert.deepEqual(f.muted, []);
    f.socket.receive('callMediaState', { from: 'remote', isMuted: true });
    const remote = media();
    assert.deepEqual(conversationTranslationSources([{ id: 'remote', stream: remote, muted: f.muted.at(-1) }], 'self'), []);
    f.socket.receive('callMediaState', { from: 'remote', isMuted: false });
    assert.equal(conversationTranslationSources([{ id: 'remote', stream: remote, muted: f.muted.at(-1) }], 'self').length, 1);
    f.session.stop();
    assert.equal(f.socket.listenerCount('callAccepted'), 0);
    assert.equal(f.socket.listenerCount('callMediaState'), 0);
});

test('ending while permission is pending stops late tracks and never creates a peer', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const f = fixture({ getUserMedia: () => pending });
    const answer = f.session.answer();
    await Promise.resolve();
    f.session.end();
    const late = media(true);
    release(late);
    await answer;
    assert.equal(f.peers.length, 0);
    assert.equal(f.streams.length, 0);
    assert.ok(late.getTracks().every(track => track.stops === 1));
    assert.equal(f.accepted, 0);
});

test('disconnect/peer error releases mic once; a new call to the same peer starts with fresh enabled tracks', async () => {
    for (const reason of ['disconnect', 'error', 'close']) {
        const f = fixture({ incoming: false });
        await f.session.start();
        f.session.setMicEnabled(false);
        if (reason === 'disconnect') {
            f.socket.connected = false;
            f.socket.receive('disconnect');
        } else f.peers[0].emit(reason, new Error('simulated'));
        f.session.stop();
        assert.equal(f.streams[0].getAudioTracks()[0].stops, 1);
        assert.equal(f.ended, 1);
        assert.equal(f.socket.listenerCount('disconnect'), 0);
    }
    const next = fixture({ incoming: false });
    await next.session.start();
    assert.equal(next.streams[0].getAudioTracks()[0].enabled, true);
    next.session.stop();
});

test('permission rejection ends the call without a peer or dangling signaling listeners', async () => {
    const f = fixture({ getUserMedia: async () => { throw new Error('permission denied'); } });
    await f.session.answer();
    assert.deepEqual(f.errors, ['media']);
    assert.equal(f.ended, 1);
    assert.equal(f.peers.length, 0);
    assert.equal(f.socket.eventNames().length, 0);
});

test('PCM queued by the worklet is discarded after mic disable, track mute/end or capture stop', async () => {
    const track = media().getAudioTracks()[0];
    let node;
    let packets = 0;
    let disconnected = 0;
    const capture = createPcmCapture({
        context: { state: 'running', sampleRate: 48000, destination: {},
            createMediaStreamSource: () => ({ connect() {}, disconnect() { disconnected++; } }) },
        moduleReady: Promise.resolve(), track,
        MediaStreamClass: class { constructor(tracks) { this.tracks = tracks; } },
        WorkletNode: class {
            constructor() { node = this; this.port = { postMessage() {}, close() {} }; }
            connect() {} disconnect() { disconnected++; }
        },
        onPacket: () => packets++, onError: error => { throw error; },
    });
    await capture.ready;
    const queued = node.port.onmessage;
    queued({ data: new ArrayBuffer(4096) });
    track.enabled = false;
    queued({ data: new ArrayBuffer(4096) });
    track.enabled = true;
    track.muted = true;
    queued({ data: new ArrayBuffer(4096) });
    track.muted = false;
    track.readyState = 'ended';
    queued({ data: new ArrayBuffer(4096) });
    capture.stop();
    queued({ data: new ArrayBuffer(4096) });
    assert.equal(packets, 1);
    assert.equal(disconnected, 2);
    assert.equal(track.stops, 0, 'translation never owns or stops the WebRTC track');
});

test('both directions recognize the remote source, transcribe self in target language, and reject stale translations', () => {
    for (const [sourceLanguage, targetLanguage] of [['vi', 'en'], ['en', 'vi']]) {
        const pair = { kind: 'direct', sessionId: 'remote', sourceLanguage, targetLanguage };
        const remote = createTranslationRequest({ ...pair, speakerId: 'remote' });
        const self = createTranslationRequest({ ...pair, speakerId: 'self', isSelf: true });
        assert.equal(remote.sourceLanguage, sourceLanguage);
        assert.deepEqual([self.sourceLanguage, self.targetLanguage, self.translate], [targetLanguage, targetLanguage, false]);
        let notes = reduceTranslationNotes([], { ...remote, type: 'transcript', streamId: 'old', utteranceId: 'u1', revision: 1, original: 'Hello', isFinal: true }, '00:01');
        notes = interruptTranslationNotes(notes, 'old');
        const stale = { type: 'translation', streamId: 'old', utteranceId: 'u1', revision: 1, translated: 'stale' };
        assert.equal(reduceTranslationNotes(notes, stale), notes, 'stopped/changed direction cannot accept a late translation');
        notes = reduceTranslationNotes(notes, { ...self, type: 'transcript', streamId: 'self', utteranceId: 'u1', revision: 1, original: 'Hello', isFinal: false }, '00:02');
        const interrupted = interruptTranslationNotes(notes, 'self');
        assert.equal(interrupted.at(-1).translationState, 'interrupted');
        assert.equal(interrupted.at(-1).isFinal, true);
    }
});

test('two Vietnamese speakers can read English translations without forcing the viewer mic into English', () => {
    const request = createTranslationRequest({ kind: 'direct', sessionId: 'remote', speakerId: 'self',
        isSelf: true, selfLanguage: 'vi', sourceLanguage: 'vi', targetLanguage: 'en' });
    assert.deepEqual([request.sourceLanguage, request.targetLanguage, request.translate], ['vi', 'vi', false]);
    assert.throws(() => createTranslationRequest({ isSelf: true, selfLanguage: 'auto', sourceLanguage: 'vi', targetLanguage: 'en' }));
});

test('interleaved direct speech with matching utterance IDs stays attached to its own speaker, language and translation', async () => {
    const self = 'a'.repeat(24), remote = 'b'.repeat(24);
    const socket = new Socket();
    socket.id = 'isolated-translation-socket';
    socket.data = { userId: self };
    const session = { accepted: true };
    const upstream = [];
    const bridge = createTranslationPcmBridge({
        getSession: () => session,
        findSpeaker: async id => ({ displayName: id === self ? 'Self' : 'Remote' }),
        createWebSocket: () => {
            const ws = new EventEmitter();
            ws.terminate = () => {};
            ws.send = config => {
                ws.config = JSON.parse(config);
                queueMicrotask(() => ws.emit('message', Buffer.from(JSON.stringify({ type: 'ready',
                    sampleRate: 16000, channels: 1, packetSamples: 2048 })), false));
            };
            ws.receive = value => ws.emit('message', Buffer.from(JSON.stringify(value)), false);
            upstream.push(ws);
            queueMicrotask(() => ws.emit('open'));
            return ws;
        },
    });
    bridge.register(socket);
    try {
        const start = request => new Promise(resolve => socket.receive('translation:start', request, resolve));
        const pair = { kind: 'direct', sessionId: remote, sourceLanguage: 'vi', targetLanguage: 'en', selfLanguage: 'vi' };
        const remoteAck = await start(createTranslationRequest({ ...pair, speakerId: remote }));
        const selfAck = await start(createTranslationRequest({ ...pair, speakerId: self, isSelf: true }));
        assert.ok(remoteAck.ok && selfAck.ok);
        assert.notEqual(remoteAck.streamId, selfAck.streamId);
        assert.deepEqual(upstream.map(ws => ws.config), [
            { sourceLanguage: 'vi', targetLanguage: 'en' },
            { sourceLanguage: 'vi', targetLanguage: 'vi', translate: false },
        ]);
        const original = (value, final = false, revision = 1) => ({ type: 'transcript', utteranceId: 'u1', revision,
            original: value, sourceLanguage: 'vi', targetLanguage: 'vi', isFinal: final });
        upstream[1].receive(original('Tôi là người nhận'));
        upstream[0].receive({ ...original('Tôi là người gọi', true), targetLanguage: 'en' });
        upstream[1].receive(original('Tôi là người nhận cuộc gọi', true, 2));
        upstream[0].receive({ type: 'translation', utteranceId: 'u1', revision: 1, translated: 'I am the caller.' });
        const events = socket.sent.filter(([event]) => event === 'translation:event').map(([, value]) => value);
        const notes = events.reduce((state, event) => reduceTranslationNotes(state, event, '00:01'), []);
        assert.equal(notes.length, 2);
        assert.deepEqual(notes.map(note => [note.speakerId, note.original, note.translationState]), [
            [self, 'Tôi là người nhận cuộc gọi', 'self'], [remote, 'Tôi là người gọi', 'complete'],
        ]);
        assert.equal(notes[1].translated, 'I am the caller.');
        const late = upstream[0].listeners('message')[0];
        socket.receive('translation:stop', { streamId: remoteAck.streamId });
        late(Buffer.from(JSON.stringify({ type: 'translation', utteranceId: 'u1', revision: 1, translated: 'late' })), false);
        assert.equal(socket.sent.filter(([event]) => event === 'translation:event').length, events.length);
    } finally { bridge.dispose(); }
});
