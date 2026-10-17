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

async function callAi(path, options = {}) {
    const response = await fetch(`${AI_URL}${path}`, {
        ...options,
        headers: { ...(AI_KEY ? { "x-api-key": AI_KEY } : {}), ...options.headers },
        signal: AbortSignal.any([
            AbortSignal.timeout(path === "/health" ? 15000 : 90000),
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
    return response.json();
}

router.get("/health", async (_req, res) => {
    try {
        const status = await callAi("/health");
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

router.post("/chunk", (req, res, next) => {
    upload.single("audio")(req, res, error => {
        if (!error) return next();
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
            message: tooLarge ? "Âm thanh vượt quá giới hạn 2 MiB" : "Dữ liệu âm thanh không hợp lệ",
        });
    });
}, async (req, res) => {
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
        if (getTranslationSession(kind, sessionId, viewerId, speakerId) !== session) {
            return res.status(403).json({ message: "Bạn không còn tham gia cuộc gọi này" });
        }
        const form = new FormData();
        form.append("audio", new Blob([req.file.buffer], { type: contentType }),
            `clip.${AUDIO_TYPES.get(contentType)}`);
        form.append("target_language", targetLanguage);
        form.append("source_language", sourceLanguage);
        const result = await callAi("/translate", { method: "POST", body: form, signal: controller.signal });
        if (getTranslationSession(kind, sessionId, viewerId, speakerId) !== session) {
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

export default router;
