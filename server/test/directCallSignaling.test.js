import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';

// Use isolated identities and a deliberately absent env file, never a real DB/key.
process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL('./no-test-env', import.meta.url));
process.env.ACCESS_TOKEN_SECRET = 'direct-call-isolated-test-key';
const { server, io, getTranslationSession } = await import('../src/socket/socket.js');
const requireClient = createRequire(new URL('../../client/package.json', import.meta.url));
const { io: connect } = requireClient('socket.io-client');

test('direct call signaling gates translation and mute by accepted session and revokes it on end', { timeout: 15000 }, async t => {
    const a = 'a'.repeat(24), b = 'b'.repeat(24), outsider = 'c'.repeat(24);
    const findById = User.findById;
    User.findById = id => ({ select: async () => ({ _id: id, displayName: 'Test user' }) });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const clients = [];
    t.after(async () => {
        clients.forEach(client => client.disconnect());
        await new Promise(resolve => io.close(resolve));
        User.findById = findById;
    });
    const client = async userId => {
        const socket = connect(`http://127.0.0.1:${server.address().port}`, {
            transports: ['websocket'], forceNew: true, reconnection: false,
            auth: { token: jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET) },
        });
        clients.push(socket);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Test socket connection timed out')), 3000);
            socket.once('connect', () => { clearTimeout(timer); resolve(); });
            socket.once('connect_error', error => { clearTimeout(timer); reject(error); });
        });
        return socket;
    };
    const first = await client(a), second = await client(b), third = await client(outsider);
    const barrier = async socket => {
        const done = once(socket, 'getOnlineUsers');
        socket.emit('setOnlineVisibility', true);
        await done;
    };
    const incoming = once(second, 'callUser');
    first.emit('callUser', { userToCall: b, from: outsider, signalData: { type: 'offer' } });
    assert.equal((await incoming)[0].from, a, 'identity comes from JWT');
    assert.equal(getTranslationSession('direct', b, a, b), null, 'ringing cannot be translated');
    const mediaEvents = [];
    second.on('callMediaState', event => mediaEvents.push(event));
    first.emit('callMediaState', { to: b, isMuted: true });
    await barrier(first);
    assert.equal(mediaEvents.length, 0, 'unaccepted call cannot relay media state');
    const answer = once(first, 'callAccepted');
    second.emit('answerCall', { to: a, signal: { type: 'answer' } });
    assert.deepEqual((await answer)[0], { type: 'answer' });
    const session = getTranslationSession('direct', b, a, b);
    assert.ok(session);
    assert.equal(getTranslationSession('direct', a, b, a), session);
    assert.equal(getTranslationSession('direct', b, a, a), session, 'self transcription is in the same call');
    assert.equal(getTranslationSession('direct', b, outsider, a), null);
    assert.equal(getTranslationSession('direct', b, a, outsider), null);
    const muted = once(second, 'callMediaState');
    first.emit('callMediaState', { to: b, isMuted: true, from: outsider });
    assert.deepEqual((await muted)[0], { from: a, isMuted: true });
    const unmuted = once(first, 'callMediaState');
    second.emit('callMediaState', { to: a, isMuted: false });
    assert.deepEqual((await unmuted)[0], { from: b, isMuted: false });
    const count = mediaEvents.length;
    third.emit('callMediaState', { to: b, isMuted: true, from: a });
    first.emit('callMediaState', { to: b, isMuted: 'true' });
    await Promise.all([barrier(third), barrier(first)]);
    assert.equal(mediaEvents.length, count, 'outsider and malformed state are ignored');
    let forcedEnd = false;
    second.on('endCall', () => { forcedEnd = true; });
    third.emit('endCall', { to: b });
    await barrier(third);
    assert.equal(forcedEnd, false, 'a nonparticipant cannot close another direct call');
    const ended = once(second, 'endCall');
    first.emit('endCall', { to: b });
    await ended;
    assert.equal(getTranslationSession('direct', b, a, b), null);
    first.emit('callMediaState', { to: b, isMuted: false });
    await barrier(first);
    assert.equal(mediaEvents.length, count, 'ended call cannot relay mute changes');
    const incomingAgain = once(second, 'callUser');
    first.emit('callUser', { userToCall: b, signalData: { type: 'offer' } });
    await incomingAgain;
    const acceptedAgain = once(first, 'callAccepted');
    second.emit('answerCall', { to: a, signal: { type: 'answer' } });
    await acceptedAgain;
    assert.notEqual(getTranslationSession('direct', b, a, b), session, 'calling the same peer creates a fresh permission reference');
    const disconnected = once(second, 'endCall');
    first.disconnect();
    await disconnected;
    assert.equal(getTranslationSession('direct', a, b, a), null);
});
