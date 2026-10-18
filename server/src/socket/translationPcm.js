import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import User from "../models/User.js";

export const PCM_LIMITS = Object.freeze({
    sampleRate: 16000, channels: 1, packetSamples: 2048, packetBytes: 4096,
    maxSocketStreams: 8, maxProcessStreams: 64, setupTimeoutMs: 5000,
    inactivityMs: 5000, permissionCheckMs: 500, packetDurationMs: 128, maxPacketsPerSecond: 12,
    burstPackets: 4, maxBufferedBytes: 64 * 1024, maxEventBytes: 64 * 1024,
    maxTextLength: 16000, maxUtterances: 128, maxRetiredIds: 128,
});

const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
const identifier = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const utteranceId = value => typeof value === "string" && /^[\w-]{1,96}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
const allowedKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const errorMessage = status => status === 403 ? "Bạn không còn tham gia cuộc gọi này" :
    status === 429 ? "Máy chủ dịch đang bận; hãy thử lại" :
        status === 422 ? "Chưa nhận diện rõ lời nói hoặc ngôn ngữ; hãy nói lại đoạn này" :
        [400, 413].includes(status) ? "Dữ liệu âm thanh hoặc ngôn ngữ không hợp lệ" :
            [408, 504].includes(status) ? "Máy chủ dịch không phản hồi" : "Không thể nhận diện hoặc dịch âm thanh lúc này";
const failure = (status, message = errorMessage(status)) => ({ ok: false, status, message });

/** Owns only PCM streams; the caller supplies the authoritative call registry. */
export function createTranslationPcmBridge({
    getSession,
    findSpeaker = id => User.findById(id).select("displayName username"),
    createWebSocket = (url, options) => new WebSocket(url, options),
    limits = PCM_LIMITS,
    now = () => performance.now(),
} = {}) {
    const active = new Set();
    const owners = new Map();
    // A canceled stream can still own a running database lookup. Keep that
    // reservation until the lookup actually settles so replacements cannot
    // bypass admission limits with work that is no longer in `active`.
    const reservations = new Set();

    const isAuthorized = stream => {
        if (!stream.socket.connected || !stream.active) return false;
        const { kind, sessionId, speakerId } = stream.request;
        const current = getSession(kind, sessionId, stream.viewerId, speakerId);
        if (!current || current !== stream.session) return false;
        return !stream.attendance || stream.attendance.every(member =>
            current.participants.get(member.socketId) === member);
    };

    const stop = (stream, problem) => {
        if (!stream.active) return;
        stream.active = false;
        clearTimeout(stream.setupTimer);
        clearInterval(stream.checkTimer);
        active.delete(stream);
        if (!stream.lookupPending) reservations.delete(stream);
        const owned = owners.get(stream.socket.id);
        owned?.delete(stream.id);
        if (owned?.size === 0) owners.delete(stream.socket.id);
        stream.utterances.clear();
        stream.retired.clear();
        for (const answer of [...stream.pendingAudio]) answer(problem || failure(503));
        if (stream.ws) {
            stream.ws.removeAllListeners("open");
            stream.ws.removeAllListeners("message");
            stream.ws.removeAllListeners("close");
            // A connecting socket can emit an error after terminate(). Never log its payload.
            stream.ws.removeAllListeners("error");
            stream.ws.on("error", () => {});
            stream.ws.terminate();
        }
        if (!stream.started) {
            stream.ack(problem || failure(503, "Đã dừng nhận diện âm thanh"));
        } else if (problem && stream.socket.connected) {
            stream.socket.emit("translation:event", {
                streamId: stream.id, speakerId: stream.request.speakerId,
                speakerName: stream.speakerName, type: "error",
                status: problem.status, message: problem.message,
            });
        }
    };

    const ensureAuthorized = stream => {
        if (isAuthorized(stream)) return true;
        stop(stream, failure(403));
        return false;
    };

    const ensureFreshUtterance = (stream, id) => {
        const ordinal = /^u[1-9]\d{0,14}$/.test(id) ? Number(id.slice(1)) : null;
        if (stream.retired.has(id) || (ordinal !== null && ordinal <= stream.retiredOrdinal)) throw new Error("Retired utterance");
    };
    const rememberUtterance = (stream, id, entry) => {
        if (!stream.utterances.has(id) && stream.utterances.size >= limits.maxUtterances) {
            const completed = [...stream.utterances].find(([, previous]) => previous.settled);
            if (!completed) throw Object.assign(new Error("Too many utterances"), { status: 429 });
            stream.utterances.delete(completed[0]);
            stream.retired.add(completed[0]);
            if (/^u[1-9]\d{0,14}$/.test(completed[0])) stream.retiredOrdinal = Math.max(stream.retiredOrdinal, Number(completed[0].slice(1)));
            if (stream.retired.size > limits.maxRetiredIds) stream.retired.delete(stream.retired.values().next().value);
        }
        stream.utterances.set(id, entry);
    };
    const validateEvent = (stream, value) => {
        if (!object(value)) throw new Error("Invalid upstream event");
        const { type } = value;
        const isSelf = stream.request.translate === false;
        if (type === "transcript") {
            if (!allowedKeys(value, ["type", "utteranceId", "revision", "original", "sourceLanguage", "targetLanguage", "isFinal", "translate"]) ||
                !utteranceId(value.utteranceId) || !revision(value.revision) ||
                typeof value.original !== "string" || !value.original.trim() || value.original.length > limits.maxTextLength ||
                value.sourceLanguage !== stream.request.sourceLanguage || value.targetLanguage !== stream.request.targetLanguage ||
                typeof value.isFinal !== "boolean" ||
                (value.translate !== undefined && typeof value.translate !== "boolean") ||
                (isSelf && value.translate === true) || (!isSelf && value.translate === false)) throw new Error("Invalid transcript");
            const previous = stream.utterances.get(value.utteranceId);
            if (!previous) ensureFreshUtterance(stream, value.utteranceId);
            if (previous && (previous.final || value.revision <= previous.revision)) throw new Error("Invalid revision");
            rememberUtterance(stream, value.utteranceId, { revision: value.revision, final: value.isFinal, settled: isSelf ? value.isFinal : false });
            return isSelf ? { ...value, translate: false } : value;
        }
        if (type === "translation") {
            if (isSelf) throw new Error("Invalid translation");
            const previous = stream.utterances.get(value.utteranceId);
            if (!allowedKeys(value, ["type", "utteranceId", "revision", "translated"]) ||
                !previous?.final || previous.settled || previous.revision !== value.revision ||
                typeof value.translated !== "string" || value.translated.length > limits.maxTextLength) throw new Error("Invalid translation");
            previous.settled = true;
            return value;
        }
        if (type !== "status" && type !== "error") throw new Error("Invalid upstream type");
        if (!allowedKeys(value, ["type", "status", "message", "utteranceId", "revision"]) ||
            typeof value.message !== "string" || value.message.length > limits.maxTextLength ||
            ((value.utteranceId !== undefined || value.revision !== undefined) &&
                (!utteranceId(value.utteranceId) || !revision(value.revision)))) throw new Error("Invalid upstream status");
        const previous = stream.utterances.get(value.utteranceId);
        if (previous && (previous.revision !== value.revision || previous.settled)) throw new Error("Invalid status revision");
        if (value.utteranceId && !previous) ensureFreshUtterance(stream, value.utteranceId);
        if (type === "error") {
            if (![400, 403, 408, 413, 422, 429, 500, 502, 503, 504].includes(value.status)) throw new Error("Invalid upstream error");
            if (value.utteranceId) rememberUtterance(stream, value.utteranceId, { revision: value.revision, final: true, settled: true });
            return { ...value, message: errorMessage(value.status) };
        }
        if (![202, 429, 503].includes(value.status)) throw new Error("Invalid upstream status");
        return { ...value, message: value.status === 202 ? "Đang xử lý âm thanh" : errorMessage(value.status) };
    };

    const start = async (socket, payload, acknowledge) => {
        let answered = false;
        const ack = value => {
            if (answered) return;
            answered = true;
            if (typeof acknowledge === "function") acknowledge(value);
        };
        const viewerId = socket.data.userId;
        if (!socket.connected || !viewerId) return ack(failure(403));
        if (!object(payload) || !allowedKeys(payload, ["kind", "sessionId", "speakerId", "sourceLanguage", "targetLanguage", "translate"]) ||
            !["direct", "group"].includes(payload.kind) || !identifier(payload.sessionId) || !identifier(payload.speakerId) ||
            !["en", "vi"].includes(payload.sourceLanguage) || !["en", "vi"].includes(payload.targetLanguage) ||
            (payload.translate !== undefined && typeof payload.translate !== "boolean")) return ack(failure(400));
        const isSelf = payload.translate === false;
        if (isSelf) {
            if (payload.speakerId !== viewerId || payload.sourceLanguage !== payload.targetLanguage) return ack(failure(400));
        } else {
            if (payload.sourceLanguage === payload.targetLanguage) return ack(failure(400));
            if (payload.speakerId === viewerId) return ack(failure(403));
        }
        const session = getSession(payload.kind, payload.sessionId, viewerId, payload.speakerId);
        if (!session) return ack(failure(403));
        let attendance;
        if (payload.kind === "group") {
            const viewer = session.participants.get(socket.id);
            const speakers = isSelf
                ? (viewer ? [viewer] : [])
                : [...session.participants.values()].filter(member => member.userId.toString() === payload.speakerId);
            if (viewer?.userId.toString() !== viewerId || !speakers.length) return ack(failure(403));
            attendance = isSelf ? [viewer] : [viewer, ...speakers];
        }
        const owned = owners.get(socket.id) || new Map();
        const replacing = [...owned.values()].filter(previous =>
            ["kind", "sessionId", "speakerId"].every(key => previous.request[key] === payload[key]));
        const reclaimable = replacing.filter(previous => !previous.lookupPending).length;
        const socketReservations = [...reservations].filter(previous => previous.socket.id === socket.id).length;
        if (socketReservations - reclaimable >= limits.maxSocketStreams ||
            reservations.size - reclaimable >= limits.maxProcessStreams) return ack(failure(429));
        // Direction/track replacement expires old in-flight starts as well as active work.
        for (const previous of replacing) {
            stop(previous, failure(503, "Đã thay đổi luồng nhận diện âm thanh"));
        }
        const stream = {
            id: randomUUID(), socket, viewerId, session, attendance, request: { ...payload },
            ack, active: true, lookupPending: true, started: false, utterances: new Map(), retired: new Set(), pendingAudio: new Set(), retiredOrdinal: 0, seq: 0,
            tokens: limits.burstPackets, lastRefill: now(), lastAudio: now(), speakerName: "Người dùng",
        };
        owned.set(stream.id, stream);
        owners.set(socket.id, owned);
        active.add(stream);
        reservations.add(stream);
        stream.setupTimer = setTimeout(() => stop(stream, failure(504)), limits.setupTimeoutMs);
        stream.setupTimer.unref?.();
        stream.checkTimer = setInterval(() => {
            if (!ensureAuthorized(stream)) return;
            if (stream.started && now() - stream.lastAudio > limits.inactivityMs) stop(stream, failure(408));
        }, limits.permissionCheckMs);
        stream.checkTimer.unref?.();
        try {
            let speaker;
            try { speaker = await findSpeaker(payload.speakerId); }
            finally {
                stream.lookupPending = false;
                if (!stream.active) reservations.delete(stream);
            }
            if (!stream.active) return;
            if (!ensureAuthorized(stream)) return;
            if (!speaker) return stop(stream, failure(403));
            stream.speakerName = String(speaker.displayName || speaker.username || "Người dùng").slice(0, 200);
            const url = new URL(process.env.TRANSLATION_AI_URL || "http://127.0.0.1:8001");
            if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid AI URL");
            url.protocol = ["https:", "wss:"].includes(url.protocol) ? "wss:" : "ws:";
            url.pathname = `${url.pathname.replace(/\/$/, "")}/stream/pcm`;
            url.search = "";
            url.hash = "";
            stream.ws = createWebSocket(url, {
                headers: { "x-api-key": process.env.TRANSLATION_AI_KEY || "" },
                maxPayload: limits.maxEventBytes, perMessageDeflate: false, handshakeTimeout: limits.setupTimeoutMs,
            });
            stream.ws.on("open", () => {
                if (!ensureAuthorized(stream)) return;
                const config = { sourceLanguage: payload.sourceLanguage, targetLanguage: payload.targetLanguage };
                if (isSelf) config.translate = false;
                stream.ws.send(JSON.stringify(config));
            });
            stream.ws.on("message", (data, binary) => {
                if (!ensureAuthorized(stream)) return;
                try {
                    if (binary || data.byteLength > limits.maxEventBytes) throw new Error("Invalid upstream packet");
                    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
                    if (!stream.started && object(value) && value.type === "ready" &&
                        allowedKeys(value, ["type", "sampleRate", "channels", "packetSamples"]) &&
                        value.sampleRate === limits.sampleRate && value.channels === limits.channels && value.packetSamples === limits.packetSamples) {
                        clearTimeout(stream.setupTimer);
                        stream.started = true;
                        stream.lastAudio = now();
                        return ack({ ok: true, streamId: stream.id, sampleRate: limits.sampleRate, channels: limits.channels, packetSamples: limits.packetSamples });
                    }
                    if (!stream.started) {
                        if (object(value) && value.type === "error") {
                            const safe = validateEvent(stream, value);
                            return stop(stream, failure(safe.status));
                        }
                        throw new Error("Missing upstream ready");
                    }
                    const safe = validateEvent(stream, value);
                    if (safe.type === "error" && !safe.utteranceId) return stop(stream, failure(safe.status));
                    socket.emit("translation:event", { ...safe, streamId: stream.id, speakerId: payload.speakerId, speakerName: stream.speakerName });
                } catch (error) { stop(stream, failure(error.status === 429 ? 429 : 503)); }
            });
            stream.ws.on("error", () => stop(stream, failure(503)));
            stream.ws.on("close", () => stop(stream, failure(503)));
        } catch { stop(stream, failure(503)); }
    };

    const audio = (socket, payload, acknowledge) => {
        const ack = value => { if (typeof acknowledge === "function") acknowledge(value); };
        const stream = object(payload) && owners.get(socket.id)?.get(payload.streamId);
        if (!stream?.active) return ack(failure(403));
        if (!ensureAuthorized(stream)) return ack(failure(403));
        const invalid = () => { const problem = failure(400); stop(stream, problem); ack(problem); };
        if (!stream.started || !allowedKeys(payload, ["streamId", "seq", "audio"]) ||
            !Number.isSafeInteger(payload.seq) || payload.seq !== stream.seq ||
            !(Buffer.isBuffer(payload.audio) || payload.audio instanceof ArrayBuffer) ||
            payload.audio.byteLength !== limits.packetBytes) return invalid();
        const time = now();
        stream.tokens = Math.min(limits.burstPackets, stream.tokens + (time - stream.lastRefill) * limits.maxPacketsPerSecond / 1000);
        stream.lastRefill = time;
        if (stream.tokens < 1 || stream.ws.bufferedAmount + limits.packetBytes > limits.maxBufferedBytes ||
            (stream.pendingAudio.size + 1) * limits.packetBytes > limits.maxBufferedBytes) {
            const problem = failure(429); stop(stream, problem); return ack(problem);
        }
        if (stream.ws.readyState !== WebSocket.OPEN) {
            const problem = failure(503); stop(stream, problem); return ack(problem);
        }
        stream.tokens -= 1;
        stream.seq += 1;
        stream.lastAudio = time;
        let answered = false;
        const answer = value => {
            if (answered) return;
            answered = true;
            stream.pendingAudio.delete(answer);
            ack(value);
        };
        stream.pendingAudio.add(answer);
        try {
            stream.ws.send(payload.audio instanceof ArrayBuffer ? Buffer.from(payload.audio) : payload.audio, { binary: true }, error => {
                if (!stream.active) return answer(failure(503));
                if (error) { const problem = failure(503); stop(stream, problem); return answer(problem); }
                if (!ensureAuthorized(stream)) return answer(failure(403));
                answer({ ok: true });
            });
        } catch { const problem = failure(503); stop(stream, problem); answer(problem); }
    };

    return {
        register(socket) {
            socket.on("translation:start", (payload, ack) => { void start(socket, payload, ack); });
            socket.on("translation:audio", (payload, ack) => audio(socket, payload, ack));
            socket.on("translation:stop", (payload, ack) => {
                const stream = object(payload) && owners.get(socket.id)?.get(payload.streamId);
                if (stream) stop(stream);
                if (typeof ack === "function") ack({ ok: Boolean(stream) });
            });
            socket.on("disconnect", () => {
                for (const stream of [...(owners.get(socket.id)?.values() || [])]) stop(stream);
            });
        },
        dispose() { for (const stream of [...active]) stop(stream); },
        get size() { return active.size; },
    };
}
