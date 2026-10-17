
import classNames from 'classnames/bind';
import styles from '../../assets/css/GroupCall.module.scss';
import { useGroupCallStore } from '../../stores/useGroupCallStore';
import { PhoneCall, Radio } from 'lucide-react';
import defaultAvatar from '../../../public/favicon.png';
import { ASSET_BASE_URL } from '../../config/env';

const cx = classNames.bind(styles);

const GroupCallBanner = ({ conversationId, groupInfo }) => {
    const { activeGroupCalls, isInCall, currentConversationId, joinGroupCall, setModalOpen } = useGroupCallStore();

    const activeCall = activeGroupCalls[conversationId];

    if (!activeCall || !activeCall.isActive || !activeCall.participants || activeCall.participants.length === 0) {
        return null;
    }

    const isCurrentInThisCall = isInCall && currentConversationId === conversationId;
    const participants = activeCall.participants || [];

    const getAvatarSrc = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    const handleActionClick = () => {
        if (isCurrentInThisCall) {
            setModalOpen(true);
        } else {
            joinGroupCall(conversationId, groupInfo);
        }
    };

    return (
        <div className={cx('group-call-banner')}>
            <div className={cx('banner-left')}>
                <div className={cx('banner-icon-box')}>
                    <Radio size={20} />
                </div>
                <div className={cx('banner-info')}>
                    <span className={cx('banner-title')}>
                        <span className={cx('live-dot')} />
                        Cuộc gọi nhóm đang diễn ra
                    </span>
                    <span className={cx('banner-desc')}>
                        {participants.length} thành viên đang trong phòng thoại
                    </span>
                </div>
            </div>

            <div className={cx('banner-right')}>
                <div className={cx('avatar-stack')}>
                    {participants.slice(0, 4).map((p) => (
                        <img
                            key={p.socketId || p.userId}
                            src={getAvatarSrc(p.avatar)}
                            alt={p.name}
                            title={p.name}
                            onError={(e) => { e.target.src = defaultAvatar; }}
                        />
                    ))}
                </div>

                <button
                    type="button"
                    className={cx('join-call-btn', { 'in-call': isCurrentInThisCall })}
                    onClick={handleActionClick}
                >
                    <PhoneCall size={16} />
                    <span>{isCurrentInThisCall ? 'Mở phòng thoại' : 'Tham gia'}</span>
                </button>
            </div>
        </div>
    );
};

export default GroupCallBanner;
