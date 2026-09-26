import React from 'react';
import classNames from 'classnames/bind';
import styles from '../../../assets/css/LoadingSpin.module.scss';

const cx = classNames.bind(styles);

/**
 * Modern SVG Loading Spinner (Twitter/X & Animate UI inspired)
 */
const LoadingSpin = ({
    size = 28,
    strokeWidth = 3,
    color,
    fullHeight = false,
    text = '',
    className = ''
}) => {
    const center = size / 2;
    const radius = center - strokeWidth;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className={cx('loading-wrapper', { 'full-height': fullHeight }, className)}>
            <div className={cx('spinner-container')} style={{ width: size, height: size }}>
                <svg
                    className={cx('spinner-svg')}
                    viewBox={`0 0 ${size} ${size}`}
                    style={{ width: size, height: size }}
                >
                    {/* Track ring */}
                    <circle
                        className={cx('track')}
                        cx={center}
                        cy={center}
                        r={radius}
                        strokeWidth={strokeWidth}
                    />
                    {/* Active rotating arc */}
                    <circle
                        className={cx('arc')}
                        cx={center}
                        cy={center}
                        r={radius}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * 0.75}
                        style={color ? { stroke: color } : undefined}
                    />
                </svg>
            </div>
            {text && <p className={cx('loading-text')}>{text}</p>}
        </div>
    );
};

export default LoadingSpin;