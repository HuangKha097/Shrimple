import React, { useEffect, useRef, useMemo } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion, AnimatePresence } from 'motion/react';
import styles from '../../assets/css/AntiPeep.module.scss';
import { 
    X, 
    Delete, 
    CheckCircle2,
    RefreshCw,
    ScanFace,
    Shield,
    KeyRound,
    Sparkles
} from 'lucide-react';
import XButton from '../ui/animate/XButton';

const cx = classNames.bind(styles);

const FaceIDCalibrationModal = ({
    isOpen,
    stream,
    step, // 'face' | 'pin'
    guidanceText,
    isAligned,
    alignmentStatus, // 'aligned' | 'no_face' | 'multiple_faces' | 'too_far' | 'too_close' | 'uncentered' | 'poor_quality' | 'loading'
    isCapturing,
    captureProgress = 0,
    captureTarget = 5,
    tempPin,
    setTempPin,
    onResetCapture,
    onSave,
    onClose,
    landmarksData
}) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);

    // Attach stream to modal video
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, isOpen, step]);

    // Calculate percentage progress for circular SVG ring
    const progressPercent = Math.min(Math.round((captureProgress / captureTarget) * 100), 100);
    const circumference = 2 * Math.PI * 118; // r = 118 => 741.4
    const strokeDashoffset = circumference - (circumference * progressPercent) / 100;

    // Draw Minimal Modern 3D Face Wireframe & Landmark Mesh
    useEffect(() => {
        if (step !== 'face') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let angle = 0;

        const render = () => {
            const width = canvas.width = 240;
            const height = canvas.height = 240;
            ctx.clearRect(0, 0, width, height);

            if (landmarksData && landmarksData.positions && landmarksData.positions.length > 0) {
                // Real-time Facial Landmark Overlay in Clean Monochromatic White/Cyan
                const points = landmarksData.positions;
                const scaleX = width / (landmarksData.videoWidth || 320);
                const scaleY = height / (landmarksData.videoHeight || 240);

                const getPt = (idx) => ({
                    x: points[idx].x * scaleX,
                    y: points[idx].y * scaleY
                });

                ctx.strokeStyle = isAligned ? 'rgba(56, 189, 248, 0.85)' : 'rgba(255, 255, 255, 0.45)';
                ctx.lineWidth = isAligned ? 1.4 : 1.1;

                const drawChain = (indices, closed = false) => {
                    ctx.beginPath();
                    for (let i = 0; i < indices.length; i++) {
                        const pt = getPt(indices[i]);
                        if (i === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    }
                    if (closed) ctx.closePath();
                    ctx.stroke();
                };

                // Delicate facial contour lines
                drawChain([0, 2, 4, 6, 8, 10, 12, 14, 16]); // Jawline
                drawChain([17, 18, 19, 20, 21]); // Left eyebrow
                drawChain([22, 23, 24, 25, 26]); // Right eyebrow
                drawChain([27, 28, 29, 30, 33]); // Nose bridge
                drawChain([31, 32, 33, 34, 35]); // Nose base
                drawChain([36, 37, 38, 39, 40, 41], true); // Left eye
                drawChain([42, 43, 44, 45, 46, 47], true); // Right eye
                drawChain([48, 50, 52, 54, 56, 58], true); // Lips

                // Key anchor points
                ctx.fillStyle = isAligned ? '#38bdf8' : '#ffffff';
                [8, 27, 30, 33, 36, 39, 42, 45, 48, 54].forEach(idx => {
                    const pt = getPt(idx);
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, isAligned ? 2.5 : 2, 0, Math.PI * 2);
                    ctx.fill();
                });
            } else {
                // Futuristic Holographic Scanner Wireframe
                angle += 0.025;
                const centerX = width / 2;
                const centerY = height / 2;
                const radius = 68;

                ctx.save();
                ctx.translate(centerX, centerY);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1.2;

                // Head oval
                ctx.beginPath();
                ctx.ellipse(0, 0, radius * 0.78, radius, 0, 0, Math.PI * 2);
                ctx.stroke();

                // 3D wireframe longitude rotation
                ctx.beginPath();
                ctx.ellipse(0, 0, Math.abs(radius * 0.78 * Math.cos(angle)), radius, 0, 0, Math.PI * 2);
                ctx.stroke();

                // Subtle latitude lines
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.beginPath();
                ctx.ellipse(0, -10, radius * 0.75, 14, 0, 0, Math.PI * 2);
                ctx.stroke();

                // Eye guide marks
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fillRect(-20, -12, 4, 2);
                ctx.fillRect(16, -12, 4, 2);

                // Nose dot
                ctx.beginPath();
                ctx.arc(0, 4, 2, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }

            animationFrameRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [step, landmarksData, isAligned]);

    const handleKeyClick = (num) => {
        if (tempPin.length < 4) {
            setTempPin(tempPin + num);
        }
    };

    const handleDeleteKey = () => {
        if (tempPin.length > 0) {
            setTempPin(tempPin.slice(0, -1));
        }
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !isCapturing) {
                onClose();
            } else if (step === 'pin') {
                if (event.key >= '0' && event.key <= '9') {
                    handleKeyClick(event.key);
                } else if (event.key === 'Backspace') {
                    handleDeleteKey();
                } else if (event.key === 'Enter' && tempPin.length === 4) {
                    onSave();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isCapturing, isOpen, onClose, step, tempPin, onSave]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <Motion.div
                className={cx('face-id-modal-backdrop')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
            >
                <Motion.div
                    className={cx('face-id-card-modal')}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="face-id-dialog-title"
                    initial={{ opacity: 0, scale: 0.93, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                >
                    {/* Close Button */}
                    <button
                        type="button"
                        className={cx('modal-close-btn')}
                        onClick={onClose}
                        title="Đóng"
                        aria-label="Đóng"
                    >
                        <X size={18} />
                    </button>

                    {/* Step indicator header */}
                    <div className={cx('step-indicator-bar')}>
                        <div className={cx('step-item', { active: step === 'face', done: step === 'pin' })}>
                            <div className={cx('step-badge')}>1</div>
                            <span>Khuôn mặt</span>
                        </div>
                        <div className={cx('step-divider', { active: step === 'pin' })} />
                        <div className={cx('step-item', { active: step === 'pin' })}>
                            <div className={cx('step-badge')}>2</div>
                            <span>Mã PIN dự phòng</span>
                        </div>
                    </div>

                    {step === 'face' ? (
                        <div className={cx('step-face-container')}>
                            <div className={cx('modal-title-group')}>
                                <h3 id="face-id-dialog-title">Thiết lập Face ID</h3>
                                <p>Căn chỉnh khuôn mặt vào giữa khung tròn. Hệ thống sẽ tự động quét và lưu mẫu nhận diện.</p>
                            </div>

                            {/* Circular Auto-Scanning Viewport with SVG Progress */}
                            <div className={cx('apple-face-id-scanner')}>
                                {/* Dynamic SVG Progress Ring */}
                                <svg className={cx('progress-ring-svg')} viewBox="0 0 258 258">
                                    {/* Background track circle */}
                                    <circle
                                        className={cx('progress-ring-bg')}
                                        cx="129"
                                        cy="129"
                                        r="118"
                                    />
                                    {/* Animated Progress circle */}
                                    <circle
                                        className={cx('progress-ring-fill', { active: isAligned })}
                                        cx="129"
                                        cy="129"
                                        r="118"
                                        style={{
                                            strokeDasharray: circumference,
                                            strokeDashoffset: strokeDashoffset,
                                        }}
                                    />
                                </svg>

                                {/* Radar scanning sweep effect when aligned */}
                                {isAligned && (
                                    <div className={cx('radar-sweep')} aria-hidden="true" />
                                )}

                                {/* Camera Viewport */}
                                <div className={cx('camera-viewport', { aligned: isAligned })}>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                    />
                                    <canvas ref={canvasRef} />

                                    {/* Corner Crosshairs */}
                                    <div className={cx('corner-bracket', 'top-left')} />
                                    <div className={cx('corner-bracket', 'top-right')} />
                                    <div className={cx('corner-bracket', 'bottom-left')} />
                                    <div className={cx('corner-bracket', 'bottom-right')} />
                                </div>
                            </div>

                            {/* Live Guidance Pill with Auto Status */}
                            <Motion.div
                                className={cx('guidance-pill', {
                                    ready: isAligned,
                                    warning: !isAligned && alignmentStatus !== 'loading',
                                    success: captureProgress >= captureTarget
                                })}
                                aria-live="polite"
                                animate={isAligned ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                                transition={{ duration: 1.5, repeat: isAligned ? Infinity : 0 }}
                            >
                                <span className={cx('guidance-dot')} />
                                <span className={cx('guidance-msg')}>{guidanceText}</span>
                            </Motion.div>

                            {/* 5-Sample Progress Dots */}
                            <div className={cx('sample-progress-row')}>
                                {[...Array(captureTarget)].map((_, idx) => {
                                    const isDone = captureProgress > idx;
                                    const isCurrent = captureProgress === idx && isAligned;

                                    return (
                                        <div
                                            key={idx}
                                            className={cx('sample-dot-item', {
                                                done: isDone,
                                                current: isCurrent,
                                            })}
                                        >
                                            {isDone ? (
                                                <CheckCircle2 size={13} className={cx('check-icon')} />
                                            ) : (
                                                <span>{idx + 1}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer control actions */}
                            <div className={cx('modal-actions')}>
                                {captureProgress > 0 && captureProgress < captureTarget && (
                                    <button
                                        type="button"
                                        className={cx('x-secondary-btn')}
                                        onClick={onResetCapture}
                                    >
                                        <RefreshCw size={14} />
                                        <span>Quét lại từ đầu</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={cx('cancel-apple-btn')}
                                    onClick={onClose}
                                >
                                    Hủy
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Step 2: Passcode PIN Setup (X / Cyber Aesthetic) */
                        <Motion.div
                            className={cx('pin-setup-container')}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                        >
                            <div className={cx('modal-title-group')}>
                                <div className={cx('pin-header-icon')}>
                                    <KeyRound size={22} />
                                </div>
                                <h3>Tạo mã PIN dự phòng</h3>
                                <p>Mã PIN 4 số sẽ dùng để mở khóa khi camera bị che hoặc thiếu sáng.</p>
                            </div>

                            {/* 4 Pin Slots with modern glow */}
                            <div className={cx('pin-dots-row')}>
                                {[0, 1, 2, 3].map((index) => (
                                    <div
                                        key={index}
                                        className={cx('pin-dot', { filled: tempPin.length > index })}
                                    />
                                ))}
                            </div>

                            {/* Clean X-style Keypad */}
                            <div className={cx('keypad-grid')}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <Motion.button
                                        key={num}
                                        type="button"
                                        className={cx('key-btn')}
                                        onClick={() => handleKeyClick(String(num))}
                                        whileHover={{ scale: 1.06, backgroundColor: 'rgba(255, 255, 255, 0.14)' }}
                                        whileTap={{ scale: 0.94, backgroundColor: 'rgba(255, 255, 255, 0.25)' }}
                                        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                                    >
                                        {num}
                                    </Motion.button>
                                ))}
                                <div className={cx('key-btn', 'empty')} />
                                <Motion.button
                                    type="button"
                                    className={cx('key-btn')}
                                    onClick={() => handleKeyClick('0')}
                                    whileHover={{ scale: 1.06, backgroundColor: 'rgba(255, 255, 255, 0.14)' }}
                                    whileTap={{ scale: 0.94, backgroundColor: 'rgba(255, 255, 255, 0.25)' }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                                >
                                    0
                                </Motion.button>
                                <Motion.button
                                    type="button"
                                    className={cx('key-btn')}
                                    onClick={handleDeleteKey}
                                    whileHover={{ scale: 1.06, backgroundColor: 'rgba(255, 255, 255, 0.14)' }}
                                    whileTap={{ scale: 0.94, backgroundColor: 'rgba(255, 255, 255, 0.25)' }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                                    aria-label="Xóa"
                                >
                                    <Delete size={18} />
                                </Motion.button>
                            </div>

                            <div className={cx('modal-actions')}>
                                <XButton
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    disabled={tempPin.length < 4}
                                    onClick={onSave}
                                >
                                    <span className={cx('save-btn-content')}>
                                        <Sparkles size={16} />
                                        <span>Hoàn tất & Bật bảo vệ</span>
                                    </span>
                                </XButton>
                                <button
                                    type="button"
                                    className={cx('cancel-apple-btn')}
                                    onClick={onClose}
                                >
                                    Hủy
                                </button>
                            </div>
                        </Motion.div>
                    )}
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
    );
};

export default FaceIDCalibrationModal;
