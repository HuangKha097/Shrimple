import React from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/FriendRequestCard.module.scss';
import default_avt from "../../../public/favicon.png";
import { Check, X, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

const cx = classNames.bind(styles);

const FriendRequestCard = ({ request, onAccept, onDecline, isProcessing }) => {
    const { from, createdAt } = request;

    // Format thời gian (VD: "5 phút trước") - Nếu không cài date-fns thì bỏ đoạn này
    const timeAgo = createdAt
        ? formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: vi })
        : '';

    return (
        <div className={cx('card-wrapper')}>
            {/* Avatar */}
            <div className={cx('avatar-section')}>
                <img
                    src={from?.avatarURL ? (from.avatarURL.startsWith('http') ? from.avatarURL : `http://localhost:5001${from.avatarURL}`) : default_avt}
                    alt="avatar"
                    className={cx('avatar')}
                    onError={(e) => { e.target.src = default_avt }}
                />
            </div>

            {/* Thông tin */}
            <div className={cx('info-section')}>
                <p className={cx('name')}>{from?.displayName || from?.username}</p>
                <p className={cx('time')}>{timeAgo}</p>
            </div>

            {/* Nút hành động */}
            <div className={cx('action-section')}>
                <button
                    className={cx('btn', 'accept')}
                    onClick={() => onAccept(request._id)}
                    disabled={isProcessing}
                    title="Chấp nhận"
                >
                    {isProcessing ? <Loader2 className={cx('spinner')} size={18} /> : <Check size={18} />}
                </button>

                <button
                    className={cx('btn', 'decline')}
                    onClick={() => onDecline(request._id)}
                    disabled={isProcessing}
                    title="Từ chối"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};

export default FriendRequestCard;