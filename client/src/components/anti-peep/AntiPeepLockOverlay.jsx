import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldAlert, KeyRound, Delete, Loader2, ArrowRight } from 'lucide-react';
import styles from '../../assets/css/AntiPeep.module.scss';
import XButton from '../ui/animate/XButton';

const cx = classNames.bind(styles);

const AntiPeepLockOverlay = ({
    isLocked,
    lockReason,
    onUnlock,
    isUnlocking
}) => {
    const [pin, setPin] = useState('');
    const [shakeError, setShakeError] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isLocked) {
            setPin('');
            setErrorMessage('');
            setShakeError(false);
            // Auto focus hidden or visible input
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isLocked]);

    const handleKeyClick = (digit) => {
        if (isUnlocking) return;
        if (pin.length < 4) {
            const nextPin = pin + digit;
            setPin(nextPin);
            setErrorMessage('');
            if (nextPin.length === 4) {
                handleSubmitPin(nextPin);
            }
        }
    };

    const handleDeleteKey = () => {
        if (isUnlocking) return;
        if (pin.length > 0) {
            setPin(prev => prev.slice(0, -1));
            setErrorMessage('');
        }
    };

    const handleSubmitPin = async (pinToVerify = pin) => {
        if (pinToVerify.length !== 4 || isUnlocking) return;
        try {
            const success = await onUnlock(pinToVerify);
            if (!success) {
                triggerShake('Mã PIN không chính xác. Vui lòng thử lại.');
            }
        } catch {
            triggerShake('Không thể xác thực mã PIN.');
        }
    };

    const triggerShake = (msg) => {
        setErrorMessage(msg);
        setShakeError(true);
        setPin('');
        setTimeout(() => {
            setShakeError(false);
            inputRef.current?.focus();
        }, 600);
    };

    const handleKeyDown = (e) => {
        if (isUnlocking) return;
        if (e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            handleKeyClick(e.key);
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            handleDeleteKey();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (pin.length === 4) {
                handleSubmitPin(pin);
            }
        }
    };

    if (!isLocked) return null;

    return (
        <AnimatePresence>
            <Motion.div
                className={cx('x-lock-overlay-backdrop')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                ref={inputRef}
            >
                {/* Ambient dynamic background lighting */}
                <div className={cx('ambient-glow')} aria-hidden="true" />

                <Motion.div
                    className={cx('x-lock-card')}
                    initial={{ opacity: 0, scale: 0.92, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 12 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="anti-peep-lock-title"
                >
                    {/* Lock Shield Icon Header with X-glow */}
                    <div className={cx('x-lock-header')}>
                        <Motion.div
                            className={cx('x-lock-badge')}
                            animate={{
                                boxShadow: [
                                    '0 0 0 0 rgba(255, 255, 255, 0)',
                                    '0 0 0 12px rgba(255, 255, 255, 0.08)',
                                    '0 0 0 0 rgba(255, 255, 255, 0)',
                                ],
                            }}
                            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <Lock size={28} className={cx('lock-icon')} />
                        </Motion.div>

                        <h2 id="anti-peep-lock-title" className={cx('x-lock-title')}>
                            Màn hình đã bị khóa
                        </h2>

                        <div className={cx('x-lock-reason-pill')}>
                            <ShieldAlert size={14} className={cx('alert-icon')} />
                            <span>{lockReason || 'Phát hiện người lạ đang nhìn vào màn hình.'}</span>
                        </div>
                    </div>

                    {/* PIN Visual Display Slots */}
                    <Motion.div
                        className={cx('x-pin-slots-wrapper', { error: shakeError })}
                        animate={shakeError ? { x: [-12, 12, -8, 8, -4, 4, 0] } : { x: 0 }}
                        transition={{ duration: 0.45 }}
                    >
                        {[0, 1, 2, 3].map((index) => {
                            const isFilled = pin.length > index;
                            const isCurrent = pin.length === index;

                            return (
                                <Motion.div
                                    key={index}
                                    className={cx('x-pin-slot', {
                                        filled: isFilled,
                                        active: isCurrent,
                                        error: shakeError,
                                    })}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    {isFilled ? (
                                        <Motion.span
                                            className={cx('x-pin-dot')}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                                        />
                                    ) : (
                                        isCurrent && (
                                            <Motion.span
                                                className={cx('x-pin-caret')}
                                                animate={{ opacity: [1, 0, 1] }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                            />
                                        )
                                    )}
                                </Motion.div>
                            );
                        })}
                    </Motion.div>

                    {/* Error message alert if wrong PIN */}
                    <AnimatePresence>
                        {errorMessage && (
                            <Motion.p
                                className={cx('x-pin-error-text')}
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                            >
                                {errorMessage}
                            </Motion.p>
                        )}
                    </AnimatePresence>

                    {/* Clean X-style Keypad */}
                    <div className={cx('x-keypad-grid')}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <Motion.button
                                key={num}
                                type="button"
                                className={cx('x-key-btn')}
                                onClick={() => handleKeyClick(String(num))}
                                disabled={isUnlocking}
                                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}
                                whileTap={{ scale: 0.92, backgroundColor: 'rgba(255, 255, 255, 0.22)' }}
                                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                            >
                                <span>{num}</span>
                            </Motion.button>
                        ))}

                        <div className={cx('x-key-btn', 'empty')} />

                        <Motion.button
                            type="button"
                            className={cx('x-key-btn')}
                            onClick={() => handleKeyClick('0')}
                            disabled={isUnlocking}
                            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}
                            whileTap={{ scale: 0.92, backgroundColor: 'rgba(255, 255, 255, 0.22)' }}
                            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                        >
                            <span>0</span>
                        </Motion.button>

                        <Motion.button
                            type="button"
                            className={cx('x-key-btn', 'delete-btn')}
                            onClick={handleDeleteKey}
                            disabled={isUnlocking || pin.length === 0}
                            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}
                            whileTap={{ scale: 0.92, backgroundColor: 'rgba(255, 255, 255, 0.22)' }}
                            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                            aria-label="Xóa ký tự"
                        >
                            <Delete size={20} />
                        </Motion.button>
                    </div>

                    {/* Unlock Action Button */}
                    <div className={cx('x-lock-actions')}>
                        <XButton
                            variant="primary"
                            size="lg"
                            fullWidth
                            loading={isUnlocking}
                            disabled={pin.length !== 4 || isUnlocking}
                            onClick={() => handleSubmitPin(pin)}
                        >
                            <span className={cx('unlock-btn-inner')}>
                                <span>Mở khóa màn hình</span>
                                <ArrowRight size={18} />
                            </span>
                        </XButton>
                    </div>

                    <div className={cx('x-lock-footer-tip')}>
                        <KeyRound size={13} />
                        <span>Nhập mã PIN đã cài đặt khi kích hoạt Face ID để tiếp tục</span>
                    </div>
                </Motion.div>
            </Motion.div>
        </AnimatePresence>
    );
};

export default AntiPeepLockOverlay;
