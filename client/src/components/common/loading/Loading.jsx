import React from 'react';
import styles from '../../../assets/css/Loading.module.scss';
import classNames from 'classnames/bind';

const cx = classNames.bind(styles);

export function IndeterminateLoader() {
    return (
        <div className={cx("loader-wrapper")}>
            <div className={cx("loader-bar")}></div>
        </div>
    );
}

export function ProgressBar({progress = 0}) {
    const progressValue = Math.min(Math.max(progress, 0), 100);

    return (
        <div className={cx("progress-wrapper")}>
            <div
                className={cx("progress-bar")}
                style={{width: `${progressValue}%`}}
                role="progressbar"
                aria-valuenow={progressValue}
                aria-valuemin="0"
                aria-valuemax="100"
            >
            </div>
        </div>
    );
}