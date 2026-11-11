import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Conversation from '../src/models/Conversation.js';
import Message from '../src/models/Message.js';

process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL('./no-test-env', import.meta.url));
process.env.ACCESS_TOKEN_SECRET = 'group-language-isolated-test-key';
const { server, io, getTranslationSession } = await import('../src/socket/socket.js');
const requireClient = createRequire(new URL('../../client/package.json', import.meta.url));
const { io: connect } = requireClient('socket.io-client');

test('real group signaling owns language by socket attendance, propagates revisions and rejects stale changes after rejoin', { timeout: 15000 }, async t => {
    const ids = ['a', 'b', 'c', 'e'].map(c => c.repeat(24));
    const room = 'd'.repeat(24);
    const conversation = { _id: room, isGroup: true, participants: ids.slice(0, 3).map(userId => ({ userId })),
        group: { name: 'Isolated group' }, set() {}, save: async () => {} };
    const message = { _id: 'f'.repeat(24), senderId: ids[0], createdAt: new Date(), content: 'fixture', messageType: 'group_call' };
    const originals = [User.findById, Conversation.findById, Conversation.exists, Message.create, Message.findById, Message.deleteOne];
    User.findById = id => ({ select: async () => ({ _id: id, displayName: `Test ${id[0]}` }) });
    Conversation.findById = () => ({ then: resolve => Promise.resolve(conversation).then(resolve), select: async () => conversation });
    Conversation.exists = async () => false;
    Message.create = async () => message;
    Message.findById = () => ({ populate: async () => message });
    Message.deleteOne = async () => {};
    const clients = [];
    t.after(async () => {
        clients.forEach(socket => socket.disconnect());
        await new Promise(resolve => io.close(resolve));
        await new Promise(resolve => setImmediate(resolve));
        [User.findById, Conversation.findById, Conversation.exists, Message.create, Message.findById, Message.deleteOne] = originals;
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    for (const userId of ids) {
        const socket = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], forceNew: true, reconnection: false,
            auth: { token: jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET) } });
        clients.push(socket);
        await once(socket, 'connect');
    }
    const join = async (socket, spokenLanguage) => {
        const joined = once(socket, 'groupCallExistingUsers');
        socket.emit('joinGroupCall', { conversationId: room, spokenLanguage });
        return (await joined)[0];
    };
    const [alice, bob, carol, outsider] = clients;
    const a = await join(alice, 'vi');
    const b = await join(bob, 'en');
    const c = await join(carol, 'vi');
    assert.equal(c.participants.length, 2);
    assert.deepEqual(c.participants.map(p => p.spokenLanguage).sort(), ['en', 'vi']);
    const session = getTranslationSession('group', room, ids[0], ids[1]);
    assert.equal(session.participants.size, 3);
    const update = (socket, payload) => new Promise((resolve, reject) => socket.timeout(2000).emit('groupCallSetLanguage', payload,
        (error, answer) => error ? reject(error) : resolve(answer)));
    const payload = { conversationId: room, callId: b.callId, attendanceId: b.self.attendanceId, spokenLanguage: 'vi' };
    assert.equal((await update(outsider, payload)).status, 403);
    assert.equal((await update(alice, payload)).status, 403, 'cannot update Bob using Alice JWT');
    assert.equal((await update(bob, { ...payload, spokenLanguage: 'auto' })).status, 400);
    const changed = once(alice, 'groupCallLanguageChanged');
    const oldMember = session.participants.get(bob.id);
    const result = await update(bob, payload);
    assert.equal(result.ok, true);
    assert.equal(result.participant.languageRevision, 1);
    assert.notEqual(session.participants.get(bob.id), oldMember, 'old async authorization references are revoked');
    assert.equal((await changed)[0].participant.spokenLanguage, 'vi');
    assert.equal(session.participants.get(alice.id).spokenLanguage, 'vi');
    const signal = once(carol, 'groupCallSignal');
    bob.emit('groupCallSignal', { to: carol.id, signal: { type: 'offer' }, fromUser: { spokenLanguage: 'en' } });
    assert.equal((await signal)[0].fromUser.spokenLanguage, 'vi', 'signaling metadata comes from server attendance');
    const left = once(alice, 'groupCallUserLeft');
    bob.emit('leaveGroupCall', { conversationId: room });
    await left;
    assert.equal(session.participants.has(bob.id), false);
    assert.equal((await update(bob, payload)).status, 403);
    const again = await join(bob, 'en');
    assert.notEqual(again.self.attendanceId, b.self.attendanceId);
    assert.equal((await update(bob, payload)).status, 403, 'an old attendance cannot change a new join on the same socket');
    assert.equal(session.participants.get(bob.id).spokenLanguage, 'en');
    assert.equal(a.callId, c.callId);

    const leftAgain = once(alice, 'groupCallUserLeft');
    bob.emit('leaveGroupCall', { conversationId: room });
    await leftAgain;
    let release;
    const lookup = Conversation.findById;
    Conversation.findById = () => {
        Conversation.findById = lookup;
        return new Promise(resolve => { release = () => resolve(conversation); });
    };
    let lateAdmission = false;
    bob.on('groupCallExistingUsers', () => { lateAdmission = true; });
    bob.emit('joinGroupCall', { conversationId: room, spokenLanguage: 'vi' });
    bob.emit('leaveGroupCall', { conversationId: room });
    const barrier = once(bob, 'getOnlineUsers');
    bob.emit('setOnlineVisibility', true);
    await barrier;
    assert.equal(typeof release, 'function');
    release();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => bob.emit('getGroupCallStatus', { conversationId: room }, resolve));
    assert.equal(lateAdmission, false, 'leaving while a join lookup is pending must cancel admission');
    assert.equal(session.participants.has(bob.id), false);
});
