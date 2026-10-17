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
let mongo, aiServer, baseUrl, users, aiHandler, aiCalls, aiHealthHandler, aiHealthCalls;
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
const chunk = async (fields = {}, { user = users[0], type = 'audio/webm', content = 'test-clip', signal, stream = false } = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
        kind: 'direct', sessionId: users[1].id, speakerId: users[1].id,
        targetLanguage: 'vi', sourceLanguage: 'en', ...fields,
    })) form.append(key, value);
    form.append('audio', new Blob([content], { type }), 'clip.webm');
    const response = await fetch(`${baseUrl}/api/translation/${stream ? 'chunk-stream' : 'chunk'}`, {
        method: 'POST', body: form, signal,
        headers: user ? { Authorization: `Bearer ${token(user)}` } : {},
    });
    return stream ? response : { status: response.status, body: await response.json() };
};
const transcript = { type: 'transcript', original: 'Hello', source_language: 'en' };
const translation = { type: 'translation', translated: 'Xin chào' };
const ndjson = value => `${JSON.stringify(value)}\n`;
const within = async promise => {
    let timer;
    try {
        return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Stream did not settle')), 3000);
        })]);
    } finally { clearTimeout(timer); }
};
const lines = response => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    return {
        reader,
        async next() {
            while (!pending.includes('\n')) {
                const { value, done } = await reader.read();
                if (done) { assert.equal(pending, ''); return null; }
                pending += decoder.decode(value, { stream: true });
            }
            const newline = pending.indexOf('\n');
            const value = JSON.parse(pending.slice(0, newline));
            pending = pending.slice(newline + 1);
            return value;
        },
    };
};
const pauseTranslation = () => {
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    aiHandler = async (req, res) => {
        assert.equal(req.body.stream, 'true');
        res.set('Content-Type', 'application/x-ndjson');
        res.write(ndjson(transcript));
        started.resolve();
        await release.promise;
        if (!res.destroyed) res.end(ndjson(translation));
    };
    return { started: started.promise, release: release.resolve };
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
    ai.get('/health', (req, res) => {
        aiHealthCalls += 1;
        assert.equal(req.headers['x-api-key'], 'translation-ai-test-only');
        return aiHealthHandler(req, res);
    });
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
    aiHealthCalls = 0;
    aiHandler = (_req, res) => res.json(result);
    aiHealthHandler = (_req, res) => res.json({ status: 'ready' });
});

test('transcription readiness ignores text-model loading and rejects invalid modes before AI', async () => {
    aiHealthHandler = (req, res) => {
        if (req.query.mode === 'transcribe') return res.json({ status: 'ready' });
        assert.equal(req.query.mode, undefined);
        return res.status(503).json({ detail: { status: 'loading' } });
    };
    const health = query => fetch(`${baseUrl}/api/translation/health${query}`, {
        headers: { Authorization: `Bearer ${token(users[0])}` },
    });
    const transcriptionReady = await health('?mode=transcribe');
    assert.equal(transcriptionReady.status, 200);
    assert.deepEqual(await transcriptionReady.json(), { status: 'ready' });
    const allModels = await health('');
    assert.equal(allModels.status, 503);
    assert.equal((await allModels.json()).status, 'loading');
    assert.equal(aiHealthCalls, 2);
    for (const query of ['?mode=invalid', '?mode=', '?mode=transcribe&mode=transcribe']) {
        const invalid = await health(query);
        assert.equal(invalid.status, 400);
        assert.match(invalid.headers.get('content-type'), /application\/json/);
    }
    assert.equal(aiHealthCalls, 2);
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
    for (const status of [400, 413, 422, 429, 503, 504]) {
        aiHandler = (_req, res) => res.status(status).json({ detail: 'private upstream detail' });
        const response = await chunk();
        assert.equal(response.status, status);
        assert.equal(typeof response.body.message, 'string');
        if (status === 429) assert.equal(response.body.status, 'busy');
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

test('streamed translation checks JWT, accepted call, both participants and audio before AI', async () => {
    await directCall(false);
    assert.equal((await chunk({}, { stream: true, user: null })).status, 401);
    assert.equal((await chunk({}, { stream: true })).status, 403);
    assert.equal((await chunk({}, { stream: true, user: users[2] })).status, 403);
    assert.equal(aiCalls, 0);
    const alice = clients[0], bob = clients[1];
    const accepted = event(alice, 'callAccepted');
    bob.emit('answerCall', { to: users[0].id, signal: {} });
    await accepted;
    assert.equal((await chunk({ speakerId: users[2].id }, { stream: true })).status, 403);
    assert.equal((await chunk({}, { stream: true, type: 'text/plain' })).status, 400);
    assert.equal((await chunk({}, { stream: true, content: '' })).status, 400);
    assert.equal((await chunk({}, { stream: true, content: Buffer.alloc(2 * 1024 * 1024 + 1) })).status, 413);
    assert.equal((await chunk({ targetLanguage: 'fr' }, { stream: true })).status, 400);
    assert.equal(aiCalls, 0);
});

test('real HTTP stream flushes the original while the translation is still pending', async () => {
    await directCall();
    const gate = pauseTranslation();
    let response, stream;
    try {
        response = await within(chunk({}, { stream: true }));
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^application\/x-ndjson/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        stream = lines(response);
        assert.deepEqual(await within(stream.next()), {
            type: 'transcript', speakerId: users[1].id, speakerName: 'bob', original: 'Hello',
            sourceLanguage: 'en', targetLanguage: 'vi',
        });
        await gate.started;
    } finally { gate.release(); }
    assert.deepEqual(await within(stream.next()), translation);
    assert.equal(await within(stream.next()), null);
});

test('stream preserves explicit English/Vietnamese directions and silent clips', async () => {
    await directCall();
    for (const [source, target] of [['en', 'vi'], ['vi', 'en']]) {
        aiHandler = (req, res) => {
            assert.equal(req.body.source_language, source);
            assert.equal(req.body.target_language, target);
            assert.equal(req.body.stream, 'true');
            assert.equal(req.file.mimetype, 'audio/webm');
            res.type('application/x-ndjson').end(ndjson({ ...transcript, original: '', source_language: source }) +
                ndjson({ ...translation, translated: '' }));
        };
        const stream = lines(await chunk({ sourceLanguage: source, targetLanguage: target }, { stream: true }));
        assert.deepEqual(await stream.next(), {
            type: 'transcript', speakerId: users[1].id, speakerName: 'bob', original: '', sourceLanguage: source, targetLanguage: target,
        });
        assert.deepEqual(await stream.next(), { type: 'translation', translated: '' });
        assert.equal(await stream.next(), null);
    }
});

test('stream errors before headers stay JSON and never expose inference details', async () => {
    await directCall();
    for (const status of [400, 413, 422, 429, 503, 504]) {
        aiHandler = (_req, res) => res.status(status).json({ detail: 'private upstream note/key/audio' });
        const response = await chunk({}, { stream: true });
        assert.equal(response.status, status);
        assert.match(response.headers.get('content-type'), /application\/json/);
        const body = await response.json();
        assert.ok(!JSON.stringify(body).includes('private'));
        if (status === 429) assert.equal(body.status, 'busy');
    }
});

test('a translation failure keeps the earlier original and emits a sanitized terminal error', async () => {
    await directCall();
    aiHandler = (_req, res) => res.type('application/x-ndjson').end(ndjson(transcript) +
        ndjson({ type: 'error', status: 504, message: 'private model response' }));
    const stream = lines(await chunk({}, { stream: true }));
    assert.equal((await stream.next()).original, 'Hello');
    const failure = await stream.next();
    assert.equal(failure.type, 'error');
    assert.equal(failure.status, 504);
    assert.ok(!failure.message.includes('private'));
    assert.equal(await stream.next(), null);
});

test('ending or replacing the direct call between stream stages blocks its stale translation', async () => {
    const { alice, bob } = await directCall();
    for (const restart of [false, true]) {
        if (restart) await startCall(alice, bob);
        const gate = pauseTranslation();
        let stream;
        try {
            stream = lines(await within(chunk({}, { stream: true })));
            assert.equal((await within(stream.next())).type, 'transcript');
            const ended = event(bob, 'endCall');
            alice.emit('endCall', { to: users[1].id });
            await ended;
            if (restart) await startCall(alice, bob);
        } finally { gate.release(); }
        const failure = await within(stream.next());
        assert.equal(failure.type, 'error');
        assert.equal(failure.status, 403);
        assert.equal(await within(stream.next()), null);
    }
});

test('a stale stream revoked before its original sends JSON 403 without note content', async () => {
    const { alice, bob } = await directCall();
    const started = Promise.withResolvers(), release = Promise.withResolvers();
    aiHandler = async (_req, res) => {
        started.resolve();
        await release.promise;
        res.type('application/x-ndjson').end(ndjson(transcript) + ndjson(translation));
    };
    const pending = chunk({}, { stream: true });
    try {
        await started.promise;
        const ended = event(bob, 'endCall');
        alice.emit('endCall', { to: users[1].id });
        await ended;
        await startCall(alice, bob);
    } finally { release.resolve(); }
    const response = await pending;
    assert.equal(response.status, 403);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.ok(!JSON.stringify(body).includes('Hello'));
});

test('group leave/rejoin during translation cannot reuse an earlier attendance in the same room', async () => {
    const group = await Conversation.create({
        isGroup: true, group: { name: 'Stream test', createdBy: users[0]._id },
        participants: users.map(user => ({ userId: user._id })),
    });
    const alice = await socketFor(users[0]), bob = await socketFor(users[1]);
    const join = async socket => {
        const joined = event(socket, 'groupCallExistingUsers');
        socket.emit('joinGroupCall', { conversationId: group.id });
        await joined;
    };
    await join(alice);
    const fields = { kind: 'group', sessionId: group.id };
    assert.equal((await chunk(fields, { stream: true })).status, 403);
    await join(bob);
    assert.equal((await chunk({ ...fields, speakerId: users[2].id }, { stream: true })).status, 403);
    assert.equal((await chunk(fields, { stream: true, user: users[2] })).status, 403);
    assert.equal(aiCalls, 0);
    const gate = pauseTranslation();
    let stream;
    try {
        stream = lines(await within(chunk(fields, { stream: true })));
        assert.equal((await within(stream.next())).type, 'transcript');
        const left = event(alice, 'groupCallUserLeft');
        bob.emit('leaveGroupCall', { conversationId: group.id });
        await left;
        await join(bob);
    } finally { gate.release(); }
    assert.equal((await within(stream.next())).status, 403);
    assert.equal(await within(stream.next()), null);
    const left = event(alice, 'groupCallUserLeft');
    bob.emit('leaveGroupCall', { conversationId: group.id });
    await left;
    const ended = event(alice, 'groupCallStatusChanged', value => !value.isActive);
    const updated = event(alice, 'messageUpdated', message => message.callStatus === 'ended');
    alice.emit('leaveGroupCall', { conversationId: group.id });
    await Promise.all([ended, updated]);
});

test('legacy JSON translation also expires when a speaker leaves and rejoins the active room', async () => {
    const group = await Conversation.create({
        isGroup: true, group: { name: 'JSON attendance test', createdBy: users[0]._id },
        participants: users.map(user => ({ userId: user._id })),
    });
    const alice = await socketFor(users[0]), bob = await socketFor(users[1]);
    const join = async socket => {
        const joined = event(socket, 'groupCallExistingUsers');
        socket.emit('joinGroupCall', { conversationId: group.id });
        await joined;
    };
    await join(alice);
    await join(bob);
    const gate = pauseAi();
    const pending = chunk({ kind: 'group', sessionId: group.id });
    try {
        await gate.started;
        const left = event(alice, 'groupCallUserLeft');
        bob.emit('leaveGroupCall', { conversationId: group.id });
        await left;
        await join(bob);
    } finally { gate.release(); }
    assert.equal((await pending).status, 403);
    const left = event(alice, 'groupCallUserLeft');
    bob.emit('leaveGroupCall', { conversationId: group.id });
    await left;
    const ended = event(alice, 'groupCallStatusChanged', value => !value.isActive);
    const updated = event(alice, 'messageUpdated', message => message.callStatus === 'ended');
    alice.emit('leaveGroupCall', { conversationId: group.id });
    await Promise.all([ended, updated]);
});

test('malformed, oversized, duplicate, extra and unfinished AI events fail safely', async () => {
    await directCall();
    const invalidTails = [
        '', '{invalid}\n', ndjson(translation).trimEnd(),
        ndjson(transcript), ndjson({ ...translation, private: 'unexpected' }),
        ndjson(translation) + ndjson(translation),
        ndjson({ type: 'translation', translated: 'x'.repeat(64 * 1024) }),
    ];
    for (const tail of invalidTails) {
        aiHandler = (_req, res) => res.type('application/x-ndjson').end(ndjson(transcript) + tail);
        const stream = lines(await chunk({}, { stream: true }));
        assert.equal((await stream.next()).type, 'transcript');
        const failure = await stream.next();
        assert.equal(failure.type, 'error');
        assert.equal(failure.status, 503);
        assert.equal(await stream.next(), null);
    }
    aiHandler = (_req, res) => res.type('application/x-ndjson').end(ndjson(translation));
    const response = await chunk({}, { stream: true });
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /application\/json/);
});

test('closing the downstream after its original cancels the upstream stream reader', async () => {
    await directCall();
    const closed = Promise.withResolvers();
    aiHandler = (_req, res) => {
        res.once('close', closed.resolve);
        res.type('application/x-ndjson').write(ndjson(transcript));
    };
    const controller = new AbortController();
    const stream = lines(await chunk({}, { stream: true, signal: controller.signal }));
    assert.equal((await within(stream.next())).type, 'transcript');
    controller.abort();
    await stream.reader.cancel().catch(() => {});
    await within(closed.promise);
});
