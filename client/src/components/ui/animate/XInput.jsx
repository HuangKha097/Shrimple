import React, { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';
import styles from './XInput.module.scss';

const XInput = ({
    id,
    name,
    type = 'text',
    label,
    value = '',
    onChange,
    required = false,
    autoComplete,
    placeholder = '',
    error = '',
    disabled = false,
    className = '',
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const isPasswordType = type === 'password';
    const computedType = isPasswordType ? (showPassword ? 'text' : 'password') : type;
    const hasContent = Boolean(value && String(value).length > 0);
    const isFloating = isFocused || hasContent;

    return (
        <div className={`${styles['input-group']} ${className}`}>
            <Motion.div
                className={`${styles['input-container']} ${isFocused ? styles.focused : ''} ${error ? styles.error : ''}`}
                animate={error ? { x: [-4, 4, -4, 4, 0] } : {}}
                transition={{ duration: 0.3 }}
            >
                <label
                    htmlFor={id}
                    className={`${styles.label} ${isFloating ? styles.floating : ''}`}
                >
                    {label}
                    {required && <span className={styles.required}> *</span>}
                </label>

                <div className={styles['field-wrapper']}>
                    <input
                        id={id}
                        name={name}
                        type={computedType}
                        value={value}
                        onChange={onChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        required={required}
                        autoComplete={autoComplete}
                        placeholder={isFocused ? placeholder : ''}
                        disabled={disabled}
                        className={styles.input}
                        {...props}
                    />

                    {isPasswordType && (
                        <Motion.button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className={styles['toggle-btn']}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                {showPassword ? (
                                    <Motion.div
                                        key="eye-off"
                                        initial={{ opacity: 0, rotate: -30 }}
                                        animate={{ opacity: 1, rotate: 0 }}
                                        exit={{ opacity: 0, rotate: 30 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <EyeOff size={19} />
                                    </Motion.div>
                                ) : (
                                    <Motion.div
                                        key="eye"
                                        initial={{ opacity: 0, rotate: 30 }}
                                        animate={{ opacity: 1, rotate: 0 }}
                                        exit={{ opacity: 0, rotate: -30 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <Eye size={19} />
                                    </Motion.div>
                                )}
                            </AnimatePresence>
                        </Motion.button>
                    )}
                </div>
            </Motion.div>

            <AnimatePresence>
                {error && (
                    <Motion.p
                        className={styles['error-text']}
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {error}
                    </Motion.p>
                )}
            </AnimatePresence>
        </div>
    );
};

export default XInput;
