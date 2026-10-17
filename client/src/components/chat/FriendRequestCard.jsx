
import classNames from 'classnames/bind';
import styles from '../../assets/css/FriendRequestCard.module.scss';
import { Check, X, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);
const defaultAvatar = '/favicon.png';

const FriendRequestCard = ({ request, onAccept, onDecline, isProcessing }) => {
    const { from, createdAt } = request;
    const senderName = from?.displayName || from?.username || 'Người dùng';
    const avatarUrl = from?.avatarURL;
    const avatarSrc = avatarUrl
        ? (/^https?:\/\//i.test(avatarUrl) ? avatarUrl : `${ASSET_BASE_URL}/${avatarUrl.replace(/^\/+/, '')}`)
        : defaultAvatar;

    // Format thời gian (VD: "5 phút trước") - Nếu không cài date-fns thì bỏ đoạn này
    const timeAgo = createdAt
        ? formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: vi })
        : '';

    return (
        <div className={cx('card-wrapper')}>
            {/* Avatar */}
            <div className={cx('avatar-section')}>
                <img
                    src={avatarSrc}
                    alt={`Ảnh đại diện của ${senderName}`}
                    className={cx('avatar')}
                    onError={(e) => {
                        if (!e.currentTarget.src.endsWith(defaultAvatar)) {
                            e.currentTarget.src = defaultAvatar;
                        }
                    }}
                />
            </div>

            {/* Thông tin */}
            <div className={cx('info-section')}>
                <p className={cx('name')} title={senderName}>{senderName}</p>
                {from?.displayName && from?.username && (
                    <p className={cx('username')}>@{from.username}</p>
                )}
                <p className={cx('time')}>{timeAgo}</p>
            </div>

            {/* Nút hành động */}
            <div className={cx('action-section')}>
                <button
                    type="button"
                    className={cx('btn', 'accept')}
                    onClick={() => onAccept(request._id)}
                    disabled={isProcessing}
                    title="Chấp nhận"
                    aria-label={`Chấp nhận lời mời của ${senderName}`}
                >
                    {isProcessing ? <Loader2 className={cx('spinner')} size={18} /> : <Check size={18} />}
                </button>

                <button
                    type="button"
                    className={cx('btn', 'decline')}
                    onClick={() => onDecline(request._id)}
                    disabled={isProcessing}
                    title="Từ chối"
                    aria-label={`Từ chối lời mời của ${senderName}`}
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};

export default FriendRequestCard;
