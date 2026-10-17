import { useState, useRef, useEffect } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/CustomAudioPlayer.module.scss';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

const cx = classNames.bind(styles);

const CustomAudioPlayer = ({ src }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    const audioRef = useRef(null);

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
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('ended', onEnded);

        // Try load metadata immediately in case it's cached
        if (audio.readyState >= 1) {
            setDuration(audio.duration || 0);
        }

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('ended', onEnded);
        };
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().then(() => {
                setIsPlaying(true);
            }).catch(err => {
                console.error("Audio playback failed:", err);
            });
        }
    };

    const handleSeekChange = (e) => {
        const audio = audioRef.current;
        if (!audio) return;

        const newTime = parseFloat(e.target.value);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const formatTime = (time) => {
        if (isNaN(time)) return '0:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className={cx('player-container')}>
            <audio ref={audioRef} src={src} preload="metadata" />
            
            <button className={cx('play-btn')} onClick={togglePlay}>
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
            </button>

            <div className={cx('player-body')}>
                <div className={cx('waveform-simulation')}>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '30%', animationDelay: '0.1s' }}></span>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '60%', animationDelay: '0.3s' }}></span>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '40%', animationDelay: '0.2s' }}></span>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '80%', animationDelay: '0.4s' }}></span>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '50%', animationDelay: '0.1s' }}></span>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '70%', animationDelay: '0.3s' }}></span>
                    <span className={cx('bar', { active: isPlaying })} style={{ height: '30%', animationDelay: '0.2s' }}></span>
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

            <button className={cx('volume-btn')} onClick={toggleMute}>
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
        </div>
    );
};

export default CustomAudioPlayer;
