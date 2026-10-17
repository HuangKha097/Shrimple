import { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, ArrowLeftRight, Trash2, Sparkles, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../lib/axios.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { conversationTranslationSources, defaultTranslationDirection } from './translationStream.js';
import { createPcmAudioContext, createPcmCapture } from './translationPcmCapture.js';
import { createTranslationPcmSocket } from './translationPcmSocket.js';
import { interruptTranslationNotes, reduceTranslationNotes } from './translationNotesState.js';
import pcmWorkletUrl from './translationPcmWorklet.js?url';
import './TranslationNotes.css';

const HEALTH_TIMEOUT = 20000;
const HEALTH_RETRY_MS = 3000;
const HEALTH_STARTUP_TIMEOUT = 10 * 60 * 1000;
const STREAM_RETRY_MS = 1000;

const formatElapsed = startedAt => {
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};

export default function TranslationNotes({ active, kind, sessionId, sources }) {
    const { user, socket } = useAuthStore();
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [notes, setNotes] = useState([]);
    const [direction, setDirection] = useState(() => defaultTranslationDirection(i18n.resolvedLanguage || i18n.language));
    const [skippedClips, setSkippedClips] = useState(false);
    const [healthAttempt, setHealthAttempt] = useState(0);
    const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
    const [connected, setConnected] = useState(Boolean(socket?.connected));
    const sourceLanguage = direction === 'vi-en' ? 'vi' : 'en';
    const targetLanguage = direction === 'vi-en' ? 'en' : 'vi';
    const streams = useRef(new Map());
    const audioRef = useRef(null);
    const generation = useRef(0);
    const notesEndRef = useRef(null);
    const sessionStartRef = useRef(Date.now());
    const processingCount = notes.filter(note => note.translationState === 'pending').length;

    const prepareAudio = useCallback(() => {
        if (!audioRef.current || audioRef.current.context.state === 'closed') {
            const context = createPcmAudioContext();
            const moduleReady = context.audioWorklet.addModule(pcmWorkletUrl);
            // Loading starts during the gesture; capture observes any failure later.
            void moduleReady.catch(() => {});
            audioRef.current = { context, moduleReady };
        }
        void audioRef.current.context.resume().catch(() => {});
        return audioRef.current;
    }, []);

    const stop = useCallback(() => {
        generation.current += 1;
        streams.current.forEach(source => source.stop());
        streams.current.clear();
        const audio = audioRef.current;
        audioRef.current = null;
        if (audio && audio.context.state !== 'closed') void audio.context.close().catch(() => {});
        setNotes(previous => interruptTranslationNotes(previous));
    }, []);

    const togglePanel = () => {
        if (open) { stop(); setOpen(false); return; }
        try { prepareAudio(); } catch { /* Capture reports unsupported browsers after health. */ }
        setOpen(true);
    };

    const toggleDirection = () => {
        stop();
        try { prepareAudio(); } catch { /* Capture shows the actionable error. */ }
        setNotes([]);
        setSkippedClips(false);
        setDirection(previous => previous === 'vi-en' ? 'en-vi' : 'vi-en');
    };

    const retry = () => {
        stop();
        try { prepareAudio(); } catch { /* Capture shows the actionable error. */ }
        setHealthAttempt(value => value + 1);
    };

    useEffect(() => {
        stop();
        sessionStartRef.current = Date.now();
        setOpen(false);
        setNotes([]);
        setStatus('idle');
        setError('');
        setSkippedClips(false);
    }, [active, kind, sessionId, user?._id, stop]);

    useEffect(() => () => stop(), [stop]);

    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') stop();
            setVisible(document.visibilityState !== 'hidden');
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [stop]);

    useEffect(() => {
        const onConnect = () => setConnected(true);
        const onDisconnect = () => { stop(); setConnected(false); };
        setConnected(Boolean(socket?.connected));
        socket?.on('connect', onConnect);
        socket?.on('disconnect', onDisconnect);
        return () => {
            socket?.off('connect', onConnect);
            socket?.off('disconnect', onDisconnect);
            stop();
        };
    }, [socket, stop]);

    useEffect(() => {
        if (!open || !active || !visible || !user?._id) stop();
    }, [open, active, visible, user?._id, stop]);

    useEffect(() => {
        if (open && notes.length > 0) {
            notesEndRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
    }, [notes, open]);

    useEffect(() => {
        if (!open || !active || !visible || !user?._id) return;
        let cancelled = false;
        let retryTimer;
        let currentController;
        const started = Date.now();
        setStatus('loading');
        setError('');
        const checkHealth = async () => {
            const controller = new AbortController();
            currentController = controller;
            const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
            try {
                await api.get('/api/translation/health', { signal: controller.signal, params: { mode: 'pcm' } });
                if (!cancelled) setStatus('ready');
            } catch (requestError) {
                if (cancelled) return;
                if (requestError.response?.data?.status === 'loading' && Date.now() - started < HEALTH_STARTUP_TIMEOUT) {
                    retryTimer = setTimeout(checkHealth, HEALTH_RETRY_MS);
                    return;
                }
                stop();
                setStatus('error');
                setError(requestError.response?.status === 401 ? t('translationNotes.expired') :
                    requestError.response?.status === 403 ? t('translationNotes.forbidden') :
                    requestError.response?.data?.message || t('translationNotes.unavailable'));
            } finally { clearTimeout(timeout); }
        };
        void checkHealth();
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
            currentController?.abort();
        };
    }, [open, active, visible, user?._id, healthAttempt, stop, t]);

    // Keep existing speakers running when only the remote participant list changes.
    useEffect(() => {
        if (!open || !active || !visible || !user?._id || status !== 'ready' || !sessionId || !connected || !socket?.connected) return;
        const epoch = generation.current;
        const fail = message => {
            if (epoch !== generation.current) return;
            stop();
            setStatus('error');
            setError(message);
        };
        let audio;
        try { audio = prepareAudio(); } catch { fail(t('translationNotes.unsupported')); return; }
        const desired = conversationTranslationSources(sources, user._id);
        const wanted = new Map(desired.map(source => [source.id, source]));
        for (const [id, source] of streams.current) {
            const next = wanted.get(id);
            if (!next || next.track !== source.track || Boolean(next.isSelf) !== Boolean(source.isSelf)) {
                source.stop();
                streams.current.delete(id);
            }
        }
        const startSource = ({ id, track, isSelf = false }) => {
            if (streams.current.has(id)) return;
            const source = { track, isSelf: Boolean(isSelf), stopped: false, capture: null, transport: null, timer: null, streamId: null };
            const stopped = () => source.stopped || epoch !== generation.current;
            const finishAttempt = () => {
                source.capture?.stop();
                source.transport?.stop();
                source.capture = null;
                source.transport = null;
                if (source.streamId) setNotes(previous => interruptTranslationNotes(previous, source.streamId));
            };
            source.stop = () => {
                source.stopped = true;
                clearTimeout(source.timer);
                track.removeEventListener('ended', onEnded);
                finishAttempt();
            };
            const onEnded = () => {
                source.stop();
                if (streams.current.get(id) === source) streams.current.delete(id);
            };
            const startAttempt = () => {
                if (stopped() || !socket.connected || track.readyState !== 'live') return;
                source.streamId = null;
                const request = source.isSelf
                    ? { kind, sessionId, speakerId: id, sourceLanguage: targetLanguage, targetLanguage, translate: false }
                    : { kind, sessionId, speakerId: id, sourceLanguage, targetLanguage };
                source.transport = createTranslationPcmSocket({
                    socket, request,
                    onReady: streamId => {
                        if (stopped()) return;
                        source.streamId = streamId;
                        source.capture = createPcmCapture({ ...audio, track,
                            onPacket: packet => { if (!stopped()) source.transport?.send(packet); },
                            onError: () => fail(t(audio.context.state === 'suspended' ? 'translationNotes.resumeAudio' : 'translationNotes.recordingError')),
                        });
                    },
                    onEvent: event => {
                        if (stopped()) return;
                        if (event.type === 'status' && [429, 503].includes(event.status)) setSkippedClips(true);
                        setNotes(previous => reduceTranslationNotes(previous, event, formatElapsed(sessionStartRef.current)));
                    },
                    onFailure: detail => {
                        if (stopped()) return;
                        finishAttempt();
                        if ([401, 403].includes(detail.status)) {
                            fail(t(detail.status === 401 ? 'translationNotes.expired' : 'translationNotes.forbidden'));
                        } else if (detail.status === 429 || detail.status >= 500) {
                            setSkippedClips(true);
                            source.timer = setTimeout(startAttempt, STREAM_RETRY_MS);
                        } else fail(detail.message || t('translationNotes.unavailable'));
                    },
                });
            };
            streams.current.set(id, source);
            track.addEventListener('ended', onEnded);
            startAttempt();
        };
        desired.forEach(startSource);
    }, [open, active, visible, user?._id, status, kind, sessionId, sources, connected, socket, targetLanguage, sourceLanguage, stop, prepareAudio, t]);
    if (!active) return null;
    return (
        <>
            <button type="button" className={`translation-toggle ${open ? 'active' : ''}`}
                onClick={togglePanel} aria-expanded={open}
                title={t(open ? 'translationNotes.close' : 'translationNotes.open')}
                aria-label={t(open ? 'translationNotes.close' : 'translationNotes.open')}>
                <span className="translation-toggle-pill"><Languages size={20} /></span>
                <span className="translation-toggle-label">{t('translationNotes.toggle')}</span>
            </button>
            {open && (
                <aside className="translation-panel" aria-label={t('translationNotes.title')}>
                    <div className="translation-header">
                        <div className="translation-title-area">
                            <div className="translation-icon-badge"><Languages size={16} /></div>
                            <span className="translation-title">{t('translationNotes.title')}</span>
                        </div>
                        <div className="translation-header-actions">
                            {notes.length > 0 && <button type="button" className="translation-action-btn"
                                onClick={() => setNotes([])} title={t('translationNotes.clear')} aria-label={t('translationNotes.clear')}><Trash2 size={15} /></button>}
                            <button type="button" className="translation-close-btn" onClick={togglePanel}
                                title={t('translationNotes.close')} aria-label={t('translationNotes.close')}><ChevronUp size={18} /></button>
                        </div>
                    </div>
                    <div className="translation-setting-card">
                        <div className="translation-direction-row">
                            <div className="translation-lang-box source"><div className="translation-lang-info">
                                <span className="translation-lang-role">{t('translationNotes.counterpartSpeech')}</span>
                                <span className="translation-lang-name">{t(`translationNotes.${sourceLanguage}`)}</span>
                            </div></div>
                            <button type="button" className="translation-swap-btn" onClick={toggleDirection}
                                title={t('translationNotes.swap')} aria-label={t('translationNotes.swap')}><ArrowLeftRight size={15} /></button>
                            <div className="translation-lang-box target"><div className="translation-lang-info">
                                <span className="translation-lang-role">{t('translationNotes.readTranslation')}</span>
                                <span className="translation-lang-name">{t(`translationNotes.${targetLanguage}`)}</span>
                            </div></div>
                        </div>
                        <p className="translation-direction-hint">{t('translationNotes.directionHint')}</p>
                    </div>
                    <div className="translation-status-bar">
                        {status === 'error' ? <div className="translation-error" role="alert">
                            <span>{error}</span><button type="button" className="translation-retry" onClick={retry}>{t('translationNotes.retry')}</button>
                        </div> : <div className="translation-status-card" role="status">
                            <div className="translation-status-copy">
                                <div className="translation-state"><span className={`translation-pulse-dot ${status === 'loading' ? 'loading' : processingCount > 0 ? 'processing' : 'live'}`} />
                                    <span className="translation-state-title">{t('translationNotes.liveTitle')}</span></div>
                                <div className="translation-state-sub">{t(!connected ? 'translationNotes.reconnecting' : status === 'loading' ? 'translationNotes.starting' : 'translationNotes.listening')}</div>
                            </div>
                            <div className={`translation-waveform ${status === 'ready' && processingCount > 0 ? 'active' : ''}`} aria-hidden="true"><span /><span /><span /><span /><span /></div>
                        </div>}
                        {skippedClips && <div className="translation-warning" role="status">{t('translationNotes.skipped')}</div>}
                    </div>
                    <div className="translation-list" role="log" aria-live="polite" aria-relevant="additions text" aria-label={t('translationNotes.title')}>
                        {notes.length === 0 ? <div className="translation-empty">
                            <div className="translation-empty-icon"><Sparkles size={20} /></div>
                            <div className="translation-empty-title">{t('translationNotes.emptyTitle')}</div>
                            <div className="translation-empty-desc">{t('translationNotes.emptyDescription')}</div>
                        </div> : notes.map(note => {
                            const isSelfNote = note.translationState === 'self' || note.translate === false || String(note.speakerId || '') === String(user?._id || '');
                            return (
                                <div className={`translation-msg-wrapper ${isSelfNote ? 'self' : 'other'}`} key={note.id}>
                                    <div className="translation-msg-content">
                                        <div className="translation-note-header">
                                            <span className={`translation-msg-sender ${isSelfNote ? 'speaker-amber' : 'speaker-blue'}`}>
                                                {isSelfNote ? (note.speakerName || t('translationNotes.you')) : (note.speakerName || t('translationNotes.participant'))}
                                            </span>
                                            <span className="translation-msg-time">{note.time}</span>
                                        </div>
                                        <div className="translation-msg-bubble">
                                            <div className="translation-note-language">{t('translationNotes.original')} · {t(`translationNotes.${note.sourceLanguage}`)}</div>
                                            <div className="translation-msg-original" lang={note.sourceLanguage}>{note.original}</div>
                                            {!isSelfNote && (
                                                <>
                                                    <div className="translation-note-language">{t('translationNotes.translation')} · {t(`translationNotes.${note.targetLanguage}`)}</div>
                                                    <div className={`translation-msg-text ${note.translationState !== 'complete' ? `translation-${note.translationState}` : ''}`} lang={note.translationState === 'complete' ? note.targetLanguage : undefined}>
                                                        {note.translationState === 'complete' ? note.translated :
                                                            note.translationState === 'error' && note.message ? note.message :
                                                                t(note.translationState === 'pending' ? 'translationNotes.pending' : note.translationState === 'interrupted' ? 'translationNotes.interrupted' : 'translationNotes.translationError')}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={notesEndRef} />
                    </div>
                </aside>
            )}
        </>
    );
}
