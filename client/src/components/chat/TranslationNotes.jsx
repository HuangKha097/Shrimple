import { useEffect, useRef, useState } from 'react';
import { Languages, X, ArrowLeftRight, Trash2, Sparkles } from 'lucide-react';
import api from '../../lib/axios.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import './TranslationNotes.css';

const HEALTH_TIMEOUT = 20000;
const HEALTH_RETRY_MS = 3000;
const HEALTH_STARTUP_TIMEOUT = 10 * 60 * 1000;
const CHUNK_TIMEOUT = 95000;
const CLIP_MS = 6000;
const MAX_PENDING_CLIPS = 1;

const errorMessage = (error, fallback) =>
    [401, 403].includes(error.response?.status)
        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
        : error.response?.data?.message || fallback;

export default function TranslationNotes({ active, kind, sessionId, sources }) {
    const { user } = useAuthStore();
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [notes, setNotes] = useState([]);
    // Default direction: Vietnamese -> English ('vi-en')
    // Alternate direction: English -> Vietnamese ('en-vi')
    const [direction, setDirection] = useState('vi-en');
    const [processingCount, setProcessingCount] = useState(0);
    const [skippedClips, setSkippedClips] = useState(false);

    const sourceLanguage = direction === 'vi-en' ? 'vi' : 'en';
    const targetLanguage = direction === 'vi-en' ? 'en' : 'vi';

    const controllers = useRef(new Set());
    const recorders = useRef([]);
    const closeTimer = useRef(null);
    const notesEndRef = useRef(null);

    const toggleDirection = () => {
        setNotes([]);
        setSkippedClips(false);
        setDirection(prev => (prev === 'vi-en' ? 'en-vi' : 'vi-en'));
    };

    const stop = () => {
        recorders.current.forEach(({ recorder, timer }) => {
            clearTimeout(timer);
            recorder.onstop = null;
            if (recorder.state !== 'inactive') recorder.stop();
        });
        recorders.current = [];
        controllers.current.forEach(controller => controller.abort());
        controllers.current.clear();
    };

    useEffect(() => {
        if (active) return;
        stop();
        setOpen(false);
        setNotes([]);
        setStatus('idle');
        setProcessingCount(0);
        setSkippedClips(false);
    }, [active]);

    useEffect(() => () => {
        stop();
        clearTimeout(closeTimer.current);
    }, []);

    useEffect(() => {
        if (open && notes.length > 0) {
            notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [notes, open]);

    useEffect(() => {
        if (!open || !active) return;
        let cancelled = false;
        let retryTimer;
        let currentController;
        const activeControllers = controllers.current;
        const started = Date.now();
        setStatus('loading');
        setError('');
        const checkHealth = async () => {
            const controller = new AbortController();
            currentController = controller;
            activeControllers.add(controller);
            const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
            try {
                await api.get('/api/translation/health', { signal: controller.signal });
                if (!cancelled) setStatus('ready');
            } catch (error) {
                if (cancelled) return;
                if (error.response?.data?.status === 'loading' &&
                    Date.now() - started < HEALTH_STARTUP_TIMEOUT) {
                    retryTimer = setTimeout(checkHealth, HEALTH_RETRY_MS);
                    return;
                }
                setStatus('error');
                setError(`${errorMessage(error, 'Không kết nối được máy chủ dịch.')} Bảng note sẽ đóng.`);
                closeTimer.current = setTimeout(() => setOpen(false), 2500);
            } finally {
                clearTimeout(timeout);
                activeControllers.delete(controller);
                if (currentController === controller) currentController = null;
            }
        };
        void checkHealth();
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
            currentController?.abort();
        };
    }, [open, active]);

    useEffect(() => {
        if (!open || status !== 'ready' || !sessionId) return;
        if (typeof MediaRecorder === 'undefined') {
            setStatus('error');
            setError('Trình duyệt không hỗ trợ ghi âm để dịch.');
            closeTimer.current = setTimeout(() => setOpen(false), 2500);
            return;
        }
        let stopped = false;
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
            .find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) {
            setStatus('error');
            setError('Trình duyệt không hỗ trợ định dạng âm thanh để dịch.');
            closeTimer.current = setTimeout(() => setOpen(false), 2500);
            return;
        }

        const fail = (message) => {
            if (stopped) return;
            setStatus('error');
            setError(message);
            closeTimer.current = setTimeout(() => setOpen(false), 2500);
        };

        const sendClip = async (blob, speakerId) => {
            if (stopped || blob.size < 1000) return;
            const controller = new AbortController();
            controllers.current.add(controller);
            const timeout = setTimeout(() => controller.abort(), CHUNK_TIMEOUT);
            try {
                const form = new FormData();
                form.append('audio', blob, mimeType === 'audio/mp4' ? 'clip.mp4' : 'clip.webm');
                form.append('kind', kind);
                form.append('sessionId', sessionId);
                form.append('speakerId', speakerId);
                form.append('targetLanguage', targetLanguage);
                form.append('sourceLanguage', sourceLanguage);
                const response = await api.post('/api/translation/chunk', form, { signal: controller.signal });
                const result = response.data;
                if (!stopped && result.translated) {
                    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setNotes(previous => [...previous.slice(-49), { ...result, id: crypto.randomUUID(), time }]);
                }
            } catch (error) {
                fail(`${errorMessage(error, 'Máy chủ dịch không phản hồi.')} Bảng note sẽ đóng.`);
            } finally {
                clearTimeout(timeout);
                controllers.current.delete(controller);
            }
        };

        const startSource = ({ id, stream, muted }) => {
            const track = stream?.getAudioTracks()[0];
            if (!id || !track || muted) return;
            const pending = [];
            let draining = false;
            const drain = async () => {
                if (draining) return;
                draining = true;
                while (!stopped && pending.length > 0) {
                    const next = pending.shift();
                    try {
                        await sendClip(next, id);
                    } finally {
                        if (!stopped) setProcessingCount(count => Math.max(0, count - 1));
                    }
                }
                draining = false;
            };
            const record = () => {
                if (stopped || track.readyState !== 'live') return;
                const recorder = new MediaRecorder(new MediaStream([track]), { mimeType });
                const chunks = [];
                recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
                recorder.onerror = () => fail('Không thể ghi âm cuộc gọi để dịch.');
                recorder.onstop = () => {
                    clearTimeout(timer);
                    recorders.current = recorders.current.filter(entry => entry.recorder !== recorder);
                    const blob = new Blob(chunks, { type: mimeType });
                    record();
                    if (stopped || blob.size < 1000) return;
                    if (pending.length >= MAX_PENDING_CLIPS) {
                        pending.shift();
                        setProcessingCount(count => Math.max(0, count - 1));
                        setSkippedClips(true);
                    }
                    pending.push(blob);
                    setProcessingCount(count => count + 1);
                    void drain();
                };
                recorder.start();
                const timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, CLIP_MS);
                recorders.current.push({ recorder, timer });
            };
            record();
        };
        sources.forEach(startSource);
        return () => { stopped = true; stop(); setProcessingCount(0); };
    }, [open, status, kind, sessionId, sources, targetLanguage, sourceLanguage]);

    if (!active) return null;
    return (
        <>
            <button
                type="button"
                className={`translation-toggle ${open ? 'active' : ''}`}
                onClick={() => { clearTimeout(closeTimer.current); if (!open) setSkippedClips(false); setOpen(value => !value); }}
                title={open ? 'Đóng note dịch thuật' : 'Bật mic dịch thuật'}
                aria-label={open ? 'Đóng note dịch thuật' : 'Bật mic dịch thuật'}
            >
                <Languages size={20} />
                <span>Mic dịch</span>
            </button>

            {open && (
                <aside className="translation-panel" aria-label="Note dịch thuật">
                    {/* Header */}
                    <div className="translation-header">
                        <div className="translation-title-area">
                            <div className="translation-icon-badge">
                                <Languages size={17} />
                            </div>
                            <span className="translation-title">Note dịch thuật</span>
                        </div>
                        <div className="translation-header-actions">
                            {notes.length > 0 && (
                                <button
                                    type="button"
                                    className="translation-action-btn"
                                    onClick={() => setNotes([])}
                                    title="Xóa lịch sử dịch"
                                    aria-label="Xóa lịch sử dịch"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <button
                                type="button"
                                className="translation-close-btn"
                                onClick={() => setOpen(false)}
                                title="Đóng note dịch"
                                aria-label="Đóng note"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Direction Setting Card - Style X */}
                    <div className="translation-setting-card">
                        <div className="translation-direction-row">
                            <button
                                type="button"
                                className="translation-lang-box source"
                                onClick={toggleDirection}
                                title="Bấm để đổi chiều dịch"
                            >
                                <span className="translation-lang-role">Giọng nói</span>
                                <div className="translation-lang-label">
                                    <span className="translation-flag">{direction === 'vi-en' ? '🇻🇳' : '🇬🇧'}</span>
                                    <span className="translation-lang-name">
                                        {direction === 'vi-en' ? 'Tiếng Việt' : 'English'}
                                    </span>
                                </div>
                            </button>

                            <button
                                type="button"
                                className="translation-swap-btn"
                                onClick={toggleDirection}
                                title="Đổi chiều dịch (Bấm để chuyển đổi)"
                                aria-label="Đổi chiều dịch"
                            >
                                <ArrowLeftRight size={17} />
                            </button>

                            <button
                                type="button"
                                className="translation-lang-box target"
                                onClick={toggleDirection}
                                title="Bấm để đổi chiều dịch"
                            >
                                <span className="translation-lang-role">Dịch sang</span>
                                <div className="translation-lang-label">
                                    <span className="translation-flag">{direction === 'vi-en' ? '🇬🇧' : '🇻🇳'}</span>
                                    <span className="translation-lang-name">
                                        {direction === 'vi-en' ? 'English' : 'Tiếng Việt'}
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Status Bar */}
                    <div className="translation-status-bar">
                        {status === 'loading' && (
                            <div className="translation-state loading">
                                <span className="translation-pulse-dot loading" />
                                <span>Đang khởi động model dịch thuật; lần đầu có thể mất vài phút...</span>
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="translation-error" role="alert">
                                <span className="translation-error-icon">!</span>
                                <span>{error}</span>
                            </div>
                        )}
                        {status === 'ready' && (
                            <>
                                <div className="translation-state ready">
                                    <span className={`translation-pulse-dot ${processingCount > 0 ? 'processing' : 'live'}`} />
                                    <span>
                                        {processingCount > 0
                                            ? 'Đang nhận diện giọng nói & dịch...'
                                            : `Đang nghe cuộc gọi (${direction === 'vi-en' ? 'VI ➔ EN' : 'EN ➔ VI'})`}
                                    </span>
                                </div>
                                {skippedClips && <div className="translation-warning">Máy chủ xử lý chậm; một số đoạn âm thanh đã bị bỏ qua.</div>}
                            </>
                        )}
                    </div>

                    {/* Translation List - Synchronized with Chat Message Box */}
                    <div className="translation-list" aria-live="polite">
                        {notes.length === 0 ? (
                            <div className="translation-empty">
                                <div className="translation-empty-icon">
                                    <Sparkles size={22} />
                                </div>
                                <div className="translation-empty-title">Chưa có nội dung dịch</div>
                                <div className="translation-empty-desc">
                                    Âm thanh cuộc gọi sẽ được dịch tự động từ{' '}
                                    <strong>{direction === 'vi-en' ? 'Tiếng Việt sang English' : 'English sang Tiếng Việt'}</strong>{' '}
                                    theo thời gian thực.
                                </div>
                            </div>
                        ) : (
                            notes.map(note => {
                                const isMe = Boolean(user?._id && note.speakerId === user._id);
                                return (
                                    <div
                                        className={`translation-msg-wrapper ${isMe ? 'me' : 'other'}`}
                                        key={note.id}
                                    >
                                        {!isMe && (
                                            <div className="translation-msg-avatar" title={note.speakerName}>
                                                {note.speakerName?.[0]?.toUpperCase() || 'U'}
                                            </div>
                                        )}
                                        <div className="translation-msg-content">
                                            {!isMe && (
                                                <div className="translation-msg-sender">{note.speakerName}</div>
                                            )}
                                            <div className="translation-msg-bubble">
                                                <div className="translation-msg-text">{note.translated}</div>
                                                {note.original && note.original !== note.translated && (
                                                    <div className="translation-msg-original">
                                                        <span className="translation-original-prefix">Gốc:</span> {note.original}
                                                    </div>
                                                )}
                                            </div>
                                            {note.time && (
                                                <div className="translation-msg-meta">
                                                    <span className="translation-msg-time">{note.time}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={notesEndRef} />
                    </div>
                </aside>
            )}
        </>
    );
}
