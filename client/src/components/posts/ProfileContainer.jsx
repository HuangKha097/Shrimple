import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePostStore } from '../../stores/usePostStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import { authService } from '../../services/authService';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { 
    ArrowLeft, 
    Calendar, 
    MapPin, 
    Briefcase, 
    GraduationCap, 
    BookOpen,
    Cake,
    Lock, 
    MessageSquare, 
    UserPlus, 
    UserCheck, 
    X,
    FileText,
    Repeat,
    Video,
    Bookmark
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import PostItem from './PostItem';
import TrendsWidget from './TrendsWidget';
import WhoToFollowWidget from './WhoToFollowWidget';
import LoadingSpin from '../common/loading/LoadingSpin';
import default_avt from '../../../public/favicon.png';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const ProfileContainer = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const feedLayoutRef = useRef(null);

    const { 
        userPosts, 
        fetchUserPosts, 
        savedPosts, 
        fetchSavedPosts, 
        likePost, 
        addComment, 
        deletePost 
    } = usePostStore();
    const { user: currentUser } = useAuthStore();
    const { friends, sendRequestAction } = useChatStore();

    const [profileUser, setProfileUser] = useState(null);
    const [isLoadingUser, setIsLoadingUser] = useState(true);
    const [isLoadingPosts, setIsLoadingPosts] = useState(false);

    // Active tab: 'posts' | 'reposts' | 'videos' | 'saved'
    const [activeTab, setActiveTab] = useState('posts');

    // Robust Own Profile Detection
    const isOwnProfile = Boolean(
        currentUser && (
            userId === 'me' || 
            !userId || 
            (currentUser._id && String(currentUser._id) === String(userId)) ||
            (currentUser.id && String(currentUser.id) === String(userId))
        )
    );

    const targetUserId = (userId === 'me' || !userId ? currentUser?._id : userId) || currentUser?._id || '';

    const isFriend = Array.isArray(friends) && friends.some(
        f => String(f?._id || f?.id) === String(targetUserId)
    );

    // Load User Details
    useEffect(() => {
        let isMounted = true;

        const loadUserInfo = async () => {
            const uid = targetUserId;
            if (!uid || uid === "undefined") {
                if (currentUser) {
                    setProfileUser(currentUser);
                }
                setIsLoadingUser(false);
                return;
            }

            // Immediately display currentUser if viewing own profile (zero delay/flicker)
            if (isOwnProfile && currentUser) {
                setProfileUser(currentUser);
                setIsLoadingUser(false);
            } else {
                setIsLoadingUser(true);
            }

            try {
                const userData = await authService.getUserById(uid);
                if (isMounted && userData) {
                    setProfileUser(userData);
                }
            } catch (error) {
                console.error("Failed to load profile", error);
                if (isOwnProfile && currentUser) {
                    if (isMounted) setProfileUser(currentUser);
                } else {
                    toast.error("Không thể tải thông tin người dùng");
                }
            } finally {
                if (isMounted) setIsLoadingUser(false);
            }
        };

        loadUserInfo();
        return () => { isMounted = false; };
    }, [targetUserId, isOwnProfile, currentUser]);

    // Load Posts depending on Active Tab
    useEffect(() => {
        if (!targetUserId || targetUserId === "undefined") return;

        let isMounted = true;
        const loadTabContent = async () => {
            setIsLoadingPosts(true);
            try {
                if (activeTab === 'saved') {
                    if (isOwnProfile) {
                        await fetchSavedPosts();
                    }
                } else {
                    await fetchUserPosts(targetUserId, activeTab);
                }
            } catch (err) {
                console.error("Error loading tab content:", err);
            } finally {
                if (isMounted) setIsLoadingPosts(false);
            }
        };

        loadTabContent();
        return () => { isMounted = false; };
    }, [targetUserId, activeTab, isOwnProfile, fetchUserPosts, fetchSavedPosts]);

    // Reset scroll when switching profile user
    useEffect(() => {
        if (feedLayoutRef.current) {
            feedLayoutRef.current.scrollTo({ top: 0 });
        }
    }, [targetUserId]);



    // Handle Direct Message
    const handleMessageUser = async () => {
        const u = profileUser;
        if (!u || !u._id) return;

        try {
            const convo = await useChatStore.getState().getOrCreateConversation(u._id);
            if (convo?._id) {
                useChatStore.getState().setActiveConversationId(convo._id);
                navigate(`/chat?id=${convo._id}`);
            }
        } catch (error) {
            console.error("Failed to open chat:", error);
            toast.error("Không thể mở cuộc trò chuyện");
        }
    };

    // Handle Add Friend
    const handleAddFriend = async () => {
        if (!targetUserId) return;
        try {
            await sendRequestAction(targetUserId);
            toast.success("Đã gửi lời mời kết bạn!");
        } catch (error) {
            toast.error(error.response?.data?.message || "Không thể gửi lời mời kết bạn");
        }
    };

    // Format Joined Date
    const joinedDateText = useMemo(() => {
        const u = profileUser || currentUser;
        if (!u?.createdAt) return '';
        const d = new Date(u.createdAt);
        return `Đã tham gia tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
    }, [profileUser?.createdAt, currentUser?.createdAt]);

    // Format Birthday respecting privacy settings
    const birthdayText = useMemo(() => {
        const u = profileUser || (isOwnProfile ? currentUser : null);
        if (!u?.birthday) return null;
        const priv = u.privacy || {};
        const vis = priv.birthdayVisibility || 'full';
        if (vis === 'private' && !isOwnProfile) return null;
        if (vis === 'friends' && !isFriend && !isOwnProfile) return null;

        try {
            const d = new Date(u.birthday);
            if (isNaN(d.getTime())) return null;
            if (vis === 'day_month') {
                return `Sinh ngày ${d.getDate()} tháng ${d.getMonth() + 1}`;
            }
            return `Sinh ngày ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        } catch {
            return null;
        }
    }, [profileUser, currentUser, isOwnProfile, isFriend]);

    // Determine current posts to display
    const currentDisplayPosts = useMemo(() => {
        if (activeTab === 'saved') {
            return (savedPosts || []).filter(p => p && p._id);
        }
        return (userPosts || []).filter(p => p && p._id);
    }, [activeTab, savedPosts, userPosts]);

    const activeUser = profileUser || (isOwnProfile ? currentUser : null);

    if (isLoadingUser && !activeUser) {
        return (
            <div className={cx('feed-page-layout')}>
                <main className={cx('main-timeline-col')} style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <LoadingSpin size={34} />
                </main>
                <aside className={cx('feed-widgets-col')}>
                    <div className={cx('widgets-sticky-wrapper')}>
                        <TrendsWidget />
                        <WhoToFollowWidget />
                    </div>
                </aside>
            </div>
        );
    }

    if (!activeUser) {
        return (
            <div className={cx('feed-page-layout')}>
                <main className={cx('main-timeline-col')} style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <h3 style={{ fontSize: '1.8rem', color: '#e7e9ea', marginBottom: '8px' }}>
                        Người dùng không tồn tại
                    </h3>
                    <p style={{ fontSize: '1.4rem', color: '#71767b', marginBottom: '20px' }}>
                        Hồ sơ này có thể đã bị xóa hoặc đường dẫn không chính xác.
                    </p>
                    <button
                        onClick={() => navigate('/feed')}
                        style={{
                            background: '#f97316',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '9999px',
                            padding: '10px 24px',
                            fontWeight: 700,
                            fontSize: '1.4rem',
                            cursor: 'pointer',
                        }}
                    >
                        Quay lại Bảng tin
                    </button>
                </main>
                <aside className={cx('feed-widgets-col')}>
                    <div className={cx('widgets-sticky-wrapper')}>
                        <TrendsWidget />
                        <WhoToFollowWidget />
                    </div>
                </aside>
            </div>
        );
    }

    return (
        <div ref={feedLayoutRef} className={cx('feed-page-layout')}>
            {/* Center Main Column: Profile Timeline */}
            <main className={cx('main-timeline-col')}>
                {/* 1. Sticky Top Bar */}
                <header className={cx('profile-top-bar')}>
                    <button 
                        type="button"
                        className={cx('back-btn')}
                        onClick={() => navigate(-1)}
                        title="Quay lại"
                        aria-label="Quay lại"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className={cx('top-bar-user-info')}>
                        <span className={cx('top-bar-name')}>{activeUser.displayName}</span>
                        <span className={cx('top-bar-count')}>
                            {userPosts?.length || 0} bài viết
                        </span>
                    </div>
                </header>

                {/* 2. Cover Banner */}
                <div className={cx('profile-banner-container')}>
                    <div className={cx('banner-glow-effect')} />
                    <div className={cx('banner-accent-line')} />
                </div>

                {/* 3. Avatar & Profile Actions */}
                <div className={cx('profile-meta-section')}>
                    <div className={cx('avatar-action-row')}>
                        <div className={cx('avatar-wrapper')}>
                            <img
                                src={activeUser.avatarURL || default_avt}
                                alt={activeUser.displayName}
                                className={cx('profile-avatar-img')}
                                onError={(e) => { e.currentTarget.src = default_avt; }}
                            />
                        </div>

                        <div className={cx('profile-actions')}>
                            {isOwnProfile ? (
                                <button
                                    type="button"
                                    className={cx('edit-profile-btn')}
                                    onClick={() => navigate('/setting')}
                                >
                                    Chỉnh sửa hồ sơ
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={cx('message-btn')}
                                        onClick={handleMessageUser}
                                    >
                                        <MessageSquare size={16} />
                                        <span>Nhắn tin</span>
                                    </button>

                                    {isFriend ? (
                                        <div className={cx('friend-btn')}>
                                            <UserCheck size={16} />
                                            <span>Bạn bè</span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className={cx('friend-btn', 'primary')}
                                            onClick={handleAddFriend}
                                        >
                                            <UserPlus size={16} />
                                            <span>Kết bạn</span>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* 4. User Information */}
                    <div className={cx('profile-info-block')}>
                        <div className={cx('profile-name-row')}>
                            <h1 className={cx('profile-display-name')}>{activeUser.displayName}</h1>
                            <span className={cx('profile-username')}>@{activeUser.username || 'user'}</span>
                        </div>

                        {activeUser.bio && (isOwnProfile || activeUser.privacy?.showBio !== false) && (
                            <p className={cx('profile-bio')}>{activeUser.bio}</p>
                        )}

                        <div className={cx('profile-details-grid')}>
                            {activeUser.workplace && (isOwnProfile || activeUser.privacy?.showWorkplace !== false) && (
                                <div className={cx('detail-item')}>
                                    <Briefcase size={15} className={cx('detail-icon')} />
                                    <span>{activeUser.workplace}</span>
                                </div>
                            )}

                            {activeUser.school && (isOwnProfile || activeUser.privacy?.showSchool !== false) && (
                                <div className={cx('detail-item')}>
                                    <GraduationCap size={15} className={cx('detail-icon')} />
                                    <span>{activeUser.school}</span>
                                </div>
                            )}

                            {activeUser.major && (isOwnProfile || activeUser.privacy?.showSchool !== false) && (
                                <div className={cx('detail-item')}>
                                    <BookOpen size={15} className={cx('detail-icon')} />
                                    <span>{activeUser.major}</span>
                                </div>
                            )}

                            {activeUser.location && (isOwnProfile || activeUser.privacy?.showLocation !== false) && (
                                <div className={cx('detail-item')}>
                                    <MapPin size={15} className={cx('detail-icon')} />
                                    <span>
                                        {typeof activeUser.location === 'object' 
                                            ? [activeUser.location.province || activeUser.location.city, activeUser.location.country].filter(Boolean).join(', ')
                                            : activeUser.location}
                                    </span>
                                </div>
                            )}

                            {birthdayText && (
                                <div className={cx('detail-item')}>
                                    <Cake size={15} className={cx('detail-icon')} />
                                    <span>{birthdayText}</span>
                                </div>
                            )}

                            {joinedDateText && (
                                <div className={cx('detail-item')}>
                                    <Calendar size={15} className={cx('detail-icon')} />
                                    <span>{joinedDateText}</span>
                                </div>
                            )}
                        </div>

                        <div className={cx('profile-counts-row')}>
                            <button
                                type="button"
                                className={cx('count-item-btn')}
                                onClick={() => navigate('/feed/friends')}
                                title="Xem danh sách bạn bè"
                            >
                                <strong>{friends?.length || 0}</strong>
                                <span>Bạn bè</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 5. Tabs Bar */}
                <div className={cx('profile-tabs-bar')}>
                    {/* Tab: Bài viết */}
                    <button
                        type="button"
                        className={cx('profile-tab-item', { active: activeTab === 'posts' })}
                        onClick={() => setActiveTab('posts')}
                    >
                        <div className={cx('tab-label-wrap')}>
                            <span>Bài viết</span>
                        </div>
                        {activeTab === 'posts' && (
                            <Motion.div 
                                className={cx('active-tab-indicator')} 
                                layoutId="profileActiveTabIndicator" 
                            />
                        )}
                    </button>

                    {/* Tab: Đăng lại (Reposts) */}
                    <button
                        type="button"
                        className={cx('profile-tab-item', { active: activeTab === 'reposts' })}
                        onClick={() => setActiveTab('reposts')}
                    >
                        <div className={cx('tab-label-wrap')}>
                            <span>Đăng lại</span>
                        </div>
                        {activeTab === 'reposts' && (
                            <Motion.div 
                                className={cx('active-tab-indicator')} 
                                layoutId="profileActiveTabIndicator" 
                            />
                        )}
                    </button>

                    {/* Tab: Video */}
                    <button
                        type="button"
                        className={cx('profile-tab-item', { active: activeTab === 'videos' })}
                        onClick={() => setActiveTab('videos')}
                    >
                        <div className={cx('tab-label-wrap')}>
                            <span>Video</span>
                        </div>
                        {activeTab === 'videos' && (
                            <Motion.div 
                                className={cx('active-tab-indicator')} 
                                layoutId="profileActiveTabIndicator" 
                            />
                        )}
                    </button>

                    {/* Tab: Đã lưu (Saved) - CHỈ BẢN THÂN MỚI XEM ĐƯỢC */}
                    {isOwnProfile && (
                        <button
                            type="button"
                            className={cx('profile-tab-item', { active: activeTab === 'saved' })}
                            onClick={() => setActiveTab('saved')}
                            title="Chỉ có bạn mới nhìn thấy mục này"
                        >
                            <div className={cx('tab-label-wrap')}>
                                <Lock size={13} className={cx('lock-badge')} />
                                <span>Đã lưu</span>
                            </div>
                            {activeTab === 'saved' && (
                                <Motion.div 
                                    className={cx('active-tab-indicator')} 
                                    layoutId="profileActiveTabIndicator" 
                                />
                            )}
                        </button>
                    )}
                </div>

                {/* 6. Posts Stream Content */}
                <div className={cx('posts-stream')}>
                    {isLoadingPosts ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '260px' }}>
                            <LoadingSpin size={30} />
                        </div>
                    ) : currentDisplayPosts.length === 0 ? (
                        <div className={cx('profile-empty-state')}>
                            <div className={cx('empty-icon-wrap')}>
                                {activeTab === 'posts' && <FileText size={26} />}
                                {activeTab === 'reposts' && <Repeat size={26} />}
                                {activeTab === 'videos' && <Video size={26} />}
                                {activeTab === 'saved' && <Bookmark size={26} />}
                            </div>
                            <h4 className={cx('empty-title')}>
                                {activeTab === 'posts' && "Chưa có bài viết nào"}
                                {activeTab === 'reposts' && "Chưa có bài đăng lại nào"}
                                {activeTab === 'videos' && "Chưa có video nào"}
                                {activeTab === 'saved' && "Chưa có bài viết đã lưu"}
                            </h4>
                            <p className={cx('empty-desc')}>
                                {activeTab === 'posts' && (
                                    isOwnProfile 
                                        ? "Khi bạn đăng tải bài viết mới, chúng sẽ xuất hiện tại đây."
                                        : "Người dùng này chưa chia sẻ bài viết nào."
                                )}
                                {activeTab === 'reposts' && (
                                    isOwnProfile
                                        ? "Các bài viết bạn chia sẻ lại (Repost) sẽ xuất hiện tại đây."
                                        : "Người dùng chưa chia sẻ lại bài viết nào."
                                )}
                                {activeTab === 'videos' && (
                                    isOwnProfile
                                        ? "Tất cả các video bạn tải lên sẽ hiển thị tại mục này."
                                        : "Người dùng này chưa đăng video nào."
                                )}
                                {activeTab === 'saved' && (
                                    "Chỉ có bạn mới nhìn thấy bài viết đã lưu. Hãy bookmark những bài viết hay để xem lại bất cứ lúc nào."
                                )}
                            </p>
                        </div>
                    ) : (
                        currentDisplayPosts.map((post, idx) => (
                            <PostItem
                                key={post?._id || idx}
                                post={post}
                                currentUser={currentUser}
                                onLike={likePost}
                                onComment={addComment}
                                onDelete={deletePost}
                            />
                        ))
                    )}
                </div>
            </main>

            {/* Right Column: Widgets Sidebar */}
            <aside className={cx('feed-widgets-col')}>
                <div className={cx('widgets-sticky-wrapper')}>
                    <TrendsWidget />
                    <WhoToFollowWidget />
                </div>
            </aside>
        </div>
    );
};

export default ProfileContainer;
