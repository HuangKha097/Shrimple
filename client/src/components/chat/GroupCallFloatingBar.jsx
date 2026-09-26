import React from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/GroupCall.module.scss';
import { useGroupCallStore } from '../../stores/useGroupCallStore';
import { Mic, MicOff, PhoneOff, Radio } from 'lucide-react';

const cx = classNames.bind(styles);

const GroupCallFloatingBar = () => {
    const {
        isInCall,
        isMinimized,
        groupInfo,
        peers,
        isMuted,
        toggleMic,
        leaveGroupCall,
        setModalOpen,
        toggleMinimize,
    } = useGroupCallStore();

    if (!isInCall || !isMinimized) return null;

    const totalCount = Object.keys(peers).length + 1;

    return (
        <div
            className={cx('minimized-voice-bar')}
            onClick={() => {
                setModalOpen(true);
                toggleMinimize();
            }}
            title="Nhấp để mở lại phòng thoại"
        >
            <div className={cx('bar-info')}>
                <span className={cx('pulse-dot')} />
                <div className={cx('bar-text')}>
                    <span className={cx('title')}>
                        {groupInfo?.name || 'Phòng thoại'}
                    </span>
                    <span className={cx('sub')}>
                        {totalCount} người đang kết nối · Nhấn để phóng to
                    </span>
                </div>
            </div>

            <div className={cx('bar-actions')} onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    className={cx('mini-btn', { muted: isMuted })}
                    onClick={toggleMic}
                    title={isMuted ? 'Bật micro' : 'Tắt micro'}
                >
                    {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button
                    type="button"
                    className={cx('mini-btn', 'leave')}
                    onClick={leaveGroupCall}
                    title="Ngắt kết nối"
                >
                    <PhoneOff size={16} />
                </button>
            </div>
        </div>
    );
};

export default GroupCallFloatingBar;
