import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { test } from "node:test";
import { createTranslationPcmBridge, PCM_LIMITS } from "../src/socket/translationPcm.js";

const viewerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const speakerId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const sessionId = "cccccccccccccccccccccccc";
const request = { kind: "direct", sessionId: speakerId, speakerId, sourceLanguage: "en", targetLanguage: "vi" };
const transcript = (extra = {}) => ({
    type: "transcript", utteranceId: "utterance-1", revision: 1,
    original: "Hello", sourceLanguage: "en", targetLanguage: "vi", isFinal: true, ...extra,
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const deadline = async promise => {
    let timer;
    try {
        return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("PCM operation did not settle")), 1000);
        })]);
    } finally { clearTimeout(timer); }
};

class FakeSocket extends EventEmitter {
    constructor(id = "viewer-socket", userId = viewerId) {
        super(); this.id = id; this.data = { userId }; this.connected = true; this.notes = [];
        this.on("translation:event", value => this.notes.push(value));
    }
    request(name, payload) { return deadline(new Promise(resolve => this.emit(name, payload, resolve))); }
    disconnect() { this.connected = false; this.emit("disconnect"); }
}
class FakeWebSocket extends EventEmitter {
    constructor() { super(); this.readyState = 0; this.bufferedAmount = 0; this.sent = []; this.terminated = false; }
    send(data, options, callback) {
        this.sent.push({ data, options });
        if (typeof options === "function") options(); else callback?.();
    }
    open() { this.readyState = 1; this.emit("open"); }
    event(value) { this.emit("message", Buffer.from(JSON.stringify(value)), false); }
    ready() { this.event({ type: "ready", sampleRate: 16000, channels: 1, packetSamples: 2048 }); }
    terminate() { this.terminated = true; this.readyState = 3; }
}
function harness(t, options = {}) {
    let session = { accepted: true, users: [viewerId, speakerId] }, time = 0;
    const upstreams = [], connections = [];
    const bridge = createTranslationPcmBridge({
        getSession: () => session,
        findSpeaker: async () => ({ displayName: "Trusted speaker" }),
        createWebSocket: (url, config) => {
            const ws = new FakeWebSocket(); upstreams.push(ws); connections.push({ url, config }); return ws;
        },
        now: () => time,
        ...options,
    });
    t.after(() => bridge.dispose());
    const socket = new FakeSocket(); bridge.register(socket);
    return {
        bridge, socket, upstreams, connections,
        setSession(value) { session = value; },
        advance(value) { time += value; },
        async start(payload = request, target = socket) {
            const before = upstreams.length;
            const ack = target.request("translation:start", payload);
            await tick();
            const ws = upstreams.length > before ? upstreams.at(-1) : undefined;
            ws?.open(); ws?.ready();
            return { result: await ack, ws };
        },
        audio(streamId, seq = 0, audio = Buffer.alloc(4096), target = socket) {
            return target.request("translation:audio", { streamId, seq, audio });
        },
    };
}

test("PCM limits define 128 ms frames and bounded admission/buffers", () => {
    assert.equal(PCM_LIMITS.packetSamples / PCM_LIMITS.sampleRate, 0.128);
    assert.equal(PCM_LIMITS.packetBytes, PCM_LIMITS.packetSamples * 2);
    assert.equal(PCM_LIMITS.maxSocketStreams, 8);
    assert.equal(PCM_LIMITS.maxProcessStreams, 64);
    assert.equal(PCM_LIMITS.maxBufferedBytes, 65536);
    assert.equal(PCM_LIMITS.maxEventBytes, 65536);
});

test("start waits for exact AI readiness and forwards only trusted configuration/metadata", async t => {
    const previous = process.env.TRANSLATION_AI_KEY;
    process.env.TRANSLATION_AI_KEY = "pcm-test-private-key";
    t.after(() => { if (previous === undefined) delete process.env.TRANSLATION_AI_KEY; else process.env.TRANSLATION_AI_KEY = previous; });
    const h = harness(t);
    const { result, ws } = await h.start();
    assert.equal(result.ok, true);
    assert.match(result.streamId, /^[a-f\d-]{36}$/);
    assert.equal(h.connections[0].config.headers["x-api-key"], "pcm-test-private-key");
    assert.match(h.connections[0].url.pathname, /\/stream\/pcm$/);
    assert.deepEqual(JSON.parse(ws.sent[0].data), { sourceLanguage: "en", targetLanguage: "vi" });
    assert.equal((await h.audio(result.streamId)).ok, true);
    assert.equal(ws.sent[1].data.byteLength, 4096);
    ws.event(transcript({ isFinal: false }));
    ws.event(transcript({ revision: 2 }));
    ws.event({ type: "translation", utteranceId: "utterance-1", revision: 2, translated: "Xin chào" });
    assert.equal(h.socket.notes.length, 3);
    assert.equal(h.socket.notes[0].speakerId, speakerId);
    assert.equal(h.socket.notes[0].speakerName, "Trusted speaker");
    assert.equal(JSON.stringify(h.socket.notes).includes("pcm-test-private-key"), false);
});

test("rejects self, missing session, unknown fields and same-language directions before AI admission", async t => {
    const h = harness(t);
    assert.equal((await h.start({ ...request, speakerId: viewerId })).result.status, 403);
    assert.equal((await h.start({ ...request, targetLanguage: "en" })).result.status, 400);
    assert.equal((await h.start({ ...request, sourceLanguage: "auto" })).result.status, 400);
    assert.equal((await h.start({ ...request, speakerName: "forged" })).result.status, 400);
    h.setSession(null);
    assert.equal((await h.start()).result.status, 403);
    assert.equal(h.upstreams.length, 0);
});

test("Vietnamese to English is explicit and enforced on every transcript", async t => {
    const h = harness(t);
    const { result, ws } = await h.start({ ...request, sourceLanguage: "vi", targetLanguage: "en" });
    assert.equal(result.ok, true);
    ws.event(transcript({ sourceLanguage: "vi", targetLanguage: "en", original: "Xin chào" }));
    assert.equal(h.socket.notes[0].original, "Xin chào");
    ws.event(transcript({ utteranceId: "other", sourceLanguage: "en", targetLanguage: "vi" }));
    assert.equal(h.socket.notes.at(-1).type, "error");
    assert.equal(ws.terminated, true);
});

test("frames must be exact binary, ordered and owned by the requesting socket", async t => {
    const h = harness(t);
    const other = new FakeSocket("other"); h.bridge.register(other);
    let started = await h.start();
    assert.equal((await h.audio(started.result.streamId, 0, Buffer.alloc(4096), other)).status, 403);
    assert.equal(h.bridge.size, 1);
    assert.equal((await h.audio(started.result.streamId, 1)).status, 400);
    assert.equal(started.ws.terminated, true);
    for (const audio of [Buffer.alloc(4095), Buffer.alloc(4097), "audio", { type: "Buffer", data: [] }]) {
        started = await h.start();
        assert.equal((await h.audio(started.result.streamId, 0, audio)).status, 400);
        assert.equal(h.bridge.size, 0);
    }
});

test("normal 128 ms PCM flow succeeds; burst overflow explicitly stops instead of dropping audio", async t => {
    const h = harness(t);
    let { result, ws } = await h.start();
    for (let seq = 0; seq < 20; seq++) {
        assert.equal((await h.audio(result.streamId, seq)).ok, true); h.advance(128);
    }
    await h.socket.request("translation:stop", { streamId: result.streamId });
    ({ result, ws } = await h.start());
    for (let seq = 0; seq < PCM_LIMITS.burstPackets; seq++) assert.equal((await h.audio(result.streamId, seq)).ok, true);
    assert.equal((await h.audio(result.streamId, PCM_LIMITS.burstPackets)).status, 429);
    assert.equal(ws.terminated, true);
    assert.equal(h.socket.notes.at(-1).status, 429);
});

test("upstream buffer accepts exactly the bound and rejects overflow", async t => {
    const h = harness(t);
    const { result, ws } = await h.start();
    ws.bufferedAmount = PCM_LIMITS.maxBufferedBytes - PCM_LIMITS.packetBytes;
    assert.equal((await h.audio(result.streamId)).ok, true);
    ws.bufferedAmount += 1;
    assert.equal((await h.audio(result.streamId, 1)).status, 429);
    assert.equal(ws.terminated, true);
});

test("socket/process caps include starts while the speaker lookup is pending", async t => {
    const pending = Promise.withResolvers();
    const h = harness(t, {
        findSpeaker: () => pending.promise,
        limits: { ...PCM_LIMITS, maxSocketStreams: 2, maxProcessStreams: 3 },
    });
    const other = new FakeSocket("other"); h.bridge.register(other);
    const starts = [];
    for (let index = 0; index < 2; index++) starts.push(h.socket.request("translation:start", { ...request, speakerId: `${index + 1}`.repeat(24) }));
    assert.equal((await h.socket.request("translation:start", { ...request, speakerId: "3".repeat(24) })).status, 429);
    starts.push(other.request("translation:start", request));
    assert.equal((await other.request("translation:start", { ...request, speakerId: "4".repeat(24) })).status, 429);
    assert.equal(h.bridge.size, 3);
    h.bridge.dispose(); pending.resolve({ username: "speaker" });
    const results = await Promise.all(starts);
    assert.ok(results.every(result => result.ok === false));
    await tick(); assert.equal(h.upstreams.length, 0); assert.equal(h.bridge.size, 0);
});

test("superseded starts and disconnect during async lookup never open abandoned upstreams", async t => {
    const lookups = [];
    const h = harness(t, { findSpeaker: () => { const pending = Promise.withResolvers(); lookups.push(pending); return pending.promise; } });
    const first = h.socket.request("translation:start", request);
    const second = h.socket.request("translation:start", { ...request, sourceLanguage: "vi", targetLanguage: "en" });
    assert.equal((await first).ok, false);
    h.socket.disconnect();
    assert.equal((await second).ok, false);
    lookups.forEach(pending => pending.resolve({ displayName: "speaker" }));
    await tick(); assert.equal(h.upstreams.length, 0); assert.equal(h.bridge.size, 0);
});

test("100 identical starts cannot bypass a one-slot lookup cap; stopping retains it until actual settlement", async t => {
    const pending = Promise.withResolvers();
    let lookups = 0;
    const h = harness(t, {
        findSpeaker: () => { lookups += 1; return pending.promise; },
        limits: { ...PCM_LIMITS, maxSocketStreams: 1, maxProcessStreams: 1 },
    });
    const first = h.socket.request("translation:start", request);
    const attempts = Array.from({ length: 99 }, () => h.socket.request("translation:start", request));
    assert.ok((await Promise.all(attempts)).every(result => result.status === 429));
    assert.equal(lookups, 1); assert.equal(h.bridge.size, 1);
    h.bridge.dispose(); assert.equal((await first).ok, false); assert.equal(h.bridge.size, 0);
    const other = new FakeSocket("other"); h.bridge.register(other);
    assert.equal((await other.request("translation:start", request)).status, 429);
    assert.equal(lookups, 1);
    pending.resolve({ displayName: "Speaker" }); await tick();
    assert.equal(h.upstreams.length, 0);
    const started = await h.start(request, other);
    assert.equal(started.result.ok, true); assert.equal(lookups, 2);
});

test("superseded and disconnected lookups keep global capacity until every barrier settles", async t => {
    const pending = [];
    const h = harness(t, {
        findSpeaker: () => { const lookup = Promise.withResolvers(); pending.push(lookup); return lookup.promise; },
        limits: { ...PCM_LIMITS, maxSocketStreams: 2, maxProcessStreams: 2 },
    });
    const first = h.socket.request("translation:start", request);
    const second = h.socket.request("translation:start", request);
    assert.equal((await first).ok, false);
    const attempts = Array.from({ length: 98 }, () => h.socket.request("translation:start", request));
    assert.ok((await Promise.all(attempts)).every(result => result.status === 429));
    assert.equal(pending.length, 2); assert.equal(h.bridge.size, 1);
    h.socket.disconnect(); assert.equal((await second).ok, false);
    const other = new FakeSocket("other"); h.bridge.register(other);
    assert.equal((await other.request("translation:start", request)).status, 429);
    pending[0].resolve({ displayName: "Old speaker" }); await tick();
    const third = other.request("translation:start", request);
    assert.equal(pending.length, 3);
    assert.equal((await other.request("translation:start", request)).status, 429);
    pending[1].reject(new Error("Delayed lookup rejection")); await tick();
    h.bridge.dispose(); assert.equal((await third).ok, false);
    pending[2].resolve({ displayName: "Old speaker" }); await tick();
    assert.equal(h.upstreams.length, 0);
});

test("call replacement is rechecked before audio, output and periodic idle validation", async t => {
    const h = harness(t, { limits: { ...PCM_LIMITS, permissionCheckMs: 10 } });
    let { result, ws } = await h.start();
    h.setSession({ accepted: true, users: [viewerId, speakerId] });
    assert.equal((await h.audio(result.streamId)).status, 403);
    assert.equal(ws.terminated, true);
    ({ ws } = await h.start());
    h.setSession(null); ws.event(transcript());
    assert.equal(h.socket.notes.some(note => note.original), false);
    assert.equal(h.socket.notes.at(-1).status, 403);
    h.setSession({ accepted: true });
    ({ ws } = await h.start());
    const stopped = once(h.socket, "translation:event"); h.setSession(null);
    assert.equal((await deadline(stopped))[0].status, 403);
    assert.equal(ws.terminated, true);
});

test("group admission pins the exact viewer socket and speaker attendance across leave/rejoin", async t => {
    const h = harness(t);
    const viewer = { userId: viewerId, socketId: h.socket.id };
    const speaker = { userId: speakerId, socketId: "speaker-socket" };
    const group = { participants: new Map([[viewer.socketId, viewer], [speaker.socketId, speaker]]) };
    h.setSession(group);
    const groupRequest = { ...request, kind: "group", sessionId };
    const other = new FakeSocket("same-user-other-socket"); h.bridge.register(other);
    assert.equal((await h.start(groupRequest, other)).result.status, 403);
    const { ws } = await h.start(groupRequest);
    group.participants.set(speaker.socketId, { ...speaker });
    ws.event(transcript());
    assert.equal(h.socket.notes.length, 1);
    assert.equal(h.socket.notes[0].status, 403);
    assert.equal(ws.terminated, true);
});

test("upstream metadata, invalid revisions, binary and oversized events fail safely", async t => {
    const h = harness(t);
    for (const malformed of [
        transcript({ speakerName: "forged", token: "private-upstream-data" }),
        transcript({ sourceLanguage: "auto" }), transcript({ revision: -1 }),
        transcript({ original: "a".repeat(PCM_LIMITS.maxTextLength + 1) }),
        { type: "translation", utteranceId: "unknown", revision: 1, translated: "bad" },
    ]) {
        const { ws } = await h.start(); ws.event(malformed);
        assert.equal(h.socket.notes.at(-1).status, 503);
        assert.equal(ws.terminated, true);
    }
    let { ws } = await h.start();
    ws.emit("message", Buffer.alloc(10), true); assert.equal(ws.terminated, true);
    ({ ws } = await h.start());
    ws.emit("message", Buffer.alloc(PCM_LIMITS.maxEventBytes + 1), false); assert.equal(ws.terminated, true);
    assert.equal(JSON.stringify(h.socket.notes).includes("private-upstream-data"), false);
});

test("translation must match the frozen final revision and finalized speech cannot be rewritten", async t => {
    const h = harness(t);
    for (const final of [false, true]) {
        const { ws } = await h.start(); ws.event(transcript({ isFinal: final }));
        ws.event({ type: "translation", utteranceId: "utterance-1", revision: final ? 2 : 1, translated: "Wrong revision" });
        assert.equal(h.socket.notes.at(-1).type, "error"); assert.equal(ws.terminated, true);
    }
    const { ws } = await h.start(); ws.event(transcript()); ws.event(transcript({ revision: 2 }));
    assert.equal(ws.terminated, true);
});

test("utterance errors settle one note while safe status warnings keep audio alive", async t => {
    const h = harness(t);
    const { result, ws } = await h.start();
    ws.event(transcript());
    ws.event({ type: "error", status: 429, message: "private-model-error", utteranceId: "utterance-1", revision: 1 });
    ws.event({ type: "status", status: 202, message: "private-internals" });
    assert.equal(ws.terminated, false);
    assert.equal((await h.audio(result.streamId)).ok, true);
    assert.equal(JSON.stringify(h.socket.notes).includes("private-"), false);
    ws.event({ type: "error", status: 503, message: "private-engine-error" });
    assert.equal(ws.terminated, true);
    assert.equal(h.socket.notes.at(-1).status, 503);
});

test("more than 128 failed translations release ledger capacity and late results cannot revive settled notes", async t => {
    const h = harness(t);
    let { ws } = await h.start();
    for (let index = 1; index <= PCM_LIMITS.maxUtterances + 10; index++) {
        ws.event(transcript({ utteranceId: `u${index}` }));
        ws.event({ type: "error", status: 429, message: "Busy", utteranceId: `u${index}`, revision: 1 });
        assert.equal(ws.terminated, false);
    }
    ws.event({ type: "translation", utteranceId: "u138", revision: 1, translated: "Late" });
    assert.equal(ws.terminated, true);
    ({ ws } = await h.start());
    for (let index = 1; index <= PCM_LIMITS.maxUtterances + PCM_LIMITS.maxRetiredIds + 10; index++) {
        ws.event(transcript({ utteranceId: `u${index}` }));
        ws.event({ type: "translation", utteranceId: `u${index}`, revision: 1, translated: "Done" });
    }
    assert.equal(ws.terminated, false);
    ws.event(transcript({ utteranceId: "u1", revision: 2 }));
    assert.equal(ws.terminated, true);
});

test("failed recognition before an original is terminal for that utterance but preserves other speech", async t => {
    const h = harness(t);
    const { ws } = await h.start();
    ws.event({ type: "error", status: 429, message: "Busy", utteranceId: "u1", revision: 0 });
    ws.event(transcript({ utteranceId: "u2" }));
    assert.equal(ws.terminated, false);
    ws.event(transcript({ utteranceId: "u1", revision: 1 }));
    assert.equal(ws.terminated, true);
});

test("setup timeout, malformed ready and idle input terminate upstream work and settle acknowledgements", async t => {
    const h = harness(t, { limits: { ...PCM_LIMITS, setupTimeoutMs: 20, permissionCheckMs: 5, inactivityMs: 20 } });
    const pending = h.socket.request("translation:start", request);
    await tick(); h.upstreams.at(-1).open();
    assert.equal((await pending).status, 504); assert.equal(h.bridge.size, 0);
    const malformed = h.socket.request("translation:start", request);
    await tick(); h.upstreams.at(-1).open();
    h.upstreams.at(-1).event({ type: "ready", sampleRate: 48000, channels: 1, packetSamples: 2048 });
    assert.equal((await malformed).status, 503);
    const { ws } = await h.start();
    const stopped = once(h.socket, "translation:event"); h.advance(21);
    assert.equal((await deadline(stopped))[0].status, 408);
    assert.equal(ws.terminated, true); assert.equal(h.bridge.size, 0);
});

test("stop, disconnect and server disposal remove timers, upstream and pending work", async t => {
    const h = harness(t);
    let { result, ws } = await h.start();
    assert.deepEqual(await h.socket.request("translation:stop", { streamId: result.streamId }), { ok: true });
    ws.event(transcript()); assert.equal(h.socket.notes.length, 0);
    assert.equal(ws.terminated, true); assert.equal(h.bridge.size, 0);
    ({ ws } = await h.start()); h.bridge.dispose();
    assert.equal(ws.terminated, true); assert.equal(h.bridge.size, 0);
    ({ ws } = await h.start()); h.socket.disconnect();
    assert.equal(ws.terminated, true); assert.equal(h.bridge.size, 0);
});

test("stopping upstream settles outstanding packet acknowledgements once even if transport callback is late", async t => {
    const h = harness(t);
    const { result, ws } = await h.start();
    let callback;
    ws.send = (_data, _options, done) => { callback = done; };
    let ackCount = 0;
    const audio = deadline(new Promise(resolve => h.socket.emit("translation:audio", {
        streamId: result.streamId, seq: 0, audio: Buffer.alloc(4096),
    }, value => { ackCount += 1; resolve(value); })));
    await h.socket.request("translation:stop", { streamId: result.streamId });
    assert.equal((await audio).ok, false);
    callback(); assert.equal(ackCount, 1);
});

test("self-speech stream with translate:false transcribes viewer audio without translation", async t => {
    const h = harness(t);
    const selfRequest = {
        kind: "direct", sessionId, speakerId: viewerId,
        sourceLanguage: "vi", targetLanguage: "vi", translate: false,
    };
    const { result, ws } = await h.start(selfRequest);
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(ws.sent[0].data), { sourceLanguage: "vi", targetLanguage: "vi", translate: false });
    ws.event(transcript({ sourceLanguage: "vi", targetLanguage: "vi", original: "Xin chào", isFinal: false, translate: false }));
    ws.event(transcript({ sourceLanguage: "vi", targetLanguage: "vi", original: "Xin chào mọi người", revision: 2, isFinal: true, translate: false }));
    assert.equal(h.socket.notes.length, 2);
    assert.equal(h.socket.notes[1].original, "Xin chào mọi người");
    assert.equal(h.socket.notes[1].translate, false);
    ws.event({ type: "translation", utteranceId: "utterance-1", revision: 2, translated: "Unexpected" });
    assert.equal(ws.terminated, true);
});

