
import { motion as Motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import styles from './XButton.module.scss';

/**
 * XButton - X-style Pill Button with Animate UI spring physics & shimmer effect
 */
const XButton = ({
    children,
    type = 'button',
    variant = 'primary', // 'primary' | 'accent' | 'outline' | 'ghost'
    size = 'md', // 'sm' | 'md' | 'lg'
    loading = false,
    disabled = false,
    onClick,
    className = '',
    fullWidth = true,
    shimmer = true,
    ...props
}) => {
    const isDisabled = disabled || loading;

    return (
        <Motion.button
            type={type}
            onClick={onClick}
            disabled={isDisabled}
            className={`
                ${styles.button}
                ${styles[variant]}
                ${styles[size]}
                ${fullWidth ? styles['full-width'] : ''}
                ${className}
            `}
            whileHover={!isDisabled ? { scale: 1.015 } : {}}
            whileTap={!isDisabled ? { scale: 0.985 } : {}}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
            {...props}
        >
            {shimmer && !isDisabled && (
                <div className={styles['shimmer-sweep']} aria-hidden="true" />
            )}

            <span className={styles.content}>
                {loading ? (
                    <Motion.span
                        className={styles.loader}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15 }}
                    >
                        <Loader2 className="animate-spin" size={19} />
                    </Motion.span>
                ) : (
                    children
                )}
            </span>
        </Motion.button>
    );
};

export default XButton;
