const MAX_EVENT_BYTES = 128 * 1024;
const MAX_STREAM_BYTES = MAX_EVENT_BYTES * 3;

export class TranslationStreamError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'TranslationStreamError';
        this.status = status;
    }
}

export const defaultTranslationDirection = language =>
    language?.startsWith('en') ? 'vi-en' : 'en-vi';

export const SUPPORTED_TARGET_LANGUAGES = ['vi', 'en'];
export const SUPPORTED_SOURCE_LANGUAGES = ['vi', 'en'];
export const defaultTargetLanguage = language =>
    language?.startsWith('en') ? 'en' : 'vi';

export function defaultTranslationPair(language) {
    const targetLanguage = defaultTargetLanguage(language);
    return { sourceLanguage: targetLanguage === 'en' ? 'vi' : 'en', targetLanguage };
}

export function updateTranslationPair(pair, field, language) {
    if (!['sourceLanguage', 'targetLanguage'].includes(field) ||
        !SUPPORTED_TARGET_LANGUAGES.includes(language) || pair[field] === language) return pair;
    const next = { ...pair, [field]: language };
    // Selecting the other side's language swaps the pair atomically.
    return next.sourceLanguage === next.targetLanguage
        ? { sourceLanguage: pair.targetLanguage, targetLanguage: pair.sourceLanguage }
        : next;
}

export function createTranslationRequest({ kind, sessionId, speakerId, isSelf, selfLanguage, sourceLanguage, targetLanguage,
    speakerSocketId, speakerAttendanceId, speakerLanguageRevision, viewerAttendanceId }) {
    if (kind === 'group') {
        if (!SUPPORTED_SOURCE_LANGUAGES.includes(sourceLanguage) || !SUPPORTED_TARGET_LANGUAGES.includes(targetLanguage) ||
            !speakerSocketId || !speakerAttendanceId || !viewerAttendanceId || !Number.isSafeInteger(speakerLanguageRevision) || speakerLanguageRevision < 0) {
            throw new RangeError('A declared speaker language and current attendance are required.');
        }
        return { kind, sessionId, speakerId, speakerSocketId, speakerAttendanceId, speakerLanguageRevision, viewerAttendanceId,
            sourceLanguage, targetLanguage, ...(sourceLanguage === targetLanguage ? { translate: false } : {}) };
    }
    if (!SUPPORTED_TARGET_LANGUAGES.includes(sourceLanguage) ||
        !SUPPORTED_TARGET_LANGUAGES.includes(targetLanguage) || sourceLanguage === targetLanguage) {
        throw new RangeError('A distinct, explicit source and target language are required.');
    }
    const spokenLanguage = selfLanguage ?? targetLanguage;
    if (isSelf && !SUPPORTED_SOURCE_LANGUAGES.includes(spokenLanguage)) {
        throw new RangeError('An explicit spoken language is required.');
    }
    return isSelf
        ? { kind, sessionId, speakerId, sourceLanguage: spokenLanguage, targetLanguage: spokenLanguage, translate: false }
        : { kind, sessionId, speakerId, sourceLanguage, targetLanguage };
}

const sourceId = value => typeof value === 'string' ? value.trim() :
    typeof value?._id === 'string' ? value._id.trim() : '';

// A viewer's own microphone is never translated; remoteTranslationSources filters to peers only.
export function remoteTranslationSources(sources, viewerId) {
    const viewer = sourceId(viewerId);
    const unique = new Map();
    if (!viewer) return [];
    for (const source of sources || []) {
        const id = sourceId(source.id);
        const track = source.stream?.getAudioTracks()[0];
        if (!id || id === viewer || !track || source.muted || track.enabled === false || track.muted || track.readyState !== 'live') continue;
        unique.set(id, { id, track });
    }
    return [...unique.values()];
}

// Includes both the viewer's own microphone (isSelf=true, transcribed without translation)
// and remote peers (isSelf=false, transcribed and translated).
export function conversationTranslationSources(sources, viewerId, kind = 'direct') {
    const viewer = sourceId(viewerId);
    const unique = new Map();
    if (!viewer) return [];
    for (const source of sources || []) {
        const id = sourceId(source.id);
        const track = source.stream?.getAudioTracks()[0];
        if (!id || !track || source.muted || track.enabled === false || track.muted || track.readyState !== 'live') continue;
        if (kind === 'group') {
            if (!source.socketId || !source.attendanceId || !SUPPORTED_SOURCE_LANGUAGES.includes(source.spokenLanguage) ||
                !Number.isSafeInteger(source.languageRevision) || source.languageRevision < 0) continue;
            const key = `${source.socketId}:${source.attendanceId}`;
            unique.set(key, { id, key, track, isSelf: Boolean(source.isSelf), sourceLanguage: source.spokenLanguage,
                speakerSocketId: source.socketId, speakerAttendanceId: source.attendanceId, speakerLanguageRevision: source.languageRevision });
        } else unique.set(id, { id, track, isSelf: id === viewer });
    }
    return [...unique.values()];
}

const protocolError = () => new TranslationStreamError('Invalid translation stream.');
const abortError = () => new DOMException('Translation interrupted.', 'AbortError');

// Decode complete events only; network boundaries can split both JSON and UTF-8.
export async function consumeTranslationStream(stream, onEvent, expected = {}, signal) {
    if (!stream?.getReader) throw protocolError();
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const encoder = new TextEncoder();
    let buffer = '';
    let totalBytes = 0;
    let state = 'initial';
    const onAbort = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', onAbort, { once: true });

    const emit = line => {
        if (!line.trim()) return;
        if (encoder.encode(line).byteLength > MAX_EVENT_BYTES || state === 'complete') throw protocolError();
        let event;
        try { event = JSON.parse(line); } catch { throw protocolError(); }
        if (!event || typeof event !== 'object') throw protocolError();
        if (event.type === 'error') {
            if (!Number.isInteger(event.status) || event.status < 400 || event.status > 599 ||
                typeof event.message !== 'string' || event.message.length > 4096) throw protocolError();
            state = 'complete';
            throw new TranslationStreamError(event.message, event.status);
        }
        if (state === 'initial' && event.type === 'transcript') {
            if (typeof event.original !== 'string' || event.original.length > 32768 ||
                typeof event.speakerId !== 'string' || !event.speakerId ||
                (event.speakerName !== undefined && typeof event.speakerName !== 'string') ||
                !SUPPORTED_SOURCE_LANGUAGES.includes(event.sourceLanguage) || !SUPPORTED_TARGET_LANGUAGES.includes(event.targetLanguage) ||
                (expected.speakerId && event.speakerId !== expected.speakerId) ||
                (expected.sourceLanguage && expected.sourceLanguage !== 'auto' && event.sourceLanguage !== expected.sourceLanguage) ||
                (expected.targetLanguage && event.targetLanguage !== expected.targetLanguage)) throw protocolError();
            state = 'transcribed';
        } else if (state === 'transcribed' && event.type === 'translation') {
            if (typeof event.translated !== 'string' || event.translated.length > 32768) throw protocolError();
            state = 'complete';
        } else {
            throw protocolError();
        }
        if (signal?.aborted) throw abortError();
        onEvent(event);
    };

    try {
        while (true) {
            if (signal?.aborted) throw abortError();
            const { done, value } = await reader.read();
            if (signal?.aborted) throw abortError();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_STREAM_BYTES) throw protocolError();
            buffer += decoder.decode(value, { stream: true });
            let newline;
            while ((newline = buffer.indexOf('\n')) !== -1) {
                emit(buffer.slice(0, newline));
                buffer = buffer.slice(newline + 1);
            }
            if (encoder.encode(buffer).byteLength > MAX_EVENT_BYTES) throw protocolError();
        }
        buffer += decoder.decode();
        emit(buffer);
        if (state !== 'complete') throw new TranslationStreamError('Translation ended before a result was received.');
    } finally {
        signal?.removeEventListener('abort', onAbort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

// Axios' fetch adapter leaves non-2xx response bodies as streams too.
export async function translationRequestError(error) {
    const status = error.status || error.response?.status;
    const body = error.response?.data;
    let message = body?.message;
    if (body?.getReader) {
        const reader = body.getReader();
        let bytes = 0;
        let text = '';
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > 16384) break;
                text += decoder.decode(value, { stream: true });
            }
            if (bytes <= 16384) message = JSON.parse(text + decoder.decode()).message;
        } catch { /* Use the local fallback for non-JSON and interrupted responses. */ }
        finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
        }
    }
    return { status, message: typeof message === 'string' ? message : '' };
}
