import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import Friend from '../src/models/Friend.js';
import Conversation from '../src/models/Conversation.js';
import Message from '../src/models/Message.js';
import conversationRoutes from '../src/routes/conversationRoute.js';
import messageRoutes from '../src/routes/messageRoute.js';
import friendRoutes from '../src/routes/friendRoute.js';
import { protectedRoute } from '../src/middlewares/authMiddleware.js';
import { app, io, server, isTranslationParticipant } from '../src/socket/socket.js';
import { io as connectSocket } from 'socket.io-client';
let mongo, baseUrl, users, group;
const sockets = [];

const request = async (path, user = users[0], method = 'GET', body) => {
    const response = await fetch(`${baseUrl}/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${jwt.sign({ userId: user._id.toString() }, process.env.ACCESS_TOKEN_SECRET)}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
};
const socketFor = async (user, query = {}) => {
    const socket = connectSocket(baseUrl, {
        auth: { token: jwt.sign({ userId: user._id.toString() }, process.env.ACCESS_TOKEN_SECRET) },
        query, transports: ['websocket'], forceNew: true,
    });
    sockets.push(socket);
    await once(socket, 'connect');
    return socket;
};
const eventFrom = (socket, event) => new Promise((resolve, reject) => {
    const handler = data => { clearTimeout(timer); resolve(data); };
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Missing ${event}`)); }, 5000);
    socket.once(event, handler);
});

before(async () => {
    process.env.ACCESS_TOKEN_SECRET = 'group-tests-only-not-a-production-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), Conversation.init()]);
    app.use(express.json());
    app.use('/api/conversations', protectedRoute, conversationRoutes);
    app.use('/api/messages', protectedRoute, messageRoutes);
    app.use('/api/friends', friendRoutes);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 300000 });

after(async () => {
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    await mongoose.disconnect();
    await mongo?.stop();
});

beforeEach(async () => {
    sockets.splice(0).forEach(socket => socket.disconnect());
    await Promise.all([Conversation.deleteMany({}), User.deleteMany({}), Message.deleteMany({}), Friend.deleteMany({})]);
    users = await User.create(['leader', 'member', 'other', 'invited'].map(name => ({
        displayName: name, username: name, email: `${name}@example.test`, password: 'test-only', isProfileComplete: true,
    })));
    group = await Conversation.create({ isGroup: true, group: { name: 'Legacy group', createdBy: users[0]._id },
        participants: users.slice(0, 3).map(user => ({ userId: user._id })) });
});

test('friend lists include real usernames for mentions without exposing private fields', async () => {
    await Friend.create({ userA: users[0]._id, userB: users[1]._id });
    assert.equal((await request('friends', null)).status, 401);
    for (const [viewer, friend] of [[users[0], users[1]], [users[1], users[0]]]) {
        const result = await request('friends', viewer);
        assert.equal(result.status, 200);
        assert.equal(result.data.friends.length, 1);
        assert.deepEqual(result.data.friends[0], {
            _id: friend.id,
            displayName: friend.displayName,
            username: friend.username,
            avatarURL: friend.avatarURL,
        });
    }
    assert.deepEqual((await request('friends', users[2])).data.friends, []);
});

test('legacy groups expose leader/member roles and correct join date', async () => {
    const { status, data } = await request('conversations');
    assert.equal(status, 200);
    const result = data.conversations.find(c => c._id === group.id);
    assert.equal(result.participants[0].role, 'leader');
    assert.equal(result.participants[1].role, 'member');
    assert.ok(result.participants[0].joinedAt);
});

test('new groups assign creator leadership and preserve direct conversations', async () => {
    await Friend.create(users.slice(1, 3).map(user => ({ userA: users[0]._id, userB: user._id })));
    const created = await request('conversations', users[0], 'POST', { isGroup: true, name: 'New group', memberIds: users.slice(1, 3).map(u => u.id) });
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.conversation.participants.map(p => p.role), ['leader', 'member', 'member']);
    const direct = await request('conversations', users[0], 'POST', { recipientId: users[1].id });
    assert.ok([200, 201].includes(direct.status));
    assert.equal(direct.data.conversation.isGroup, false);
    assert.equal((await request(`conversations/${direct.data.conversation._id}/messages`, users[1])).status, 200);
});

test('only the leader can manage a group and cannot remove themselves', async () => {
    const path = `conversations/${group.id}`;
    for (const [url, method, body] of [
        [`${path}/group`, 'PATCH', { name: 'Changed', descriptionGroup: '' }],
        [`${path}/group`, 'DELETE'], [`${path}/members/${users[2].id}`, 'DELETE'], [`${path}/invite`, 'POST'],
    ]) assert.equal((await request(url, users[1], method, body)).status, 403);
    assert.equal((await request(`${path}/members/${users[0].id.toUpperCase()}`, users[0], 'DELETE')).status, 400);
    assert.equal((await request(`${path}/group`, users[0], 'PATCH', { name: '  Edited group  ', descriptionGroup: 'Description' })).status, 200);
    assert.equal((await Conversation.findById(group.id)).group.name, 'Edited group');
    assert.equal((await request(`${path}/group`, users[0], 'PATCH', { name: '', descriptionGroup: '' })).status, 400);
});

test('URL invitation initializes once, hides token, and joins concurrently without duplicates', async () => {
    const invites = await Promise.all(Array.from({ length: 4 }, () => request(`conversations/${group.id}/invite`, users[1])));
    assert.ok(invites.every(invite => invite.status === 200 && invite.data.token === invites[0].data.token));
    const token = invites[0].data.token;
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal((await request(`conversations/invites/${token}`, null)).status, 401);
    const preview = await request(`conversations/invites/${token}`, users[3]);
    assert.equal(preview.data.group.isMember, false);
    assert.equal(preview.data.group.memberCount, 3);
    assert.equal(preview.data.group.participants, undefined);
    const joined = await Promise.all(Array.from({ length: 6 }, () => request(`conversations/invites/${token}/join`, users[3], 'POST')));
    assert.ok(joined.every(r => [200, 201].includes(r.status)));
    assert.equal(joined.filter(r => r.status === 201).length, 1);
    assert.equal((await Conversation.findById(group.id)).participants.length, 4);
    assert.equal(joined[0].data.conversation.group.inviteToken, undefined);
    assert.equal(joined[0].data.conversation.participants.find(p => p._id === users[3].id).role, 'member');
    assert.equal((await request(`conversations/invites/${token}`, users[3])).data.group.isMember, true);
    assert.equal((await request('conversations')).data.conversations[0].group.inviteToken, undefined);
});

test('rotating invitations invalidates both old URL and QR payload', async () => {
    const original = await request(`conversations/${group.id}/invite`);
    const rotated = await request(`conversations/${group.id}/invite`, users[0], 'POST');
    assert.notEqual(rotated.data.token, original.data.token);
    for (const method of ['GET', 'POST']) {
        const suffix = method === 'POST' ? '/join' : '';
        assert.equal((await request(`conversations/invites/${original.data.token}${suffix}`, users[3], method)).status, 404);
    }
    assert.equal((await request('conversations/invites/invalid')).status, 404);
    assert.equal((await request(`conversations/invites/${rotated.data.token}/join`, users[3], 'POST')).status, 201);
});

test('removed members lose message, media, pin, forwarding and direct-message bypass access', async () => {
    const msg = await Message.create({ conversationId: group._id, senderId: users[1]._id, content: 'Message' });
    await Conversation.updateOne({ _id: group.id }, { $set: { [`unreadCounts.${users[1].id}`]: 3 }, $push: { seenBy: users[1]._id } });
    assert.equal((await request(`conversations/${group.id}/members/${users[1].id}`, users[0], 'DELETE')).status, 200);
    for (const suffix of ['messages', 'media', 'pins']) assert.equal((await request(`conversations/${group.id}/${suffix}`, users[1])).status, 403);
    assert.equal((await request(`conversations/${group.id}/read`, users[1], 'PATCH')).status, 403);
    assert.equal((await request('messages/group', users[1], 'POST', { conversationId: group.id, content: 'Denied' })).status, 403);
    assert.equal((await request('messages/reaction', users[1], 'POST', { messageId: msg.id, reaction: 'like' })).status, 403);
    for (const action of ['recall', 'delete-for-me', 'pin']) assert.equal((await request(`messages/${msg.id}/${action}`, users[1], 'PUT')).status, 403);
    assert.equal((await request(`messages/${msg.id}/forward`, users[1], 'POST', { targetConversationIds: [group.id] })).status, 403);
    const another = await Conversation.create({ isGroup: true, group: { name: 'Another', createdBy: users[1]._id }, participants: [{ userId: users[1]._id }] });
    const source = await Message.create({ conversationId: another.id, senderId: users[1].id, content: 'Source' });
    assert.equal((await request(`messages/${source.id}/forward`, users[1], 'POST', { targetConversationIds: [group.id] })).status, 403);
    await Friend.create({ userA: users[0]._id, userB: users[1]._id });
    assert.equal((await request('messages/direct', users[1], 'POST', { recipientId: users[0].id, conversationId: group.id, content: 'Bypass' })).status, 403);
    const updated = await Conversation.findById(group.id);
    assert.equal(updated.unreadCounts.has(users[1].id), false);
    assert.equal(updated.seenBy.some(id => id.equals(users[1]._id)), false);
});

test('nonmembers and malformed IDs cannot read or manage conversations', async () => {
    assert.equal((await request(`conversations/${group.id}/media`, users[3])).status, 403);
    assert.equal((await request(`conversations/${group.id}/invite`, users[3])).status, 403);
    assert.equal((await request('conversations/invalid/messages')).status, 400);
});

test('live clients receive group updates/removal, spoofed identity cannot join calls', async () => {
    const member = await socketFor(users[1]);
    const leader = await socketFor(users[0]);
    const outsider = await socketFor(users[3], { userId: users[0].id });
    const error = eventFrom(outsider, 'groupCallError');
    outsider.emit('joinGroupCall', { conversationId: group.id, user: { _id: users[0].id } });
    assert.match((await error).message, /thành viên/);
    const entered = eventFrom(member, 'groupCallExistingUsers');
    member.emit('joinGroupCall', { conversationId: group.id, user: { _id: users[0].id } });
    await entered;
    assert.equal(io.sockets.adapter.rooms.get(`group-call-${group.id}`).has(member.id), true);
    const leaderEntered = eventFrom(leader, 'groupCallExistingUsers');
    leader.emit('joinGroupCall', { conversationId: group.id });
    await leaderEntered;
    assert.equal(isTranslationParticipant('group', group.id, users[1].id, users[0].id), true);
    const signalled = eventFrom(leader, 'groupCallSignal');
    member.emit('groupCallSignal', { to: leader.id, signal: { test: true }, fromUser: { name: 'Spoofed' } });
    assert.equal((await signalled).fromUser.name, 'member');
    const outsiderStatus = await outsider.emitWithAck('getGroupCallStatus', { conversationId: group.id });
    assert.equal(outsiderStatus.isActive, false);
    const outsiderCalls = await outsider.emitWithAck('getAllActiveGroupCalls');
    assert.deepEqual(outsiderCalls, {});
    const removed = eventFrom(member, 'conversationRemoved');
    const updated = eventFrom(leader, 'conversationUpdated');
    await request(`conversations/${group.id}/members/${users[1].id}`, users[0], 'DELETE');
    assert.equal((await removed).conversationId, group.id);
    assert.equal((await updated).participants.length, 2);
    assert.equal(io.sockets.adapter.rooms.get(`group-call-${group.id}`)?.has(member.id) || false, false);
    assert.equal(isTranslationParticipant('group', group.id, users[1].id, users[0].id), false);
    const errorAgain = eventFrom(member, 'groupCallError');
    member.emit('joinGroupCall', { conversationId: group.id, user: { _id: users[1].id } });
    await errorAgain;
});

test('Socket.IO requires a signed token and does not trust query userId', async () => {
    const socket = connectSocket(baseUrl, { query: { userId: users[0].id }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    const error = await eventFrom(socket, 'connect_error');
    assert.match(error.message, /đăng nhập/);
    assert.equal(socket.connected, false);
});

test('leader deletion removes history and invalidates all invitations', async () => {
    const { data: { token } } = await request(`conversations/${group.id}/invite`);
    await Message.create({ conversationId: group.id, senderId: users[0].id, content: 'History' });
    const result = await request(`conversations/${group.id}/group`, users[0], 'DELETE');
    assert.equal(result.status, 200);
    assert.equal(await Conversation.findById(group.id), null);
    assert.equal(await Message.countDocuments({ conversationId: group.id }), 0);
    assert.equal((await request(`conversations/invites/${token}/join`, users[3], 'POST')).status, 404);
});

const pauseCallMessageCreation = () => {
    const original = Message.create;
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let creations = 0;
    Message.create = async function (...args) {
        if (args[0]?.messageType === 'group_call' && args[0]?.callStatus === 'active') {
            creations += 1;
            entered();
            await gate;
        }
        return original.apply(this, args);
    };
    return { started, release, count: () => creations, restore: () => { Message.create = original; release(); } };
};

const eventually = async (check) => {
    const deadline = Date.now() + 3000;
    while (!await check()) {
        assert.ok(Date.now() < deadline, 'Condition did not settle');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
};

test('delegated admins can add and remove members while only the leader controls roles and deletion', async () => {
    const path = `conversations/${group.id}`;
    assert.equal((await request(`${path}/members/${users[1].id}/role`, users[1], 'PATCH', { role: 'admin' })).status, 403);
    const promoted = await request(`${path}/members/${users[1].id}/role`, users[0], 'PATCH', { role: 'admin' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.data.conversation.participants.find(p => p._id === users[1].id).role, 'admin');
    assert.equal((await request(`${path}/members/${users[0].id}/role`, users[0], 'PATCH', { role: 'member' })).status, 400);
    assert.equal((await request(`${path}/members/${users[0].id}`, users[1], 'DELETE')).status, 403);
    assert.equal((await request(`${path}/members/${users[2].id}/role`, users[1], 'PATCH', { role: 'admin' })).status, 403);
    assert.equal((await request(path, users[1], 'DELETE')).status, 403);
    assert.equal((await request(`${path}/members`, users[1], 'POST', { memberIds: ['malformed'] })).status, 400);
    assert.equal((await request(`${path}/members`, users[1], 'POST', { memberIds: [users[3].id] })).status, 200);
    assert.equal((await Conversation.findById(group.id)).participants.length, 4);
    assert.equal((await request(`${path}/members/${users[3].id}`, users[1], 'DELETE')).status, 200);
    assert.equal((await Conversation.findById(group.id)).participants.length, 3);
});

test('creator leaving transfers leadership to a delegated admin and revokes access', async () => {
    const path = `conversations/${group.id}`;
    await request(`${path}/members/${users[2].id}/role`, users[0], 'PATCH', { role: 'admin' });
    assert.equal((await request(`${path}/leave`, users[0], 'POST')).status, 200);
    const updated = await Conversation.findById(group.id);
    assert.equal(updated.group.createdBy.toString(), users[2].id);
    assert.equal(updated.participants.find(p => p.userId.toString() === users[2].id).role, 'leader');
    assert.equal((await request(`${path}/messages`, users[0])).status, 403);
    assert.equal((await request(`${path}/group`, users[2], 'PATCH', { name: 'Successor', descriptionGroup: '' })).status, 200);
});

test('QR join alias accepts secure and legacy invitations but never a conversation ID', async () => {
    const invitation = await request(`conversations/${group.id}/invite`);
    assert.equal(invitation.data.inviteCode, invitation.data.token);
    assert.equal((await request(`conversations/join/${group.id}`, users[3], 'POST')).status, 404);
    assert.equal((await request(`conversations/join/${invitation.data.inviteCode}`, users[3], 'POST')).status, 201);
    assert.equal((await request(`conversations/join/${invitation.data.inviteCode}`, users[3], 'POST')).status, 200);
    const legacyCode = new mongoose.Types.ObjectId().toString();
    await Conversation.updateOne({ _id: group.id }, { $set: { 'group.inviteCode': legacyCode } });
    assert.equal((await request(`conversations/invites/${legacyCode}`, users[3])).status, 200);
    const listed = (await request('conversations')).data.conversations[0];
    assert.equal(listed.group.inviteCode, undefined);
    await request(`conversations/${group.id}/invite`, users[0], 'POST');
    assert.equal((await request(`conversations/join/${legacyCode}`, users[3], 'POST')).status, 404);
});

test('polls preserve votes and leader/admin closing rights while removed members cannot interact', async () => {
    const path = `conversations/${group.id}`;
    assert.equal((await request('messages/poll', users[3], 'POST', { conversationId: group.id, question: 'Choose', options: ['A', 'B'] })).status, 403);
    assert.equal((await request('messages/poll', users[1], 'POST', { conversationId: group.id, question: {}, options: ['A', 'B'] })).status, 400);
    const created = await request('messages/poll', users[1], 'POST', { conversationId: group.id, question: 'Choose', options: ['A', 'B'] });
    assert.equal(created.status, 201);
    const poll = created.data.message;
    const url = `messages/${poll._id}`;
    assert.equal((await request(`${url}/vote`, users[2], 'POST', { optionId: poll.poll.options[0].id })).status, 200);
    assert.equal((await Message.findById(poll._id)).poll.options[0].votes[0].toString(), users[2].id);
    assert.equal((await request(`${url}/poll/close`, users[2], 'PUT')).status, 403);
    await request(`${path}/members/${users[1].id}`, users[0], 'DELETE');
    assert.equal((await request(`${url}/vote`, users[1], 'POST', { optionId: poll.poll.options[0].id })).status, 403);
    assert.equal((await request(`${url}/poll/close`, users[1], 'PUT')).status, 403);
    assert.equal((await request(`${url}/poll/close`, users[0], 'PUT')).status, 200);
    assert.equal((await request(`${url}/vote`, users[2], 'POST', { optionId: poll.poll.options[0].id })).status, 400);
    const next = await request('messages/poll', users[0], 'POST', { conversationId: group.id, question: 'Next', options: ['A', 'B'] });
    await request(`${path}/members/${users[2].id}/role`, users[0], 'PATCH', { role: 'admin' });
    assert.equal((await request(`messages/${next.data.message._id}/poll/close`, users[2], 'PUT')).status, 200);
});

test('group call IDs and ended history survive membership guards', async () => {
    const member = await socketFor(users[1]);
    const leader = await socketFor(users[0]);
    const incoming = eventFrom(leader, 'incomingGroupCall');
    const entered = eventFrom(member, 'groupCallExistingUsers');
    member.emit('joinGroupCall', { conversationId: group.id });
    await entered;
    const call = await incoming;
    assert.ok(call.callId);
    assert.equal((await member.emitWithAck('getGroupCallStatus', { conversationId: group.id })).callId, call.callId);
    const oldCallError = eventFrom(leader, 'groupCallError');
    leader.emit('joinGroupCall', { conversationId: group.id, callId: new mongoose.Types.ObjectId().toString() });
    await oldCallError;
    const updated = eventFrom(leader, 'messageUpdated');
    member.emit('leaveGroupCall', { conversationId: group.id });
    const message = await updated;
    assert.equal(message.callId, call.callId);
    assert.equal(message.callStatus, 'ended');
    assert.ok(message.endedAt);
    const endedCallError = eventFrom(leader, 'groupCallError');
    leader.emit('joinGroupCall', { conversationId: group.id, callId: call.callId });
    await endedCallError;
});

test('removal during delayed call creation cannot admit or announce a revoked socket', async () => {
    const member = await socketFor(users[1]);
    const leader = await socketFor(users[0]);
    const delay = pauseCallMessageCreation();
    let announced = false;
    leader.on('incomingGroupCall', () => { announced = true; });
    try {
        const denied = eventFrom(member, 'groupCallError');
        const ended = eventFrom(leader, 'messageUpdated');
        member.emit('joinGroupCall', { conversationId: group.id });
        await delay.started;
        assert.equal((await request(`conversations/${group.id}/members/${users[1].id}`, users[0], 'DELETE')).status, 200);
        delay.release();
        assert.match((await denied).message, /thành viên/);
        assert.equal((await ended).callStatus, 'ended');
        assert.equal(io.sockets.adapter.rooms.get(`group-call-${group.id}`)?.has(member.id) || false, false);
        assert.equal(isTranslationParticipant('group', group.id, users[1].id, users[0].id), false);
        assert.equal(announced, false);
        assert.equal((await leader.emitWithAck('getGroupCallStatus', { conversationId: group.id })).isActive, false);
    } finally { delay.restore(); }
});

test('deleted group cannot regain call history after delayed creation resumes', async () => {
    const member = await socketFor(users[1]);
    const leader = await socketFor(users[0]);
    const delay = pauseCallMessageCreation();
    let announced = false;
    leader.on('incomingGroupCall', () => { announced = true; });
    try {
        const denied = eventFrom(member, 'groupCallError');
        member.emit('joinGroupCall', { conversationId: group.id });
        await delay.started;
        assert.equal((await request(`conversations/${group.id}/group`, users[0], 'DELETE')).status, 200);
        delay.release();
        await denied;
        await eventually(async () => await Message.countDocuments({ conversationId: group.id }) === 0);
        assert.equal(await Conversation.findById(group.id), null);
        assert.equal(io.sockets.adapter.rooms.get(`group-call-${group.id}`)?.has(member.id) || false, false);
        assert.equal(announced, false);
    } finally { delay.restore(); }
});

test('disconnect during delayed call initialization cannot join a room or notify members', async () => {
    const member = await socketFor(users[1]);
    const leader = await socketFor(users[0]);
    const delay = pauseCallMessageCreation();
    let announced = false;
    leader.on('incomingGroupCall', () => { announced = true; });
    try {
        const ended = eventFrom(leader, 'messageUpdated');
        member.emit('joinGroupCall', { conversationId: group.id });
        await delay.started;
        const serverSocket = io.sockets.sockets.get(member.id);
        const disconnected = once(serverSocket, 'disconnect');
        member.disconnect();
        await disconnected;
        delay.release();
        assert.equal((await ended).callStatus, 'ended');
        assert.equal(io.sockets.adapter.rooms.has(`group-call-${group.id}`), false);
        assert.equal(announced, false);
        assert.equal((await leader.emitWithAck('getGroupCallStatus', { conversationId: group.id })).isActive, false);
    } finally { delay.restore(); }
});

test('concurrent valid joins share one initialization and one active call message', async () => {
    const member = await socketFor(users[1]);
    const leader = await socketFor(users[0]);
    const delay = pauseCallMessageCreation();
    try {
        const firstEntered = eventFrom(member, 'groupCallExistingUsers');
        const secondEntered = eventFrom(leader, 'groupCallExistingUsers');
        member.emit('joinGroupCall', { conversationId: group.id });
        await delay.started;
        leader.emit('joinGroupCall', { conversationId: group.id });
        delay.release();
        await Promise.all([firstEntered, secondEntered]);
        assert.equal(delay.count(), 1);
        assert.equal(await Message.countDocuments({ conversationId: group.id, messageType: 'group_call', callStatus: 'active' }), 1);
        const status = await leader.emitWithAck('getGroupCallStatus', { conversationId: group.id });
        assert.equal(status.participants.length, 2);
        assert.equal(isTranslationParticipant('group', group.id, users[1].id, users[0].id), true);
        const ended = eventFrom(leader, 'messageUpdated');
        member.emit('leaveGroupCall', { conversationId: group.id });
        leader.emit('leaveGroupCall', { conversationId: group.id });
        assert.equal((await ended).callStatus, 'ended');
    } finally { delay.restore(); }
});
