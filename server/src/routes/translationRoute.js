import { Router } from "express";
import multer from "multer";
import User from "../models/User.js";
import { getTranslationSession } from "../socket/socket.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const AI_URL = process.env.TRANSLATION_AI_URL || "http://127.0.0.1:8001";
const AI_KEY = process.env.TRANSLATION_AI_KEY || "";
const AUDIO_TYPES = new Map([
    ["audio/webm", "webm"], ["audio/mp4", "mp4"], ["audio/wav", "wav"],
]);

async function callAi(path, options = {}, stream = false) {
    const response = await fetch(`${AI_URL}${path}`, {
        ...options,
        headers: { ...(AI_KEY ? { "x-api-key": AI_KEY } : {}), ...options.headers },
        signal: AbortSignal.any([
            AbortSignal.timeout(path.split("?")[0] === "/health" ? 15000 : 90000),
            ...(options.signal ? [options.signal] : []),
        ]),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = new Error(`AI service returned ${response.status}`);
        error.status = response.status;
        error.aiStatus = body.detail?.status;
        throw error;
    }
    return stream ? response : response.json();
}

const parseAudio = (req, res, next) => {
    upload.single("audio")(req, res, error => {
        if (!error) return next();
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
            message: tooLarge ? "Âm thanh vượt quá giới hạn 2 MiB" : "Dữ liệu âm thanh không hợp lệ",
        });
    });
};

const safeError = error => {
    const timeout = error?.name === "TimeoutError" || error.status === 504;
    const status = [400, 403, 413, 422, 429].includes(error.status) ? error.status : timeout ? 504 : 503;
    const message = status === 403 ? "Bạn không còn tham gia cuộc gọi này" :
        status === 429 ? "Máy chủ dịch đang bận; sẽ thử đoạn âm thanh mới" :
            [400, 413, 422].includes(status) ? "Âm thanh hoặc ngôn ngữ nhận diện không hợp lệ" :
                timeout ? "Máy chủ dịch không phản hồi" : "Không thể dịch âm thanh lúc này";
    return { status, message };
};

const invalidStream = () => Object.assign(new Error("Invalid AI stream"), { status: 503 });
const MAX_EVENT_BYTES = 64 * 1024;

async function* readAiEvents(reader) {
    let pending = Buffer.alloc(0);
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending = Buffer.concat([pending, value]);
        let newline;
        while ((newline = pending.indexOf(10)) !== -1) {
            if (newline === 0 || newline > MAX_EVENT_BYTES) throw invalidStream();
            let event;
            try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pending.subarray(0, newline))); }
            catch { throw invalidStream(); }
            pending = pending.subarray(newline + 1);
            if (!event || typeof event !== "object" || Array.isArray(event)) throw invalidStream();
            yield event;
        }
        if (pending.length > MAX_EVENT_BYTES) throw invalidStream();
    }
    // A final newline is required so a truncated final event cannot look complete.
    if (pending.length) throw invalidStream();
}

// A group room can survive a participant leaving/rejoining. Pin the participant
// records as well as the room object so work from that earlier attendance expires.
const pinParticipants = (session, viewerId, speakerId) => session.participants ?
    [...session.participants.values()].filter(member => [viewerId, speakerId].includes(member.userId.toString())) : null;

const sameParticipants = (session, pinned) => !pinned ||
    pinned.every(member => [...session.participants.values()].includes(member));

router.get("/health", async (req, res) => {
    const { mode } = req.query;
    if (mode !== undefined && !["transcribe", "pcm"].includes(mode)) {
        return res.status(400).json({ message: "Chế độ kiểm tra dịch vụ không hợp lệ" });
    }
    try {
        const status = await callAi(mode ? `/health?mode=${mode}` : "/health");
        res.json(status);
    } catch (error) {
        console.error("[translation:health]", error.message);
        const message = error.aiStatus === "loading" ? "Model AI đang tải, hãy thử lại sau" :
            error.aiStatus === "error" ? "Model AI tải lỗi, hãy kiểm tra log dịch vụ" :
            error.status === 401 ? "Khóa kết nối AI không hợp lệ" :
                error.name === "TimeoutError" ? "Dịch vụ AI phản hồi quá chậm" :
                    "Dịch vụ AI chưa chạy hoặc chưa kết nối được";
        res.status(503).json({
            message,
            status: error.aiStatus === "loading" || error.name === "TimeoutError" ? "loading" : "error",
        });
    }
});

router.post("/chunk", parseAudio, async (req, res) => {
    const { kind, sessionId, speakerId, targetLanguage, sourceLanguage = "auto" } = req.body || {};
    const viewerId = req.user._id.toString();
    if (!req.file || !["en", "vi"].includes(targetLanguage) ||
        !["en", "vi", "auto"].includes(sourceLanguage) || !["group", "direct"].includes(kind)) {
        return res.status(400).json({ message: "Dữ liệu âm thanh hoặc ngôn ngữ không hợp lệ" });
    }
    const session = getTranslationSession(kind, sessionId, viewerId, speakerId);
    if (!session) {
        return res.status(403).json({ message: "Bạn không tham gia cuộc gọi này" });
    }
    const pinned = pinParticipants(session, viewerId, speakerId);
    const contentType = req.file.mimetype.split(";")[0].trim().toLowerCase();
    if (!AUDIO_TYPES.has(contentType) || !req.file.size) {
        return res.status(400).json({ message: "Định dạng âm thanh không hợp lệ" });
    }
    const controller = new AbortController();
    const abortOnClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", abortOnClose);
    try {
        const speaker = await User.findById(speakerId).select("displayName username");
        if (!speaker) return res.status(404).json({ message: "Không tìm thấy người nói" });
        if (getTranslationSession(kind, sessionId, viewerId, speakerId) !== session || !sameParticipants(session, pinned)) {
            return res.status(403).json({ message: "Bạn không còn tham gia cuộc gọi này" });
        }
        const form = new FormData();
        form.append("audio", new Blob([req.file.buffer], { type: contentType }),
            `clip.${AUDIO_TYPES.get(contentType)}`);
        form.append("target_language", targetLanguage);
        form.append("source_language", sourceLanguage);
        const result = await callAi("/translate", { method: "POST", body: form, signal: controller.signal });
        if (getTranslationSession(kind, sessionId, viewerId, speakerId) !== session || !sameParticipants(session, pinned)) {
            return res.status(403).json({ message: "Bạn không còn tham gia cuộc gọi này" });
        }
        res.json({
            speakerId,
            speakerName: speaker.displayName || speaker.username || "Người dùng",
            original: result.original || "",
            translated: result.translated || "",
            sourceLanguage: result.source_language || "",
            targetLanguage,
        });
    } catch (error) {
        if (controller.signal.aborted) return;
        if (error.status === 429) {
            return res.status(429).json({ status: "busy", message: "Máy chủ dịch đang bận; sẽ thử đoạn âm thanh mới" });
        }
        console.error("[translation:chunk]", error.message);
        const timeout = error?.name === "TimeoutError" || error.status === 504;
        const invalidAudio = [400, 413, 422].includes(error.status);
        res.status(invalidAudio ? error.status : timeout ? 504 : 503).json({
            message: invalidAudio ? "Âm thanh hoặc ngôn ngữ nhận diện không hợp lệ" :
                timeout ? "Máy chủ dịch không phản hồi" : "Không thể dịch âm thanh lúc này",
        });
    } finally {
        res.off("close", abortOnClose);
    }
});

router.post("/chunk-stream", parseAudio, async (req, res) => {
    const { kind, sessionId, speakerId, targetLanguage, sourceLanguage = "auto" } = req.body || {};
    const viewerId = req.user._id.toString();
    if (!req.file || !["en", "vi"].includes(targetLanguage) ||
        !["en", "vi", "auto"].includes(sourceLanguage) || !["group", "direct"].includes(kind)) {
        return res.status(400).json({ message: "Dữ liệu âm thanh hoặc ngôn ngữ không hợp lệ" });
    }
    const session = getTranslationSession(kind, sessionId, viewerId, speakerId);
    if (!session) return res.status(403).json({ message: "Bạn không tham gia cuộc gọi này" });
    const pinned = pinParticipants(session, viewerId, speakerId);
    const ensureSession = () => {
        if (getTranslationSession(kind, sessionId, viewerId, speakerId) !== session || !sameParticipants(session, pinned)) {
            throw Object.assign(new Error("Call access revoked"), { status: 403 });
        }
    };
    const contentType = req.file.mimetype.split(";")[0].trim().toLowerCase();
    if (!AUDIO_TYPES.has(contentType) || !req.file.size) {
        return res.status(400).json({ message: "Định dạng âm thanh không hợp lệ" });
    }
    const controller = new AbortController();
    const abortOnClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", abortOnClose);
    let reader;
    const sendEvent = event => {
        ensureSession();
        if (controller.signal.aborted || res.destroyed) return;
        if (!res.headersSent) {
            res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
            res.flushHeaders();
        }
        res.write(`${JSON.stringify(event)}\n`);
    };
    try {
        const speaker = await User.findById(speakerId).select("displayName username");
        if (!speaker) return res.status(404).json({ message: "Không tìm thấy người nói" });
        ensureSession();
        if (controller.signal.aborted) return;
        const form = new FormData();
        form.append("audio", new Blob([req.file.buffer], { type: contentType }), `clip.${AUDIO_TYPES.get(contentType)}`);
        form.append("target_language", targetLanguage);
        form.append("source_language", sourceLanguage);
        form.append("stream", "true");
        const upstream = await callAi("/translate", { method: "POST", body: form, signal: controller.signal }, true);
        if (upstream.headers.get("content-type")?.split(";")[0].trim() !== "application/x-ndjson" || !upstream.body) {
            await upstream.body?.cancel();
            throw invalidStream();
        }
        reader = upstream.body.getReader();
        let receivedTranscript = false;
        let finalEvent;
        for await (const event of readAiEvents(reader)) {
            ensureSession();
            if (finalEvent) throw invalidStream();
            if (event.type === "transcript" && !receivedTranscript &&
                Object.keys(event).every(key => ["type", "original", "source_language"].includes(key)) &&
                typeof event.original === "string" && typeof event.source_language === "string" &&
                (event.original ? ["en", "vi"].includes(event.source_language) : ["", "en", "vi"].includes(event.source_language))) {
                receivedTranscript = true;
                sendEvent({ type: "transcript", speakerId, speakerName: speaker.displayName || speaker.username || "Người dùng",
                    original: event.original, sourceLanguage: event.source_language, targetLanguage });
            } else if (event.type === "translation" && receivedTranscript && typeof event.translated === "string" &&
                Object.keys(event).every(key => ["type", "translated"].includes(key))) {
                finalEvent = { type: "translation", translated: event.translated };
            } else if (event.type === "error" && Object.keys(event).every(key => ["type", "status", "message"].includes(key)) &&
                [400, 403, 413, 422, 429, 503, 504].includes(event.status) && typeof event.message === "string") {
                finalEvent = { type: "error", ...safeError(event) };
            } else throw invalidStream();
        }
        if (!finalEvent) throw invalidStream();
        if (finalEvent.type === "error" && !res.headersSent) {
            return res.status(finalEvent.status).json({ message: finalEvent.message });
        }
        sendEvent(finalEvent);
        res.end();
    } catch (error) {
        if (controller.signal.aborted || res.destroyed) return;
        const failure = safeError(error);
        if (!res.headersSent) {
            return res.status(failure.status).json({ ...(failure.status === 429 ? { status: "busy" } : {}), message: failure.message });
        }
        // A revocation sends no further note content; only a safe terminal error.
        res.end(`${JSON.stringify({ type: "error", ...failure })}\n`);
    } finally {
        controller.abort();
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
        res.off("close", abortOnClose);
    }
});

export default router;
