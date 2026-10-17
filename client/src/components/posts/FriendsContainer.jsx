import { useEffect, useState, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, X, Users, UserPlus, UserCheck, UserMinus, MessageSquare, ExternalLink, Sparkles, Check, Loader2, Briefcase, GraduationCap, MapPin } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import TrendsWidget from './TrendsWidget';
import WhoToFollowWidget from './WhoToFollowWidget';
import LoadingSpin from '../common/loading/LoadingSpin';
import default_avt from '../../../public/favicon.png';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

const cx = classNames.bind(styles);

const FriendsContainer = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user: currentUser } = useAuthStore();
    const { 
        friends = [], 
        fetchFriends, 
        friendRequests = [], 
        fetchFriendRequests, 
        suggestedFriends = [], 
        fetchSuggestedFriends, 
        unfriendAction, 
        acceptRequestAction, 
        declineRequestAction, 
        sendRequestAction
    } = useChatStore();

    // Tab state: 'friends' | 'requests' | 'suggestions'
    const [activeTab, setActiveTab] = useState('friends');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);

    // Action state
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [sentRequests, setSentRequests] = useState({});
    const [unfriendTarget, setUnfriendTarget] = useState(null);

    // Fetch initial data
    useEffect(() => {
        const loadAll = async () => {
            setIsLoadingInitial(true);
            try {
                await Promise.allSettled([
                    fetchFriends?.(),
                    fetchFriendRequests?.(),
                    fetchSuggestedFriends?.()
                ]);
            } finally {
                setIsLoadingInitial(false);
            }
        };
        loadAll();
    }, [fetchFriends, fetchFriendRequests, fetchSuggestedFriends]);

    // Safe filtered arrays
    const safeFriends = useMemo(() => {
        return Array.isArray(friends) ? friends.filter(f => f && f._id) : [];
    }, [friends]);

    const safeRequests = useMemo(() => {
        return Array.isArray(friendRequests) ? friendRequests.filter(r => r && r._id) : [];
    }, [friendRequests]);

    const safeSuggestions = useMemo(() => {
        const list = Array.isArray(suggestedFriends) ? suggestedFriends.filter(s => s && s._id) : [];
        const friendIds = new Set(safeFriends.map(f => f._id));
        return list.filter(s => !friendIds.has(s._id) && s._id !== currentUser?._id);
    }, [suggestedFriends, safeFriends, currentUser]);

    // Search filter
    const filteredFriends = useMemo(() => {
        if (!searchQuery.trim()) return safeFriends;
        const q = searchQuery.toLowerCase().trim();
        return safeFriends.filter(f => 
            (f.displayName && f.displayName.toLowerCase().includes(q)) ||
            (f.username && f.username.toLowerCase().includes(q)) ||
            (f.bio && f.bio.toLowerCase().includes(q))
        );
    }, [safeFriends, searchQuery]);

    const filteredRequests = useMemo(() => {
        if (!searchQuery.trim()) return safeRequests;
        const q = searchQuery.toLowerCase().trim();
        return safeRequests.filter(r => {
            const sender = r.from || r.sender;
            return (
                (sender?.displayName && sender.displayName.toLowerCase().includes(q)) ||
                (sender?.username && sender.username.toLowerCase().includes(q))
            );
        });
    }, [safeRequests, searchQuery]);

    const filteredSuggestions = useMemo(() => {
        if (!searchQuery.trim()) return safeSuggestions;
        const q = searchQuery.toLowerCase().trim();
        return safeSuggestions.filter(s => 
            (s.displayName && s.displayName.toLowerCase().includes(q)) ||
            (s.username && s.username.toLowerCase().includes(q)) ||
            (s.bio && s.bio.toLowerCase().includes(q))
        );
    }, [safeSuggestions, searchQuery]);

    // Actions
    const handleNavigateProfile = (userId) => {
        if (!userId) return;
        navigate(`/feed/profile/${userId}`);
    };

    const handleMessage = async (targetUser) => {
        if (!targetUser?._id) return;
        try {
            const convo = await useChatStore.getState().getOrCreateConversation(targetUser._id);
            if (convo?._id) {
                useChatStore.getState().setActiveConversationId(convo._id);
                navigate(`/chat?id=${convo._id}`);
            }
        } catch (error) {
            console.error("Failed to open chat:", error);
            toast.error("Không thể mở cuộc trò chuyện");
        }
    };

    const handleAccept = async (requestId) => {
        setActionLoadingId(requestId);
        try {
            await acceptRequestAction(requestId);
            toast.success("Đã đồng ý lời mời kết bạn!");
            fetchFriends?.();
        } catch (error) {
            console.error(error);
            toast.error("Không thể chấp nhận lời mời");
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleDecline = async (requestId) => {
        setActionLoadingId(requestId);
        try {
            await declineRequestAction(requestId);
            toast.success("Đã từ chối lời mời");
        } catch (error) {
            console.error(error);
            toast.error("Không thể từ chối lời mời");
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleSendRequest = async (targetUserId) => {
        if (!targetUserId || sentRequests[targetUserId]) return;
        setActionLoadingId(targetUserId);
        try {
            await sendRequestAction(targetUserId);
            setSentRequests(prev => ({ ...prev, [targetUserId]: true }));
            toast.success("Đã gửi lời mời kết bạn");
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || "Không thể gửi lời mời");
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleConfirmUnfriend = async () => {
        if (!unfriendTarget?._id) return;
        setActionLoadingId(unfriendTarget._id);
        try {
            await unfriendAction(unfriendTarget._id);
            toast.success(`Đã hủy kết bạn với ${unfriendTarget.displayName || unfriendTarget.username}`);
            setUnfriendTarget(null);
        } catch (error) {
            console.error(error);
            toast.error("Không thể hủy kết bạn");
        } finally {
            setActionLoadingId(null);
        }
    };

    // Subtitle based on active tab
    const getHeaderSubtitle = () => {
        if (activeTab === 'friends') {
            return `${safeFriends.length} người bạn`;
        } else if (activeTab === 'requests') {
            return safeRequests.length > 0 
                ? `${safeRequests.length} lời mời đang chờ phản hồi`
                : 'Không có lời mời nào';
        } else {
            return 'Những người bạn có thể biết';
        }
    };

    return (
        <div className={cx('feed-page-layout')}>
            {/* Center Column */}
            <main className={cx('main-timeline-col')}>
                {/* Sticky Header */}
                <header className={cx('friends-sticky-header')}>
                    <div className={cx('friends-top-bar')}>
                        <button 
                            type="button"
                            className={cx('friends-back-btn')}
                            onClick={() => navigate(-1)}
                            title="Quay lại"
                            aria-label="Quay lại"
                        >
                            <ArrowLeft size={20} />
                        </button>

                        <div className={cx('friends-header-meta')}>
                            <span className={cx('friends-header-title')}>{t('friends.title')}</span>
                            <span className={cx('friends-header-subtitle')}>{getHeaderSubtitle()}</span>
                        </div>

                        <button 
                            type="button" 
                            className={cx('friends-search-toggle-btn', { active: isSearchOpen || Boolean(searchQuery) })}
                            onClick={() => setIsSearchOpen(prev => !prev)}
                            title={t('common.search')}
                            aria-label={t('common.search')}
                        >
                            <Search size={18} />
                        </button>
                    </div>

                    {/* Collapsible Search Section */}
                    <AnimatePresence>
                        {isSearchOpen && (
                            <Motion.div 
                                className={cx('friends-search-section')}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className={cx('friends-search-input-box')}>
                                    <Search size={16} className={cx('friends-search-icon')} />
                                    <input
                                        type="text"
                                        placeholder={t('friends.searchPlaceholder')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className={cx('friends-search-input')}
                                        autoFocus
                                    />
                                    {searchQuery && (
                                        <button 
                                            type="button" 
                                            className={cx('friends-search-clear-btn')}
                                            onClick={() => setSearchQuery('')}
                                            aria-label="Xóa tìm kiếm"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </Motion.div>
                        )}
                    </AnimatePresence>

                    {/* Animated Tab Bar */}
                    <nav className={cx('friends-tabs-nav')} aria-label="Tabs bạn bè">
                        <button
                            type="button"
                            className={cx('friends-tab-btn', { active: activeTab === 'friends' })}
                            onClick={() => setActiveTab('friends')}
                        >
                            <span className={cx('friends-tab-label')}>
                                {t('friends.allFriends')}
                                {safeFriends.length > 0 && (
                                    <span className={cx('friends-tab-badge')}>{safeFriends.length}</span>
                                )}
                            </span>
                            {activeTab === 'friends' && (
                                <Motion.div 
                                    className={cx('friends-active-indicator')} 
                                    layoutId="friendsActiveTabIndicator" 
                                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                />
                            )}
                        </button>

                        <button
                            type="button"
                            className={cx('friends-tab-btn', { active: activeTab === 'requests' })}
                            onClick={() => setActiveTab('requests')}
                        >
                            <span className={cx('friends-tab-label')}>
                                {t('friends.friendRequests')}
                                {safeRequests.length > 0 && (
                                    <span className={cx('friends-tab-badge', 'alert')}>
                                        {safeRequests.length}
                                    </span>
                                )}
                            </span>
                            {activeTab === 'requests' && (
                                <Motion.div 
                                    className={cx('friends-active-indicator')} 
                                    layoutId="friendsActiveTabIndicator" 
                                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                />
                            )}
                        </button>

                        <button
                            type="button"
                            className={cx('friends-tab-btn', { active: activeTab === 'suggestions' })}
                            onClick={() => setActiveTab('suggestions')}
                        >
                            <span className={cx('friends-tab-label')}>
                                {t('friends.suggestions')}
                            </span>
                            {activeTab === 'suggestions' && (
                                <Motion.div 
                                    className={cx('friends-active-indicator')} 
                                    layoutId="friendsActiveTabIndicator" 
                                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                />
                            )}
                        </button>
                    </nav>
                </header>

                {/* Content Stream */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
                    {isLoadingInitial ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px 0' }}>
                            <LoadingSpin size={32} />
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {/* TAB 1: ALL FRIENDS */}
                            {activeTab === 'friends' && (
                                <Motion.div 
                                    key="tab-friends"
                                    className={cx('friends-cards-list')}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {filteredFriends.length === 0 ? (
                                        <div className={cx('friends-empty-box')}>
                                            <div className={cx('friends-empty-icon')}>
                                                <Users size={32} />
                                            </div>
                                            <h3 className={cx('friends-empty-title')}>
                                                {searchQuery ? "Không tìm thấy bạn bè nào" : "Chưa có bạn bè nào"}
                                            </h3>
                                            <p className={cx('friends-empty-desc')}>
                                                {searchQuery 
                                                    ? "Hãy thử tìm kiếm với từ khóa khác hoặc tên tài khoản." 
                                                    : "Kết nối với mọi người để cùng trò chuyện, chia sẻ bài viết và mở rộng mối quan hệ."}
                                            </p>
                                            {!searchQuery && (
                                                <button 
                                                    type="button" 
                                                    className={cx('friends-empty-cta-btn')}
                                                    onClick={() => setActiveTab('suggestions')}
                                                >
                                                    <Sparkles size={16} />
                                                    Khám phá gợi ý
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        filteredFriends.map((friend, idx) => (
                                            <Motion.div 
                                                key={friend._id}
                                                className={cx('friends-user-card')}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0, overflow: 'hidden' }}
                                                transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.22 }}
                                            >
                                                <div 
                                                    className={cx('user-avatar-wrap')}
                                                    onClick={() => handleNavigateProfile(friend._id)}
                                                >
                                                    <img 
                                                        src={friend.avatarURL || default_avt} 
                                                        alt={friend.displayName} 
                                                        className={cx('user-avatar-img')}
                                                        onError={(e) => { e.currentTarget.src = default_avt; }}
                                                    />
                                                </div>

                                                <div className={cx('user-details-col')}>
                                                    <div className={cx('user-header-row')}>
                                                        <div 
                                                            className={cx('user-meta-info')}
                                                            onClick={() => handleNavigateProfile(friend._id)}
                                                        >
                                                            <span className={cx('user-display-name')}>{friend.displayName}</span>
                                                            <span className={cx('user-username')}>@{friend.username || 'user'}</span>
                                                        </div>

                                                        {/* Actions Right */}
                                                        <div className={cx('user-actions-right')}>
                                                            <button 
                                                                type="button" 
                                                                className={cx('friends-action-btn', 'primary')}
                                                                onClick={() => handleMessage(friend)}
                                                            >
                                                                <MessageSquare size={14} />
                                                                Nhắn tin
                                                            </button>

                                                            <button 
                                                                type="button" 
                                                                className={cx('friends-action-btn', 'secondary')}
                                                                onClick={() => handleNavigateProfile(friend._id)}
                                                            >
                                                                <ExternalLink size={13} />
                                                                Hồ sơ
                                                            </button>

                                                            <button 
                                                                type="button" 
                                                                className={cx('friends-action-btn', 'danger')}
                                                                onClick={() => setUnfriendTarget(friend)}
                                                                title="Hủy kết bạn"
                                                            >
                                                                <UserMinus size={15} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {friend.bio && (
                                                        <p className={cx('user-bio-text')}>{friend.bio}</p>
                                                    )}

                                                    {(friend.workplace || friend.school || friend.location) && (
                                                        <div className={cx('user-chips-row')}>
                                                            {friend.workplace && (
                                                                <span className={cx('user-chip-item')}>
                                                                    <Briefcase size={13} />
                                                                    {friend.workplace}
                                                                </span>
                                                            )}
                                                            {friend.school && (
                                                                <span className={cx('user-chip-item')}>
                                                                    <GraduationCap size={13} />
                                                                    {friend.school}
                                                                </span>
                                                            )}
                                                            {friend.location && (
                                                                <span className={cx('user-chip-item')}>
                                                                    <MapPin size={13} />
                                                                    {friend.location}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </Motion.div>
                                        ))
                                    )}
                                </Motion.div>
                            )}

                            {/* TAB 2: FRIEND REQUESTS */}
                            {activeTab === 'requests' && (
                                <Motion.div 
                                    key="tab-requests"
                                    className={cx('friends-cards-list')}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {filteredRequests.length === 0 ? (
                                        <div className={cx('friends-empty-box')}>
                                            <div className={cx('friends-empty-icon')}>
                                                <UserCheck size={32} />
                                            </div>
                                            <h3 className={cx('friends-empty-title')}>
                                                Không có lời mời nào
                                            </h3>
                                            <p className={cx('friends-empty-desc')}>
                                                Khi có ai đó gửi lời mời kết bạn cho bạn, thông báo và lời mời sẽ xuất hiện ở đây.
                                            </p>
                                        </div>
                                    ) : (
                                        filteredRequests.map((req, idx) => {
                                            const sender = req.from || req.sender;
                                            if (!sender) return null;
                                            const timeAgo = req.createdAt
                                                ? formatDistanceToNow(new Date(req.createdAt), { addSuffix: true, locale: vi })
                                                : '';
                                            const isActionPending = actionLoadingId === req._id;

                                            return (
                                                <Motion.div 
                                                    key={req._id}
                                                    className={cx('friends-user-card')}
                                                    initial={{ opacity: 0, y: 12 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0, overflow: 'hidden' }}
                                                    transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.22 }}
                                                >
                                                    <div 
                                                        className={cx('user-avatar-wrap')}
                                                        onClick={() => handleNavigateProfile(sender._id)}
                                                    >
                                                        <img 
                                                            src={sender.avatarURL || default_avt} 
                                                            alt={sender.displayName} 
                                                            className={cx('user-avatar-img')}
                                                            onError={(e) => { e.currentTarget.src = default_avt; }}
                                                        />
                                                    </div>

                                                    <div className={cx('user-details-col')}>
                                                        <div className={cx('user-header-row')}>
                                                            <div 
                                                                className={cx('user-meta-info')}
                                                                onClick={() => handleNavigateProfile(sender._id)}
                                                            >
                                                                <span className={cx('user-display-name')}>{sender.displayName || sender.username}</span>
                                                                <span className={cx('user-username')}>@{sender.username || 'user'}</span>
                                                            </div>

                                                            <div className={cx('user-actions-right')}>
                                                                <button 
                                                                    type="button"
                                                                    className={cx('friends-action-btn', 'primary')}
                                                                    onClick={() => handleAccept(req._id)}
                                                                    disabled={isActionPending}
                                                                >
                                                                    {isActionPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                                    Chấp nhận
                                                                </button>

                                                                <button 
                                                                    type="button"
                                                                    className={cx('friends-action-btn', 'secondary')}
                                                                    onClick={() => handleDecline(req._id)}
                                                                    disabled={isActionPending}
                                                                >
                                                                    <X size={14} />
                                                                    Từ chối
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {timeAgo && (
                                                            <span style={{ fontSize: '1.25rem', color: '#71767b', marginTop: 4 }}>{timeAgo}</span>
                                                        )}

                                                        {sender.bio && (
                                                            <p className={cx('user-bio-text')}>{sender.bio}</p>
                                                        )}
                                                    </div>
                                                </Motion.div>
                                            );
                                        })
                                    )}
                                </Motion.div>
                            )}

                            {/* TAB 3: SUGGESTED FRIENDS */}
                            {activeTab === 'suggestions' && (
                                <Motion.div 
                                    key="tab-suggestions"
                                    className={cx('friends-cards-list')}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {filteredSuggestions.length === 0 ? (
                                        <div className={cx('friends-empty-box')}>
                                            <div className={cx('friends-empty-icon')}>
                                                <Sparkles size={32} />
                                            </div>
                                            <h3 className={cx('friends-empty-title')}>
                                                Hiện chưa có gợi ý mới
                                            </h3>
                                            <p className={cx('friends-empty-desc')}>
                                                Hãy tiếp tục khám phá bài viết trên bảng tin và tương tác với cộng đồng!
                                            </p>
                                        </div>
                                    ) : (
                                        filteredSuggestions.map((sug, idx) => {
                                            const isSent = Boolean(sentRequests[sug._id]);
                                            const isSending = actionLoadingId === sug._id;

                                            return (
                                                <Motion.div 
                                                    key={sug._id}
                                                    className={cx('friends-user-card')}
                                                    initial={{ opacity: 0, y: 12 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0, overflow: 'hidden' }}
                                                    transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.22 }}
                                                >
                                                    <div 
                                                        className={cx('user-avatar-wrap')}
                                                        onClick={() => handleNavigateProfile(sug._id)}
                                                    >
                                                        <img 
                                                            src={sug.avatarURL || default_avt} 
                                                            alt={sug.displayName} 
                                                            className={cx('user-avatar-img')}
                                                            onError={(e) => { e.currentTarget.src = default_avt; }}
                                                        />
                                                    </div>

                                                    <div className={cx('user-details-col')}>
                                                        <div className={cx('user-header-row')}>
                                                            <div 
                                                                className={cx('user-meta-info')}
                                                                onClick={() => handleNavigateProfile(sug._id)}
                                                            >
                                                                <span className={cx('user-display-name')}>{sug.displayName}</span>
                                                                <span className={cx('user-username')}>@{sug.username || 'user'}</span>
                                                            </div>

                                                            <div className={cx('user-actions-right')}>
                                                                {isSent ? (
                                                                    <button 
                                                                        type="button" 
                                                                        className={cx('friends-action-btn', 'secondary')}
                                                                        disabled
                                                                    >
                                                                        <Check size={14} />
                                                                        Đã gửi
                                                                    </button>
                                                                ) : (
                                                                    <button 
                                                                        type="button" 
                                                                        className={cx('friends-action-btn', 'primary')}
                                                                        onClick={() => handleSendRequest(sug._id)}
                                                                        disabled={isSending}
                                                                    >
                                                                        {isSending ? (
                                                                            <Loader2 size={14} className="animate-spin" />
                                                                        ) : (
                                                                            <UserPlus size={14} />
                                                                        )}
                                                                        Kết bạn
                                                                    </button>
                                                                )}

                                                                <button 
                                                                    type="button" 
                                                                    className={cx('friends-action-btn', 'secondary')}
                                                                    onClick={() => handleNavigateProfile(sug._id)}
                                                                >
                                                                    <ExternalLink size={13} />
                                                                    Hồ sơ
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {sug.bio && (
                                                            <p className={cx('user-bio-text')}>{sug.bio}</p>
                                                        )}

                                                        {(sug.workplace || sug.school || sug.location) && (
                                                            <div className={cx('user-chips-row')}>
                                                                {sug.workplace && (
                                                                    <span className={cx('user-chip-item')}>
                                                                        <Briefcase size={13} />
                                                                        {sug.workplace}
                                                                    </span>
                                                                )}
                                                                {sug.school && (
                                                                    <span className={cx('user-chip-item')}>
                                                                        <GraduationCap size={13} />
                                                                        {sug.school}
                                                                    </span>
                                                                )}
                                                                {sug.location && (
                                                                    <span className={cx('user-chip-item')}>
                                                                        <MapPin size={13} />
                                                                        {sug.location}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </Motion.div>
                                            );
                                        })
                                    )}
                                </Motion.div>
                            )}
                        </AnimatePresence>
                    )}
                </div>
            </main>

            {/* Right Column: Widgets Column (Desktop >= 1024px) */}
            <aside className={cx('feed-widgets-col')}>
                <div className={cx('widgets-sticky-wrapper')}>
                    <TrendsWidget />
                    <WhoToFollowWidget />
                </div>
            </aside>

            {/* Unfriend Confirmation Modal */}
            <AnimatePresence>
                {unfriendTarget && (
                    <Motion.div 
                        className={cx('friends-unfriend-modal-backdrop')}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setUnfriendTarget(null)}
                    >
                        <Motion.div 
                            className={cx('friends-unfriend-modal-box')}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className={cx('modal-title')}>Hủy kết bạn?</h3>
                            <p className={cx('modal-desc')}>
                                Bạn có chắc chắn muốn hủy kết bạn với <strong>{unfriendTarget.displayName || unfriendTarget.username}</strong> không? Hai bạn sẽ không còn thấy bài viết riêng tư của nhau.
                            </p>
                            <div className={cx('modal-actions')}>
                                <button 
                                    type="button"
                                    className={cx('modal-confirm-btn')}
                                    onClick={handleConfirmUnfriend}
                                    disabled={actionLoadingId === unfriendTarget._id}
                                >
                                    {actionLoadingId === unfriendTarget._id ? "Đang hủy..." : "Hủy kết bạn"}
                                </button>
                                <button 
                                    type="button"
                                    className={cx('modal-cancel-btn')}
                                    onClick={() => setUnfriendTarget(null)}
                                >
                                    Hủy bỏ
                                </button>
                            </div>
                        </Motion.div>
                    </Motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FriendsContainer;
