import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as connect } from 'socket.io-client';
import User from '../src/models/User.js';
import Conversation from '../src/models/Conversation.js';

process.env.ACCESS_TOKEN_SECRET = 'translation-route-test-only';
process.env.TRANSLATION_AI_KEY = 'translation-ai-test-only';
const { app, server, io } = await import('../src/socket/socket.js');
const { protectedRoute } = await import('../src/middlewares/authMiddleware.js');
let mongo, aiServer, baseUrl, users, aiHandler, aiCalls;
const clients = [];
const result = { original: 'Hello', translated: 'Xin chào', source_language: 'en' };

const listen = async server => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
};
const event = (socket, name, predicate = () => true) => new Promise((resolve, reject) => {
    const handler = value => {
        if (!predicate(value)) return;
        socket.off(name, handler);
        clearTimeout(timer);
        resolve(value);
    };
    const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Missing ${name}`)); }, 5000);
    socket.on(name, handler);
});
const token = user => jwt.sign({ userId: user.id }, process.env.ACCESS_TOKEN_SECRET);
const socketFor = async user => {
    const client = connect(baseUrl, { auth: { token: token(user) }, reconnection: false, transports: ['websocket'] });
    clients.push(client);
    await event(client, 'connect');
    return client;
};
const startCall = async (alice, bob, accept = true) => {
    const incoming = event(bob, 'callUser');
    alice.emit('callUser', { userToCall: users[1].id, signalData: {} });
    await incoming;
    if (accept) {
        const accepted = event(alice, 'callAccepted');
        bob.emit('answerCall', { to: users[0].id, signal: {} });
        await accepted;
    }
};
const directCall = async (accept = true) => {
    const alice = await socketFor(users[0]);
    const bob = await socketFor(users[1]);
    await startCall(alice, bob, accept);
    return { alice, bob };
};
const chunk = async (fields = {}, { user = users[0], type = 'audio/webm', content = 'test-clip', signal } = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
        kind: 'direct', sessionId: users[1].id, speakerId: users[1].id,
        targetLanguage: 'vi', sourceLanguage: 'en', ...fields,
    })) form.append(key, value);
    form.append('audio', new Blob([content], { type }), 'clip.webm');
    const response = await fetch(`${baseUrl}/api/translation/chunk`, {
        method: 'POST', body: form, signal,
        headers: user ? { Authorization: `Bearer ${token(user)}` } : {},
    });
    return { status: response.status, body: await response.json() };
};
const pauseAi = () => {
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    aiHandler = async (_req, res) => { started.resolve(); await release.promise; res.json(result); };
    return { started: started.promise, release: release.resolve };
};

before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const ai = express();
    ai.get('/health', (_req, res) => res.json({ status: 'ready' }));
    ai.post('/translate', multer({ storage: multer.memoryStorage() }).single('audio'), (req, res) => {
        aiCalls += 1;
        assert.equal(req.headers['x-api-key'], 'translation-ai-test-only');
        return aiHandler(req, res);
    });
    aiServer = ai.listen();
    await once(aiServer, 'listening');
    process.env.TRANSLATION_AI_URL = `http://127.0.0.1:${aiServer.address().port}`;
    const { default: route } = await import('../src/routes/translationRoute.js');
    app.use('/api/translation', protectedRoute, route);
    baseUrl = await listen(server);
}, { timeout: 300000 });

after(async () => {
    clients.forEach(client => client.close());
    await new Promise(resolve => io.close(resolve));
    await new Promise(resolve => aiServer?.close(resolve));
    await mongoose.disconnect();
    await mongo?.stop();
});

beforeEach(async () => {
    clients.splice(0).forEach(client => client.close());
    await User.deleteMany({});
    users = await User.create(['alice', 'bob', 'outsider'].map(name => ({
        displayName: name, username: name, email: `${name}@example.test`, password: 'test-only', isProfileComplete: true,
    })));
    aiCalls = 0;
    aiHandler = (_req, res) => res.json(result);
});

test('translation REST requires a JWT and both accepted-call participants', async () => {
    await directCall(false);
    assert.equal((await chunk({}, { user: null })).status, 401);
    assert.equal((await chunk()).status, 403);
    assert.equal((await chunk({}, { user: users[2] })).status, 403);
    assert.equal(aiCalls, 0);
});

test('caller cannot accept their own outgoing call to enable translation', async () => {
    const { alice } = await directCall(false);
    alice.emit('answerCall', { to: users[1].id, signal: {} });
    await alice.emitWithAck('getAllActiveGroupCalls');
    assert.equal((await chunk()).status, 403);
    assert.equal(aiCalls, 0);
});

test('valid clip preserves speaker and language fields through the proxy', async () => {
    await directCall();
    aiHandler = (req, res) => {
        assert.equal(req.file.mimetype, 'audio/webm');
        assert.equal(req.file.buffer.toString(), 'test-clip');
        assert.equal(req.body.source_language, 'auto');
        assert.equal(req.body.target_language, 'vi');
        res.json(result);
    };
    const response = await chunk({ sourceLanguage: 'auto' }, { type: 'audio/webm;codecs=opus' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
        speakerId: users[1].id, speakerName: 'bob', original: 'Hello', translated: 'Xin chào',
        sourceLanguage: 'en', targetLanguage: 'vi',
    });
    assert.equal((await chunk({ speakerId: users[2].id })).status, 403);
    assert.equal(aiCalls, 1);
});

test('invalid MIME, oversized and empty clips return JSON before contacting AI', async () => {
    await directCall();
    const emptyRequest = await fetch(`${baseUrl}/api/translation/chunk`, {
        method: 'POST', headers: { Authorization: `Bearer ${token(users[0])}` },
    });
    assert.equal(emptyRequest.status, 400);
    assert.equal((await chunk({}, { type: 'text/plain' })).status, 400);
    assert.equal((await chunk({}, { content: Buffer.alloc(2 * 1024 * 1024 + 1) })).status, 413);
    assert.equal((await chunk({}, { content: '' })).status, 400);
    assert.equal((await chunk({ targetLanguage: 'fr' })).status, 400);
    assert.equal(aiCalls, 0);
});

test('AI validation and timeout errors settle without returning inference details', async () => {
    await directCall();
    for (const status of [400, 413, 422, 503, 504]) {
        aiHandler = (_req, res) => res.status(status).json({ detail: 'private upstream detail' });
        const response = await chunk();
        assert.equal(response.status, status);
        assert.equal(typeof response.body.message, 'string');
        assert.ok(!JSON.stringify(response.body).includes('private upstream detail'));
    }
});

test('ending a direct call revokes a clip already being processed', async () => {
    const { alice, bob } = await directCall();
    const gate = pauseAi();
    const response = chunk();
    try {
        await gate.started;
        const ended = event(bob, 'endCall');
        alice.emit('endCall', { to: users[1].id });
        await ended;
    } finally { gate.release(); }
    assert.equal((await response).status, 403);
});

test('a new call with the same peer cannot receive the previous call translation', async () => {
    const { alice, bob } = await directCall();
    const gate = pauseAi();
    const response = chunk();
    try {
        await gate.started;
        const ended = event(bob, 'endCall');
        alice.emit('endCall', { to: users[1].id });
        await ended;
        await startCall(alice, bob);
    } finally { gate.release(); }
    assert.equal((await response).status, 403);
});

test('group REST requires viewer and speaker in the active call, even for group members', async () => {
    const group = await Conversation.create({
        isGroup: true, group: { name: 'Translation test', createdBy: users[0]._id },
        participants: users.map(user => ({ userId: user._id })),
    });
    const alice = await socketFor(users[0]);
    const bob = await socketFor(users[1]);
    for (const socket of [alice, bob]) {
        const joined = event(socket, 'groupCallExistingUsers');
        socket.emit('joinGroupCall', { conversationId: group.id });
        await joined;
    }
    const fields = { kind: 'group', sessionId: group.id };
    assert.equal((await chunk(fields)).status, 200);
    assert.equal((await chunk({ ...fields, speakerId: users[2].id })).status, 403);
    assert.equal((await chunk(fields, { user: users[2] })).status, 403);
    const gate = pauseAi();
    const pending = chunk(fields);
    try {
        await gate.started;
        const left = event(alice, 'groupCallUserLeft');
        bob.emit('leaveGroupCall', { conversationId: group.id });
        await left;
    } finally { gate.release(); }
    assert.equal((await pending).status, 403);
    const ended = event(alice, 'groupCallStatusChanged', payload => !payload.isActive);
    const updated = event(alice, 'messageUpdated', message => message.callStatus === 'ended');
    alice.emit('leaveGroupCall', { conversationId: group.id });
    await Promise.all([ended, updated]);
});

test('closing the HTTP request aborts the upstream inference request', async () => {
    await directCall();
    const started = Promise.withResolvers();
    const closed = Promise.withResolvers();
    aiHandler = (_req, res) => {
        res.once('close', closed.resolve);
        started.resolve();
    };
    const controller = new AbortController();
    const pending = chunk({}, { signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await started.promise;
    controller.abort();
    await rejected;
    await Promise.race([
        closed.promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Upstream was not aborted')), 3000)),
    ]);
});
