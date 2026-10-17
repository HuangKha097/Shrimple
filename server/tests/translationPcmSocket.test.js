import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { once } from "node:events";
import http from "node:http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as connect } from "socket.io-client";
import { WebSocketServer } from "ws";
import User from "../src/models/User.js";
import Conversation from "../src/models/Conversation.js";

process.env.ACCESS_TOKEN_SECRET = "pcm-socket-test-only";
process.env.TRANSLATION_AI_KEY = "pcm-socket-ai-test-only";
const { app, io, server } = await import("../src/socket/socket.js");
const { protectedRoute } = await import("../src/middlewares/authMiddleware.js");
let mongo, aiServer, upstreamServer, baseUrl, users, onAIStart, healthMode;
const clients = [], upstreams = [], aiRequests = [];
const ready = { type: "ready", sampleRate: 16000, channels: 1, packetSamples: 2048 };
const transcript = (extra = {}) => ({
    type: "transcript", utteranceId: "utterance-1", revision: 1,
    original: "Hello", sourceLanguage: "en", targetLanguage: "vi", isFinal: true, ...extra,
});
const event = (emitter, name, predicate = () => true) => new Promise((resolve, reject) => {
    const handler = value => {
        if (!predicate(value)) return;
        clearTimeout(timer); emitter.off(name, handler); resolve(value);
    };
    const timer = setTimeout(() => { emitter.off(name, handler); reject(new Error(`Missing ${name}`)); }, 2000);
    emitter.on(name, handler);
});
const ack = (client, name, payload) => client.timeout(2000).emitWithAck(name, payload);
const listen = async target => {
    target.listen(0, "127.0.0.1"); await once(target, "listening");
    return `http://127.0.0.1:${target.address().port}`;
};
const token = user => jwt.sign({ userId: user.id }, process.env.ACCESS_TOKEN_SECRET);
const socketFor = async user => {
    const client = connect(baseUrl, { auth: { token: typeof user === "string" ? user : token(user) }, transports: ["websocket"], reconnection: false });
    clients.push(client);
    const connected = new Promise((resolve, reject) => {
        client.once("connect", resolve); client.once("connect_error", reject);
    });
    await connected; return client;
};
const request = (extra = {}) => ({
    kind: "direct", sessionId: users[1].id, speakerId: users[1].id,
    sourceLanguage: "en", targetLanguage: "vi", ...extra,
});
const directCall = async (accepted = true) => {
    const alice = await socketFor(users[0]), bob = await socketFor(users[1]);
    const incoming = event(bob, "callUser");
    alice.emit("callUser", { userToCall: users[1].id, signalData: {}, from: users[2].id }); await incoming;
    if (accepted) {
        const answered = event(alice, "callAccepted");
        bob.emit("answerCall", { to: users[0].id, signal: {} }); await answered;
    }
    return { alice, bob };
};
const start = (socket, extra) => ack(socket, "translation:start", request(extra));
const join = async (socket, conversationId) => {
    const admitted = event(socket, "groupCallExistingUsers");
    socket.emit("joinGroupCall", { conversationId }); await admitted;
};

before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } }); await mongoose.connect(mongo.getUri());
    aiServer = http.createServer((req, res) => {
        assert.equal(req.headers["x-api-key"], process.env.TRANSLATION_AI_KEY);
        healthMode = new URL(req.url, "http://test").searchParams.get("mode");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ready", mode: healthMode }));
    });
    upstreamServer = new WebSocketServer({ server: aiServer, path: "/stream/pcm" });
    upstreamServer.on("connection", (ws, req) => {
        upstreams.push(ws); aiRequests.push(req);
        ws.frames = [];
        ws.once("message", (value, binary) => {
            assert.equal(binary, false);
            assert.equal(req.headers["x-api-key"], "pcm-socket-ai-test-only");
            onAIStart(ws, JSON.parse(value.toString()));
            ws.on("message", (data, isBinary) => {
                assert.equal(isBinary, true); ws.frames.push(data);
                ws.emit("pcm-frame", data);
            });
        });
    });
    process.env.TRANSLATION_AI_URL = await listen(aiServer);
    const { default: translationRoute } = await import("../src/routes/translationRoute.js");
    app.use("/api/translation", protectedRoute, translationRoute);
    baseUrl = await listen(server);
}, { timeout: 300000 });

beforeEach(async () => {
    await User.deleteMany({});
    users = await User.create(["alice", "bob", "outsider"].map(name => ({
        username: name, displayName: name, email: `${name}@example.test`, password: "test-only", isProfileComplete: true,
    })));
    onAIStart = ws => ws.send(JSON.stringify(ready)); healthMode = null;
});

afterEach(async () => {
    const disconnected = clients.filter(client => client.connected).map(client => {
        const serverSocket = io.sockets.sockets.get(client.id);
        const done = serverSocket ? once(serverSocket, "disconnect") : Promise.resolve();
        client.close(); return done;
    });
    clients.splice(0).forEach(client => client.close()); await Promise.all(disconnected);
    upstreams.splice(0).forEach(ws => ws.terminate()); aiRequests.length = 0;
});

after(async () => {
    await new Promise(resolve => io.close(resolve));
    if (upstreamServer) await new Promise(resolve => upstreamServer.close(resolve));
    if (aiServer) await new Promise(resolve => aiServer.close(resolve));
    await mongoose.disconnect(); await mongo?.stop();
});

test("PCM Socket.IO authentication, accepted-call and remote-only gates reject before opening AI", async () => {
    await assert.rejects(socketFor("invalid-token"), /đăng nhập/);
    const { alice, bob } = await directCall(false);
    assert.equal((await start(alice)).status, 403);
    const answered = event(alice, "callAccepted");
    bob.emit("answerCall", { to: users[0].id, signal: {} }); await answered;
    assert.equal((await start(alice, { speakerId: users[0].id })).status, 403);
    const outsider = await socketFor(users[2]);
    assert.equal((await start(outsider)).status, 403);
    assert.equal((await start(alice, { sourceLanguage: "vi", targetLanguage: "vi" })).status, 400);
    assert.equal(aiRequests.length, 0);
});

test("real binary packets reach authenticated AI and transcripts/translations reach only the viewer socket", async () => {
    const { alice } = await directCall();
    const otherTab = await socketFor(users[0]);
    const outsider = await socketFor(users[2]);
    const received = [], otherNotes = [];
    alice.on("translation:event", note => received.push(note));
    otherTab.on("translation:event", note => otherNotes.push(note));
    outsider.on("translation:event", note => otherNotes.push(note));
    const result = await start(alice); assert.equal(result.ok, true);
    const upstream = upstreams.at(-1);
    const frame = event(upstream, "pcm-frame");
    const pcm = new ArrayBuffer(4096); new DataView(pcm).setInt16(0, -1234, true);
    assert.deepEqual(await ack(alice, "translation:audio", { streamId: result.streamId, seq: 0, audio: pcm }), { ok: true });
    assert.equal((await frame).readInt16LE(0), -1234);
    const original = event(alice, "translation:event", note => note.type === "transcript");
    upstream.send(JSON.stringify(transcript({ isFinal: false })));
    assert.equal((await original).original, "Hello"); assert.equal(received.length, 1);
    upstream.send(JSON.stringify(transcript({ revision: 2 })));
    const translated = event(alice, "translation:event", note => note.type === "translation");
    upstream.send(JSON.stringify({ type: "translation", utteranceId: "utterance-1", revision: 2, translated: "Xin chào" }));
    assert.equal((await translated).translated, "Xin chào");
    assert.equal(received.at(-1).speakerName, "bob");
    assert.equal(otherNotes.length, 0);
    const privateAttempt = await ack(otherTab, "translation:audio", { streamId: result.streamId, seq: 1, audio: pcm });
    assert.equal(privateAttempt.status, 403);
});

test("switching English/Vietnamese direction replaces and destroys the previous upstream", async () => {
    const { alice } = await directCall();
    const first = await start(alice); const oldUpstream = upstreams.at(-1);
    const oldClosed = once(oldUpstream, "close");
    let configured;
    onAIStart = (ws, value) => { configured = value; ws.send(JSON.stringify(ready)); };
    const second = await start(alice, { sourceLanguage: "vi", targetLanguage: "en" });
    assert.equal(second.ok, true); assert.notEqual(second.streamId, first.streamId);
    await oldClosed;
    assert.deepEqual(configured, { sourceLanguage: "vi", targetLanguage: "en" });
    assert.equal((await ack(alice, "translation:audio", { streamId: first.streamId, seq: 0, audio: Buffer.alloc(4096) })).status, 403);
    const newOriginal = event(alice, "translation:event", note => note.type === "transcript");
    upstreams.at(-1).send(JSON.stringify(transcript({ sourceLanguage: "vi", targetLanguage: "en", original: "Xin chào" })));
    assert.equal((await newOriginal).sourceLanguage, "vi");
});

test("out-of-order binary causes an explicit error and closes upstream immediately", async () => {
    const { alice } = await directCall(); const result = await start(alice);
    const upstream = upstreams.at(-1), closed = once(upstream, "close");
    const problem = event(alice, "translation:event", note => note.type === "error");
    assert.equal((await ack(alice, "translation:audio", { streamId: result.streamId, seq: 1, audio: Buffer.alloc(4096) })).status, 400);
    assert.equal((await problem).status, 400); await closed;
    assert.equal(upstream.frames.length, 0);
});

test("ending an accepted call revokes idle streams and blocks any subsequent AI content", async () => {
    const { alice, bob } = await directCall(); await start(alice);
    const upstream = upstreams.at(-1), closed = once(upstream, "close");
    const revoked = event(alice, "translation:event", note => note.status === 403);
    const ended = event(bob, "endCall"); alice.emit("endCall", { to: users[1].id }); await ended;
    upstream.send(JSON.stringify(transcript()));
    assert.equal((await revoked).original, undefined); await closed;
});

test("group viewer and speaker leave/rejoin invalidate their exact previous attendance", async () => {
    const alice = await socketFor(users[0]), bob = await socketFor(users[1]);
    const conversation = await Conversation.create({
        isGroup: true, participants: users.slice(0, 2).map(user => ({ userId: user._id })),
        group: { name: "PCM group", createdBy: users[0]._id },
    });
    await join(alice, conversation.id); await join(bob, conversation.id);
    const result = await start(alice, { kind: "group", sessionId: conversation.id }); assert.equal(result.ok, true);
    const upstream = upstreams.at(-1), closed = once(upstream, "close");
    const left = event(alice, "groupCallUserLeft"); bob.emit("leaveGroupCall", { conversationId: conversation.id }); await left;
    await join(bob, conversation.id);
    const revoked = event(alice, "translation:event", note => note.status === 403);
    upstream.send(JSON.stringify(transcript()));
    assert.equal((await revoked).original, undefined); await closed;
    const otherTab = await socketFor(users[0]);
    assert.equal((await start(otherTab, { kind: "group", sessionId: conversation.id })).status, 403);
    const bobLeft = event(alice, "groupCallUserLeft");
    bob.emit("leaveGroupCall", { conversationId: conversation.id }); await bobLeft;
    const ended = event(alice, "groupCallStatusChanged", status => status.conversationId === conversation.id && !status.isActive);
    const historySaved = event(alice, "messageUpdated", message => message.callStatus === "ended");
    alice.emit("leaveGroupCall", { conversationId: conversation.id }); await ended; await historySaved;
});

test("disconnect before AI ready destroys pending stream and never emits a stale successful acknowledgement", async () => {
    const { alice } = await directCall();
    const started = Promise.withResolvers();
    onAIStart = ws => started.resolve(ws);
    let response;
    alice.emit("translation:start", request(), value => { response = value; });
    const upstream = await started.promise, closed = once(upstream, "close");
    alice.close(); await closed;
    assert.equal(response, undefined);
});

test("upstream messages cannot expose private engine errors or forged speaker metadata", async () => {
    const { alice } = await directCall(); await start(alice);
    const error = event(alice, "translation:event", note => note.type === "error");
    upstreams.at(-1).send(JSON.stringify({ type: "error", status: 503, message: "secret-server-private-path-and-key" }));
    const safe = await error; assert.equal(safe.status, 503);
    assert.equal(JSON.stringify(safe).includes("secret-server"), false);
    await start(alice);
    const forged = event(alice, "translation:event", note => note.type === "error");
    upstreams.at(-1).send(JSON.stringify(transcript({ speakerName: "forged" })));
    assert.equal((await forged).status, 503);
});

test("PCM health uses backend-only authentication and checks only the requested readiness mode", async () => {
    const response = await fetch(`${baseUrl}/api/translation/health?mode=pcm`, { headers: { Authorization: `Bearer ${token(users[0])}` } });
    assert.equal(response.status, 200); assert.equal(healthMode, "pcm");
    assert.deepEqual(await response.json(), { status: "ready", mode: "pcm" });
});
