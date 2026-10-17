import { useState, useEffect, useRef } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { Bell } from 'lucide-react';
import styles from '../../assets/css/NotificationDropdown.module.scss';
import { useNotificationStore } from '../../stores/useNotificationStore';
import { useChatStore } from '../../stores/useChatStore';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import defaultAvatar from '../../../public/favicon.png';
import { ASSET_BASE_URL } from '../../config/env';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const NotificationDropdown = ({ align = 'right' }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const {
        notifications = [],
        unreadCount: unreadActivityCount = 0,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
    } = useNotificationStore();

    const {
        friendRequests = [],
        fetchFriendRequests,
        acceptRequestAction,
        declineRequestAction,
    } = useChatStore();

    // Auto fetch notifications & friend requests on mount
    useEffect(() => {
        fetchNotifications?.();
        fetchFriendRequests?.();
    }, [fetchNotifications, fetchFriendRequests]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const totalUnreadNotifs = (friendRequests?.length || 0) + (unreadActivityCount || 0);

    const getAvatarSrc = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    const formatRelativeTime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
    };

    const handleAcceptFriend = async (requestId) => {
        try {
            await acceptRequestAction(requestId);
            toast.success('Đã chấp nhận lời mời kết bạn');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể chấp nhận lời mời');
        }
    };

    const handleDeclineFriend = async (requestId) => {
        try {
            await declineRequestAction(requestId);
            toast.info('Đã từ chối lời mời kết bạn');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể từ chối lời mời');
        }
    };

    const handleNotificationClick = (notif) => {
        if (!notif.isRead) {
            markAsRead(notif._id);
        }
        setIsOpen(false);

        const targetPostId = notif.post?._id || notif.postId || (typeof notif.post === 'string' ? notif.post : null);
        const senderId = notif.sender?._id || notif.sender?.id || (typeof notif.sender === 'string' ? notif.sender : null);

        if (targetPostId) {
            navigate(`/feed/post/${targetPostId}`);
        } else if (senderId) {
            navigate(`/feed/profile/${senderId}`);
        }
    };

    const handleProfileClick = (e, userId, notifId = null) => {
        e.stopPropagation();
        if (notifId) {
            markAsRead(notifId);
        }
        setIsOpen(false);
        if (userId) {
            navigate(`/feed/profile/${userId}`);
        }
    };

    return (
        <div className={cx('notif-wrapper')} ref={wrapperRef}>
            <button
                type="button"
                className={cx('notif-btn', { active: isOpen })}
                onClick={() => setIsOpen(!isOpen)}
                title={t('feed.notifications')}
                aria-label={t('feed.notifications')}
            >
                <Bell size={20} />
                {totalUnreadNotifs > 0 && (
                    <span className={cx('notif-badge')}>
                        {totalUnreadNotifs > 99 ? '99+' : totalUnreadNotifs}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <Motion.div
                        className={cx('notif-popover', `align-${align}`)}
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                        {/* Header */}
                        <div className={cx('notif-header')}>
                            <div className={cx('notif-title-group')}>
                                <h3 className={cx('notif-title')}>{t('feed.notifications')}</h3>
                                {totalUnreadNotifs > 0 && (
                                    <span className={cx('notif-count-pill')}>{totalUnreadNotifs} mới</span>
                                )}
                            </div>
                            {(notifications.length > 0 || friendRequests.length > 0) && (
                                <button
                                    type="button"
                                    className={cx('notif-mark-read-btn')}
                                    onClick={() => markAllAsRead()}
                                >
                                    {t('feed.markAllRead')}
                                </button>
                            )}
                        </div>

                        {/* Body */}
                        <div className={cx('notif-body')}>
                            {notifications.length === 0 && friendRequests.length === 0 ? (
                                <div className={cx('notif-empty-state')}>
                                    <Bell size={32} className={cx('notif-empty-icon')} />
                                    <p>Chưa có thông báo mới nào</p>
                                    <small>Khi có tương tác hoặc lời mời kết bạn, bạn sẽ thấy ở đây.</small>
                                </div>
                            ) : (
                                <>
                                    {/* 1. Lời mời kết bạn */}
                                    {friendRequests.length > 0 && (
                                        <>
                                            <div className={cx('notif-section-title')}>Lời mời kết bạn</div>
                                            {friendRequests.map((req) => {
                                                const sender = req.sender || req.from || {};
                                                const senderAvatar = getAvatarSrc(sender.avatarURL);
                                                const senderName = sender.displayName || sender.username || 'Người dùng';
                                                const senderId = sender._id || sender.id || (typeof sender === 'string' ? sender : null);

                                                return (
                                                    <div 
                                                        key={`friend-${req._id}`} 
                                                        className={cx('notif-item', 'unread')}
                                                        onClick={() => {
                                                            if (senderId) {
                                                                setIsOpen(false);
                                                                navigate(`/feed/profile/${senderId}`);
                                                            }
                                                        }}
                                                    >
                                                        <img
                                                            src={senderAvatar}
                                                            alt={senderName}
                                                            className={cx('notif-avatar')}
                                                            onError={(e) => { e.currentTarget.src = defaultAvatar; }}
                                                            onClick={(e) => handleProfileClick(e, senderId)}
                                                        />
                                                        <div className={cx('notif-content')}>
                                                            <div className={cx('notif-text')}>
                                                                <strong
                                                                    onClick={(e) => handleProfileClick(e, senderId)}
                                                                >
                                                                    {senderName}
                                                                </strong>{' '}
                                                                đã gửi cho bạn một lời mời kết bạn.
                                                            </div>
                                                            <div className={cx('notif-actions')}>
                                                                <button
                                                                    type="button"
                                                                    className={cx('notif-accept-btn')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleAcceptFriend(req._id);
                                                                    }}
                                                                >
                                                                    Chấp nhận
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={cx('notif-decline-btn')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeclineFriend(req._id);
                                                                    }}
                                                                >
                                                                    Từ chối
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}

                                    {/* 2. Tương tác bài viết */}
                                    {notifications.length > 0 && (
                                        <>
                                            <div className={cx('notif-section-title')}>Hoạt động & Tương tác</div>
                                            {notifications.map((notif) => {
                                                const sender = notif.sender || {};
                                                const senderAvatar = getAvatarSrc(sender.avatarURL);
                                                const senderName = sender.displayName || sender.username || 'Ai đó';
                                                const senderId = sender._id || sender.id || (typeof sender === 'string' ? sender : null);

                                                let actionDesc = 'đã tương tác với bạn.';
                                                if (notif.type === 'like') actionDesc = 'đã thích bài viết của bạn.';
                                                if (notif.type === 'comment') actionDesc = `đã bình luận: "${notif.text || ''}"`;
                                                if (notif.type === 'reply') actionDesc = `đã phản hồi: "${notif.text || ''}"`;
                                                if (notif.type === 'mention') actionDesc = `đã nhắc đến bạn: "${notif.text || ''}"`;
                                                if (notif.type === 'friend_accept') actionDesc = 'đã chấp nhận lời mời kết bạn của bạn.';
                                                if (notif.type === 'friend_request') actionDesc = 'đã gửi cho bạn một lời mời kết bạn.';

                                                return (
                                                    <div
                                                        key={notif._id}
                                                        className={cx('notif-item', { unread: !notif.isRead })}
                                                        onClick={() => handleNotificationClick(notif)}
                                                    >
                                                        <img
                                                            src={senderAvatar}
                                                            alt={senderName}
                                                            className={cx('notif-avatar')}
                                                            onError={(e) => { e.currentTarget.src = defaultAvatar; }}
                                                            onClick={(e) => handleProfileClick(e, senderId, notif._id)}
                                                        />
                                                        <div className={cx('notif-content')}>
                                                            <div className={cx('notif-text')}>
                                                                <strong
                                                                    onClick={(e) => handleProfileClick(e, senderId, notif._id)}
                                                                >
                                                                    {senderName}
                                                                </strong>{' '}
                                                                {actionDesc}
                                                            </div>
                                                            <span className={cx('notif-time')}>
                                                                {formatRelativeTime(notif.createdAt)}
                                                            </span>
                                                        </div>
                                                        {!notif.isRead && <span className={cx('unread-indicator')} />}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </Motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationDropdown;
