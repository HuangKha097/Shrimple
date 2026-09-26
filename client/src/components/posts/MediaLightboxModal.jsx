import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/MediaLightboxModal.module.scss';

const cx = classNames.bind(styles);

const MediaLightboxModal = ({ 
    isOpen, 
    onClose, 
    mediaList = [], 
    initialIndex = 0 
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    useEffect(() => {
        setCurrentIndex(initialIndex);
    }, [initialIndex, isOpen]);

    const handlePrev = useCallback((e) => {
        if (e) e.stopPropagation();
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : mediaList.length - 1));
    }, [mediaList.length]);

    const handleNext = useCallback((e) => {
        if (e) e.stopPropagation();
        setCurrentIndex(prev => (prev < mediaList.length - 1 ? prev + 1 : 0));
    }, [mediaList.length]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowLeft') {
                handlePrev();
            } else if (e.key === 'ArrowRight') {
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose, handlePrev, handleNext]);

    if (!isOpen || !mediaList || mediaList.length === 0) return null;

    const currentMedia = mediaList[currentIndex] || mediaList[0];
    const rawUrl = typeof currentMedia === 'string' ? currentMedia : currentMedia?.url;
    const isVideo = currentMedia?.type === 'video' || 
                    (typeof rawUrl === 'string' && (rawUrl.endsWith('.mp4') || rawUrl.endsWith('.webm') || rawUrl.includes('video/')));

    const fullUrl = rawUrl?.startsWith('http') || rawUrl?.startsWith('data:')
        ? rawUrl
        : (rawUrl ? `http://localhost:5001${rawUrl}` : '');

    return (
        <AnimatePresence>
            <Motion.div 
                className={cx('lightbox-overlay')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                {/* Top Action Bar */}
                <div className={cx('lightbox-header')} onClick={(e) => e.stopPropagation()}>
                    <div className={cx('counter')}>
                        {mediaList.length > 1 && `${currentIndex + 1} / ${mediaList.length}`}
                    </div>
                    <div className={cx('actions')}>
                        <a 
                            href={fullUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            download 
                            className={cx('action-btn')}
                            title="Tải xuống"
                        >
                            <Download size={20} />
                        </a>
                        <button 
                            type="button" 
                            className={cx('action-btn', 'close-btn')} 
                            onClick={onClose}
                            title="Đóng (Esc)"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Left navigation arrow */}
                {mediaList.length > 1 && (
                    <button 
                        type="button" 
                        className={cx('nav-btn', 'prev-btn')} 
                        onClick={handlePrev}
                        aria-label="Ảnh trước"
                    >
                        <ChevronLeft size={36} />
                    </button>
                )}

                {/* Center Media Display */}
                <div className={cx('media-container')} onClick={(e) => e.stopPropagation()}>
                    {isVideo ? (
                        <video
                            key={fullUrl}
                            src={fullUrl}
                            controls
                            autoPlay
                            playsInline
                            className={cx('media-content', 'video-content')}
                        />
                    ) : (
                        <img
                            key={fullUrl}
                            src={fullUrl}
                            alt={`Media preview ${currentIndex + 1}`}
                            className={cx('media-content', 'image-content')}
                        />
                    )}
                </div>

                {/* Right navigation arrow */}
                {mediaList.length > 1 && (
                    <button 
                        type="button" 
                        className={cx('nav-btn', 'next-btn')} 
                        onClick={handleNext}
                        aria-label="Ảnh tiếp theo"
                    >
                        <ChevronRight size={36} />
                    </button>
                )}
            </Motion.div>
        </AnimatePresence>
    );
};

export default MediaLightboxModal;
