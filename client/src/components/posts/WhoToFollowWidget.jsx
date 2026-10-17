import { useState, useEffect } from 'react';
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/PostsContainer.module.scss';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { friendService } from '../../services/friendService';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import default_avt from '../../../public/favicon.png';
import { useNavigate } from 'react-router-dom';

const cx = classNames.bind(styles);

const WhoToFollowWidget = ({ onOpenAddFriend }) => {
    const { t } = useTranslation();
    const { suggestedFriends, fetchSuggestedFriends, friends } = useChatStore();
    const { user: currentUser } = useAuthStore();
    const navigate = useNavigate();

    const [sentRequests, setSentRequests] = useState({});
    const [pendingRequests, setPendingRequests] = useState({});

    useEffect(() => {
        if (fetchSuggestedFriends) {
            fetchSuggestedFriends();
        }
    }, [fetchSuggestedFriends]);

    const handleAddFriend = async (e, userId) => {
        e.stopPropagation();
        if (!userId) return;

        setPendingRequests(prev => ({ ...prev, [userId]: true }));
        try {
            await friendService.sendRequest(userId);
            setSentRequests(prev => ({ ...prev, [userId]: true }));
            toast.success("Đã gửi lời mời kết bạn!");
        } catch (error) {
            const msg = error.response?.data?.message || "Lỗi gửi lời mời";
            if (msg === "You already send request" || msg.includes("already")) {
                setSentRequests(prev => ({ ...prev, [userId]: true }));
                toast.info("Đã gửi lời mời trước đó rồi.");
            } else {
                toast.error(msg);
            }
        } finally {
            setPendingRequests(prev => ({ ...prev, [userId]: false }));
        }
    };

    const safeFriends = Array.isArray(friends) ? friends.filter(f => f && f._id) : [];
    const displaySuggestions = (suggestedFriends || [])
        .filter(u => u && u._id && u._id !== currentUser?._id)
        .slice(0, 4);

    if (displaySuggestions.length === 0) {
        return null;
    }

    return (
        <div className={cx('x-widget-card')}>
            <h3 className={cx('widget-title')}>{t('feed.whoToFollow')}</h3>

            <div className={cx('widget-list')}>
                {displaySuggestions.map((user) => {
                    const isFriend = safeFriends.some(f => f && f._id === user._id);
                    const isSent = sentRequests[user._id];
                    const isPending = pendingRequests[user._id];
                    const displayName = user.displayName || user.username || 'Người dùng';
                    const username = user.username ? `@${user.username}` : '';
                    const avatar = user.avatarURL || default_avt;

                    return (
                        <div 
                            key={user._id} 
                            className={cx('widget-user-item')}
                            onClick={() => navigate(`/feed/profile/${user._id}`)}
                        >
                            <img 
                                src={avatar} 
                                alt={displayName} 
                                className={cx('widget-user-avatar')}
                                onError={(e) => { e.currentTarget.src = default_avt; }}
                            />

                            <div className={cx('widget-user-info')}>
                                <span className={cx('widget-user-name')} title={displayName}>
                                    {displayName}
                                </span>
                                {username && (
                                    <span className={cx('widget-user-handle')}>
                                        {username}
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                className={cx('widget-action-btn', {
                                    sent: isSent,
                                    friend: isFriend,
                                    pending: isPending
                                })}
                                onClick={(e) => handleAddFriend(e, user._id)}
                                disabled={isSent || isFriend || isPending}
                            >
                                {isPending ? (
                                    <Loader2 className={cx('btn-spinner')} size={14} />
                                ) : isFriend ? (
                                    <span>{t('feed.friends')}</span>
                                ) : isSent ? (
                                    <>
                                        <Check size={14} /> {t('feed.sentRequest')}
                                    </>
                                ) : (
                                    t('feed.addFriend')
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {onOpenAddFriend && (
                <button 
                    type="button" 
                    className={cx('widget-footer-btn')}
                    onClick={onOpenAddFriend}
                >
                    {t('feed.showMore')}
                </button>
            )}
        </div>
    );
};

export default WhoToFollowWidget;
