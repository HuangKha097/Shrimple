import { useState, useRef, useEffect, useCallback } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/CustomAudioPlayer.module.scss';
import { Play, Pause, Volume2, VolumeX, Languages } from '../icons';

const cx = classNames.bind(styles);

const CustomAudioPlayer = ({
    src,
    isVoiceToVoice = false,
    muteOriginalByDefault = false,
    targetLangMeta = null,
    translatedText = null,
    translatedAudioUrl = null,
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [muteOriginalForV2V, setMuteOriginalForV2V] = useState(
        Boolean(isVoiceToVoice && muteOriginalByDefault)
    );

    const audioRef = useRef(null);
    const translatedAudioRef = useRef(null);

    const stopSpeechSynthesis = useCallback(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }, []);

    const speakTranslatedFallback = useCallback(() => {
        if (
            typeof window === 'undefined' ||
            !('speechSynthesis' in window) ||
            !isVoiceToVoice ||
            !muteOriginalForV2V
        ) {
            return;
        }
        const textToSpeak =
            translatedText ||
            (targetLangMeta?.code === 'en'
                ? 'Voice-to-voice translation preview is active.'
                : targetLangMeta?.code === 'zh'
                  ? '语音转语音翻译预览已启用。'
                  : 'Chế độ dịch giọng nói trực tiếp đang bật.');

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = targetLangMeta?.speechLang || 'en-US';
        window.speechSynthesis.speak(utterance);
    }, [isVoiceToVoice, muteOriginalForV2V, translatedText, targetLangMeta]);

    useEffect(() => {
        setMuteOriginalForV2V(Boolean(isVoiceToVoice && muteOriginalByDefault));
    }, [isVoiceToVoice, muteOriginalByDefault]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.muted = Boolean(isMuted || (isVoiceToVoice && muteOriginalForV2V));
    }, [isMuted, isVoiceToVoice, muteOriginalForV2V]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const onLoadedMetadata = () => {
            setDuration(audio.duration || 0);
        };

        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
            stopSpeechSynthesis();
            if (translatedAudioRef.current) {
                translatedAudioRef.current.pause();
                translatedAudioRef.current.currentTime = 0;
            }
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('ended', onEnded);

        if (audio.readyState >= 1) {
            setDuration(audio.duration || 0);
        }

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('ended', onEnded);
            stopSpeechSynthesis();
        };
    }, [src, stopSpeechSynthesis]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            if (translatedAudioRef.current) {
                translatedAudioRef.current.pause();
            }
            stopSpeechSynthesis();
            setIsPlaying(false);
        } else {
            audio.muted = Boolean(isMuted || (isVoiceToVoice && muteOriginalForV2V));
            audio
                .play()
                .then(() => {
                    setIsPlaying(true);
                    if (isVoiceToVoice && muteOriginalForV2V && !isMuted) {
                        if (translatedAudioUrl && translatedAudioRef.current) {
                            translatedAudioRef.current.currentTime = audio.currentTime || 0;
                            translatedAudioRef.current.play().catch(() => {});
                        } else {
                            speakTranslatedFallback();
                        }
                    }
                })
                .catch((err) => {
                    console.error("Audio playback failed:", err);
                });
        }
    };

    const handleSeekChange = (e) => {
        const audio = audioRef.current;
        if (!audio) return;

        const newTime = parseFloat(e.target.value);
        audio.currentTime = newTime;
        if (translatedAudioRef.current) {
            translatedAudioRef.current.currentTime = newTime;
        }
        setCurrentTime(newTime);
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;

        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        audio.muted = Boolean(nextMuted || (isVoiceToVoice && muteOriginalForV2V));
        if (translatedAudioRef.current) {
            translatedAudioRef.current.muted = nextMuted;
        }
        if (nextMuted) {
            stopSpeechSynthesis();
        }
    };

    const toggleOriginalTrack = () => {
        const nextMuteOriginal = !muteOriginalForV2V;
        setMuteOriginalForV2V(nextMuteOriginal);
        if (audioRef.current) {
            audioRef.current.muted = Boolean(isMuted || (isVoiceToVoice && nextMuteOriginal));
        }
        if (!nextMuteOriginal) {
            stopSpeechSynthesis();
            if (translatedAudioRef.current) {
                translatedAudioRef.current.pause();
            }
        }
    };

    const formatTime = (time) => {
        if (isNaN(time) || !isFinite(time)) return '0:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className={cx('player-container', { 'v2v-player': isVoiceToVoice })}>
            <audio ref={audioRef} src={src} preload="metadata" />
            {translatedAudioUrl && (
                <audio ref={translatedAudioRef} src={translatedAudioUrl} preload="metadata" />
            )}

            <button
                type="button"
                className={cx('play-btn')}
                onClick={togglePlay}
                title={
                    isVoiceToVoice && muteOriginalForV2V
                        ? `Phát giọng dịch (${targetLangMeta?.label || 'Voice-to-Voice'})`
                        : "Phát tin nhắn thoại"
                }
            >
                {isPlaying ? (
                    <Pause size={18} fill="currentColor" />
                ) : (
                    <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />
                )}
            </button>

            <div className={cx('player-body')}>
                <div className={cx('player-top-row')}>
                    <div className={cx('waveform-simulation')}>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '30%', animationDelay: '0.1s' }}></span>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '60%', animationDelay: '0.3s' }}></span>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '40%', animationDelay: '0.2s' }}></span>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '80%', animationDelay: '0.4s' }}></span>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '50%', animationDelay: '0.1s' }}></span>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '70%', animationDelay: '0.3s' }}></span>
                        <span className={cx('bar', { active: isPlaying })} style={{ height: '30%', animationDelay: '0.2s' }}></span>
                    </div>

                    {isVoiceToVoice && (
                        <button
                            type="button"
                            className={cx('v2v-track-pill', { 'muted-original': muteOriginalForV2V })}
                            onClick={toggleOriginalTrack}
                            title={
                                muteOriginalForV2V
                                    ? "Đang tắt tiếng gốc và phát giọng dịch. Nhấn để nghe âm gốc"
                                    : "Đang mở tiếng gốc. Nhấn để chuyển lại phát giọng dịch"
                            }
                        >
                            {muteOriginalForV2V ? (
                                <>
                                    <VolumeX size={11} />
                                    <span>Mute gốc • V2V {targetLangMeta?.short || 'EN'}</span>
                                </>
                            ) : (
                                <>
                                    <Languages size={11} />
                                    <span>Đang bật âm gốc</span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                <input
                    type="range"
                    className={cx('timeline')}
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeekChange}
                    style={{
                        background: `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${(currentTime / (duration || 1)) * 100}%, rgba(255, 255, 255, 0.1) ${(currentTime / (duration || 1)) * 100}%, rgba(255, 255, 255, 0.1) 100%)`
                    }}
                />

                <div className={cx('time-display')}>
                    <span>{formatTime(currentTime)}</span>
                    <span>/</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <button type="button" className={cx('volume-btn')} onClick={toggleMute} title={isMuted ? "Bật tiếng" : "Tắt tiếng"}>
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
        </div>
    );
};

export default CustomAudioPlayer;
