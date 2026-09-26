import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion as Motion } from 'motion/react';
import styles from './otp-input.module.scss';

/**
 * OTPInput - Lightswind UI style React Component
 * 
 * Features:
 * - Multi-slot OTP input with automatic focus management
 * - Animated fake-caret on active/focused empty slot
 * - Digit pop animation with Framer Motion
 * - Robust paste support (spreads across slots)
 * - Backspace & Arrow keys navigation
 * - Responsive styling with Amber/Orange glow
 * 
 * @param {Object} props
 * @param {number} [props.length=6] - Number of OTP slots
 * @param {string} [props.value] - Controlled value
 * @param {Function} [props.onChange] - Callback on value change: (val: string) => void
 * @param {Function} [props.onComplete] - Callback on completion: (code: string) => void
 * @param {boolean} [props.disabled=false] - Disable inputs
 * @param {boolean} [props.autoFocus=true] - Auto focus first slot on mount
 * @param {boolean} [props.mask=false] - Mask digits with bullets
 * @param {boolean} [props.error=false] - Error styling
 * @param {boolean} [props.hasSeparator=false] - Show separator between slot groups
 * @param {string} [props.className] - Additional wrapper class
 * @param {string} [props.slotClassName] - Additional slot class
 */
export const OTPInput = ({
    length = 6,
    value: controlledValue,
    onChange,
    onComplete,
    disabled = false,
    autoFocus = true,
    mask = false,
    error = false,
    hasSeparator = false,
    className = '',
    slotClassName = '',
}) => {
    const isControlled = controlledValue !== undefined;
    const [internalDigits, setInternalDigits] = useState(Array(length).fill(''));
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const inputRefs = useRef([]);

    const digits = isControlled
        ? Array.from({ length }, (_, i) => controlledValue?.[i] || '')
        : internalDigits;

    // Handle initial auto-focus
    useEffect(() => {
        if (autoFocus && !disabled) {
            const timer = setTimeout(() => {
                inputRefs.current[0]?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [autoFocus, disabled]);

    const updateDigits = useCallback((newDigits) => {
        if (!isControlled) {
            setInternalDigits(newDigits);
        }
        const fullString = newDigits.join('');
        onChange?.(fullString);

        if (fullString.length === length && newDigits.every((d) => d !== '')) {
            onComplete?.(fullString);
        }
    }, [isControlled, length, onChange, onComplete]);

    const handleSlotClick = (index) => {
        if (disabled) return;
        inputRefs.current[index]?.focus();
    };

    const handleInputChange = (index, e) => {
        if (disabled) return;
        const val = e.target.value;

        // If user typed or pasted more than 1 character
        if (val.length > 1) {
            handlePasteData(val, index);
            return;
        }

        // Only allow numeric input
        const cleanChar = val.replace(/\D/g, '').slice(-1);

        const next = [...digits];
        next[index] = cleanChar;
        updateDigits(next);

        // Auto advance to next slot if a character was entered
        if (cleanChar && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (disabled) return;

        if (e.key === 'Backspace') {
            if (!digits[index] && index > 0) {
                // If current slot is empty, move backward and clear previous
                e.preventDefault();
                const next = [...digits];
                next[index - 1] = '';
                updateDigits(next);
                inputRefs.current[index - 1]?.focus();
            } else if (digits[index]) {
                // Clear current slot
                const next = [...digits];
                next[index] = '';
                updateDigits(next);
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            e.preventDefault();
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handlePasteData = (pastedText, startIndex = 0) => {
        const cleanNumbers = pastedText.replace(/\D/g, '').slice(0, length);
        if (!cleanNumbers) return;

        const next = [...digits];
        for (let i = 0; i < cleanNumbers.length; i++) {
            const targetIdx = startIndex + i;
            if (targetIdx < length) {
                next[targetIdx] = cleanNumbers[i];
            }
        }

        updateDigits(next);

        // Focus next unfilled slot or last filled slot
        const nextFocus = Math.min(startIndex + cleanNumbers.length, length - 1);
        inputRefs.current[nextFocus]?.focus();
    };

    const handlePaste = (e, index) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text');
        handlePasteData(pastedText, index);
    };

    const separatorIndex = Math.floor(length / 2);

    return (
        <div className={`${styles['otp-container']} ${className}`}>
            {digits.map((digit, index) => {
                const isFocused = focusedIndex === index;
                const isFilled = Boolean(digit);
                const showCaret = isFocused && !isFilled;
                const isSeparatorSlot = hasSeparator && index === separatorIndex;

                return (
                    <React.Fragment key={index}>
                        {isSeparatorSlot && (
                            <div className={styles['separator']} aria-hidden="true">
                                ─
                            </div>
                        )}
                        <div
                            className={`
                                ${styles['otp-slot']} 
                                ${isFocused ? styles['focused'] : ''} 
                                ${isFilled ? styles['filled'] : ''} 
                                ${error ? styles['error'] : ''} 
                                ${disabled ? styles['disabled'] : ''} 
                                ${slotClassName}
                            `}
                            onClick={() => handleSlotClick(index)}
                        >
                            <input
                                ref={(el) => (inputRefs.current[index] = el)}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={length}
                                value={digit}
                                disabled={disabled}
                                onChange={(e) => handleInputChange(index, e)}
                                onKeyDown={(e) => handleKeyDown(index, e)}
                                onPaste={(e) => handlePaste(e, index)}
                                onFocus={() => setFocusedIndex(index)}
                                onBlur={() => setFocusedIndex(-1)}
                                className={styles['hidden-input']}
                                aria-label={`Mã OTP ký tự ${index + 1}`}
                                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                            />

                            <div className={styles['slot-content']}>
                                {isFilled ? (
                                    <Motion.span
                                        key={`digit-${digit}-${index}`}
                                        className={styles['digit']}
                                        initial={{ scale: 0.3, opacity: 0, y: 4 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 450,
                                            damping: 25,
                                        }}
                                    >
                                        {mask ? '•' : digit}
                                    </Motion.span>
                                ) : showCaret ? (
                                    <Motion.span
                                        className={styles['caret']}
                                        animate={{ opacity: [1, 0, 1] }}
                                        transition={{
                                            repeat: Infinity,
                                            duration: 0.9,
                                            ease: 'easeInOut',
                                        }}
                                    />
                                ) : null}
                            </div>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default OTPInput;
