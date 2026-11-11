import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTranslationPcmBridge } from '../src/socket/translationPcm.js';
import { conversationTranslationSources, createTranslationRequest } from '../../client/src/components/chat/translationStream.js';
import { reduceTranslationNotes } from '../../client/src/components/chat/translationNotesState.js';

const room = 'd'.repeat(24);
const member = (id, socketId, spokenLanguage) => ({ userId: id.repeat(24), socketId, spokenLanguage,
    attendanceId: id.repeat(24), languageRevision: 0 });
class Socket extends EventEmitter {
    connected = true;
    sent = [];
    emit(event, ...args) { this.sent.push([event, ...args]); }
    receive(event, ...args) { super.emit(event, ...args); }
}
function fixture(options = {}) {
    const members = [member('a', 'alice', 'vi'), member('b', 'bob', 'en'), member('c', 'carol', 'vi')];
    const session = { participants: new Map(members.map(p => [p.socketId, p])) };
    const upstream = [];
    const bridge = createTranslationPcmBridge({
        getSession: () => session,
        findSpeaker: async id => ({ displayName: `Speaker ${id[0]}` }),
        createWebSocket: () => {
            const ws = new EventEmitter();
            ws.terminate = () => { ws.terminated = true; };
            ws.send = config => {
                ws.config = JSON.parse(config);
                queueMicrotask(() => ws.receive({ type: 'ready', sampleRate: 16000, channels: 1, packetSamples: 2048 }));
            };
            ws.receive = value => ws.emit('message', Buffer.from(JSON.stringify(value)), false);
            upstream.push(ws);
            queueMicrotask(() => ws.emit('open'));
            return ws;
        }, ...options,
    });
    const sockets = members.map(p => {
        const socket = new Socket();
        socket.id = p.socketId;
        socket.data = { userId: p.userId };
        bridge.register(socket);
        return socket;
    });
    const request = (viewer, speaker, targetLanguage) => createTranslationRequest({ kind: 'group', sessionId: room,
        speakerId: speaker.userId, sourceLanguage: speaker.spokenLanguage, targetLanguage,
        speakerSocketId: speaker.socketId, speakerAttendanceId: speaker.attendanceId,
        speakerLanguageRevision: speaker.languageRevision, viewerAttendanceId: viewer.attendanceId });
    const start = (socket, payload) => new Promise(resolve => socket.receive('translation:start', payload, resolve));
    return { members, session, upstream, bridge, sockets, request, start };
}

test('three mixed-language speakers route ASR per speaker and MT per reader; original-only peers keep their identity', async () => {
    const f = fixture();
    try {
        const [alice, bob, carol] = f.members;
        // Alice reads Vietnamese; Carol reads English, independently of what either speaks.
        for (const [viewer, speaker, target, socket] of [
            [alice, alice, 'vi', f.sockets[0]], [alice, bob, 'vi', f.sockets[0]], [alice, carol, 'vi', f.sockets[0]],
            [carol, alice, 'en', f.sockets[2]], [carol, bob, 'en', f.sockets[2]], [carol, carol, 'en', f.sockets[2]],
        ]) assert.equal((await f.start(socket, f.request(viewer, speaker, target))).ok, true);
        assert.deepEqual(f.upstream.map(ws => ws.config), [
            { sourceLanguage: 'vi', targetLanguage: 'vi', translate: false },
            { sourceLanguage: 'en', targetLanguage: 'vi' },
            { sourceLanguage: 'vi', targetLanguage: 'vi', translate: false },
            { sourceLanguage: 'vi', targetLanguage: 'en' },
            { sourceLanguage: 'en', targetLanguage: 'en', translate: false },
            { sourceLanguage: 'vi', targetLanguage: 'en' },
        ]);
        for (const index of [2, 1, 0]) {
            const ws = f.upstream[index];
            ws.receive({ type: 'transcript', utteranceId: 'u1', revision: 1, isFinal: true, original: `speech-${index}`, ...ws.config });
            if (ws.config.translate !== false) ws.receive({ type: 'translation', utteranceId: 'u1', revision: 1, translated: `translation-${index}` });
        }
        const events = f.sockets[0].sent.filter(([name]) => name === 'translation:event').map(([, event]) => event);
        const notes = events.reduce((previous, event) => reduceTranslationNotes(previous, event, '00:01'), []);
        assert.equal(notes.length, 3);
        assert.deepEqual(notes.map(n => [n.speakerId, n.speakerSocketId, n.original, n.translated]), [
            [carol.userId, 'carol', 'speech-2', undefined], [bob.userId, 'bob', 'speech-1', 'translation-1'], [alice.userId, 'alice', 'speech-0', undefined],
        ]);
        assert.equal(notes[0].translate, false, 'a same-language remote speaker has no MT job');
    } finally { f.bridge.dispose(); }
});

test('group start rejects forged source language, stale revision/attendance and another socket pretending to be the viewer', async () => {
    const f = fixture();
    try {
        const [alice, bob] = f.members;
        const valid = f.request(alice, bob, 'vi');
        for (const patch of [
            { sourceLanguage: 'vi', translate: false }, { speakerLanguageRevision: 1 },
            { speakerAttendanceId: 'e'.repeat(24) }, { viewerAttendanceId: 'e'.repeat(24) },
        ]) assert.equal((await f.start(f.sockets[0], { ...valid, ...patch })).status, 409);
        assert.equal((await f.start(f.sockets[0], { ...valid, speakerSocketId: 'carol' })).status, 403);
        assert.equal((await f.start(f.sockets[0], { ...valid, speakerSocketId: undefined })).status, 403);
        assert.equal(f.upstream.length, 0);
        assert.equal(f.bridge.size, 0);
    } finally { f.bridge.dispose(); }
});

test('speaker language change closes only affected streams and rejects late results even when the language changes back', async () => {
    const f = fixture();
    try {
        const [alice, bob, carol] = f.members;
        const old = f.request(alice, bob, 'vi');
        await f.start(f.sockets[0], old);
        await f.start(f.sockets[0], f.request(alice, carol, 'vi'));
        const late = f.upstream[0].listeners('message')[0];
        const changed = { ...bob, spokenLanguage: 'vi', languageRevision: 1 };
        f.session.participants.set('bob', changed);
        f.bridge.invalidateGroupParticipant(room, 'bob');
        assert.equal(f.upstream[0].terminated, true);
        assert.equal(f.upstream[1].terminated, undefined);
        assert.equal(f.bridge.size, 1);
        const before = f.sockets[0].sent.length;
        late(Buffer.from(JSON.stringify({ type: 'transcript', utteranceId: 'u1', revision: 1, original: 'stale', isFinal: true, sourceLanguage: 'en', targetLanguage: 'vi' })), false);
        assert.equal(f.sockets[0].sent.length, before);
        assert.equal((await f.start(f.sockets[0], old)).status, 409);
        const ack = await f.start(f.sockets[0], f.request(alice, changed, 'vi'));
        assert.equal(ack.ok, true);
        assert.deepEqual(f.upstream.at(-1).config, { sourceLanguage: 'vi', targetLanguage: 'vi', translate: false });
        f.session.participants.set('bob', { ...changed, spokenLanguage: 'en', languageRevision: 2 });
        assert.equal((await f.start(f.sockets[0], old)).status, 409, 'an old revision cannot revive after toggling back');
    } finally { f.bridge.dispose(); }
});

test('leave/rejoin on the same socket revokes pending lookup and stale viewer requests', async () => {
    let release;
    const f = fixture({ findSpeaker: () => new Promise(resolve => { release = resolve; }) });
    try {
        const [alice, bob] = f.members;
        const pending = f.start(f.sockets[0], f.request(alice, bob, 'vi'));
        f.session.participants.delete('bob');
        f.bridge.invalidateGroupParticipant(room, 'bob');
        assert.equal((await pending).status, 409);
        f.session.participants.set('bob', { ...bob, attendanceId: 'f'.repeat(24) });
        release({ displayName: 'Bob' });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.upstream.length, 0, 'a canceled lookup cannot open an AI connection');
        f.session.participants.set('alice', { ...alice, attendanceId: 'e'.repeat(24) });
        assert.equal((await f.start(f.sockets[0], f.request(alice, f.session.participants.get('bob'), 'vi'))).status, 409);
    } finally { f.bridge.dispose(); }
});

test('group sources keep separate sockets of one user and skip undeclared, muted or ended tracks', () => {
    const track = { enabled: true, muted: false, readyState: 'live' };
    const stream = { getAudioTracks: () => [track] };
    const source = { id: 'a'.repeat(24), stream, socketId: 'one', attendanceId: 'a'.repeat(24), spokenLanguage: 'vi', languageRevision: 0 };
    const sources = [source, { ...source, socketId: 'two' }, { ...source, socketId: 'three', spokenLanguage: null }, { ...source, socketId: 'four', muted: true }];
    const result = conversationTranslationSources(sources, source.id, 'group');
    assert.equal(result.length, 2);
    assert.notEqual(result[0].key, result[1].key);
    track.readyState = 'ended';
    assert.deepEqual(conversationTranslationSources(sources, source.id, 'group'), []);
});
