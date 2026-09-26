import React, { useEffect, useState, useRef, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { usePostStore } from '../../stores/usePostStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import { useNotificationStore } from '../../stores/useNotificationStore';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
    Image, 
    Video, 
    Menu, 
    Search, 
    Globe, 
    Users,
    Lock,
    ChevronDown,
    Check,
    X,
    Smile,
    Loader2,
    Bell,
    ArrowUp
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import PostItem from './PostItem';
import WhoToFollowWidget from './WhoToFollowWidget';
import TrendsWidget from './TrendsWidget';
import LoadingSpin from '../common/loading/LoadingSpin';
import NotificationDropdown from '../common/NotificationDropdown';
import { useTranslation } from 'react-i18next';
import default_avt from '../../../public/favicon.png';
import { friendService } from '../../services/friendService';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const PostsContainer = () => {
    const { t } = useTranslation();
    const { posts, fetchPosts, createPost, likePost, addComment, deletePost, isLoading, hasMorePosts } = usePostStore();
    const { user } = useAuthStore();
    const { friends } = useChatStore();
    const outletContext = useOutletContext() || {};
    const { toggleSidebar, onOpenNewChat } = outletContext;
    const navigate = useNavigate();

    // Active Tab: 'forYou' vs 'following'
    const [activeTab, setActiveTab] = useState('forYou');

    // Create Post State
    const [newPostContent, setNewPostContent] = useState('');
    const [newPostImages, setNewPostImages] = useState([]);
    const [newPostVideo, setNewPostVideo] = useState(null);
    const [newPostPrivacy, setNewPostPrivacy] = useState('public');
    const [isCreating, setIsCreating] = useState(false);

    // Search query for right sidebar
    const [searchQuery, setSearchQuery] = useState('');

    // Feed Scroll & Back-to-Top / Reload State
    const feedLayoutRef = useRef(null);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [isReloading, setIsReloading] = useState(false);

    const observer = useRef(null);
    const lastPostElementRef = React.useCallback(node => {
        if (isLoading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMorePosts) {
                fetchPosts(false);
            }
        }, {
            root: feedLayoutRef.current,
            rootMargin: '250px'
        });
        if (node) observer.current.observe(node);
    }, [isLoading, hasMorePosts, fetchPosts]);

    const handleFeedScroll = () => {
        if (!feedLayoutRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = feedLayoutRef.current;
        setShowBackToTop(scrollTop > 350);
        if (scrollHeight - (scrollTop + clientHeight) < 300 && hasMorePosts && !isLoading) {
            fetchPosts(false);
        }
    };

    const handleScrollToTopAndReload = async () => {
        setIsReloading(true);
        if (feedLayoutRef.current) {
            feedLayoutRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        try {
            await fetchPosts(true);
            toast.success("Đã làm mới các bài viết mới nhất!");
        } catch (err) {
            console.error(err);
        } finally {
            setIsReloading(false);
        }
    };

    useEffect(() => {
        fetchPosts(true);
    }, [fetchPosts]);

    const handleCreatePost = async () => {
        if ((!newPostContent.trim() && newPostImages.length === 0 && !newPostVideo) || isCreating) return;

        setIsCreating(true);
        try {
            await createPost({ 
                content: newPostContent.trim(), 
                images: newPostImages,
                video: newPostVideo,
                privacy: newPostPrivacy 
            });
            setNewPostContent('');
            setNewPostImages([]);
            setNewPostVideo(null);
            setNewPostPrivacy('public');
        } catch (error) {
            console.error("Error creating post:", error);
        } finally {
            setIsCreating(false);
        }
    };

    // Filter posts for 'following' tab
    const filteredPosts = useMemo(() => {
        if (activeTab === 'forYou') return posts;
        const friendIds = new Set((friends || []).map(f => f && f._id));
        return posts.filter(p => {
            const authorId = p.author?._id;
            return authorId === user?._id || friendIds.has(authorId);
        });
    }, [posts, activeTab, friends, user]);

    return (
        <div 
            className={cx('feed-page-layout')}
            ref={feedLayoutRef}
            onScroll={handleFeedScroll}
        >
            {/* Center Main Column: X Timeline */}
            <main className={cx('main-timeline-col')}>
                {/* 1. Sticky X Header with Tabs */}
                <header className={cx('x-feed-header')}>
                    {/* Top Bar for Mobile */}
                    <div className={cx('mobile-top-bar')}>
                        <button
                            type="button"
                            className={cx('mobile-avatar-btn')}
                            onClick={toggleSidebar}
                            aria-label="Mở menu"
                        >
                            <img 
                                src={user?.avatarURL || default_avt} 
                                alt="avatar" 
                                className={cx('mobile-avatar-img')}
                                onError={(e) => { e.currentTarget.src = default_avt; }}
                            />
                        </button>

                        <div className={cx('mobile-brand')}>
                            <img src="/logo_remove_bg.png" alt="Shrimple" className={cx('mobile-shrimple-logo')} />
                        </div>

                        <div className={cx('mobile-placeholder-spacer')} />
                    </div>

                    {/* Dual Tabs: For You / Following */}
                    <div className={cx('tabs-row')}>
                        <button
                            type="button"
                            className={cx('tab-item', { active: activeTab === 'forYou' })}
                            onClick={() => setActiveTab('forYou')}
                        >
                            <span className={cx('tab-label')}>{t('feed.forYou')}</span>
                            {activeTab === 'forYou' && (
                                <Motion.div 
                                    className={cx('active-tab-bar')} 
                                    layoutId="feedActiveTabIndicator" 
                                />
                            )}
                        </button>

                        <button
                            type="button"
                            className={cx('tab-item', { active: activeTab === 'following' })}
                            onClick={() => setActiveTab('following')}
                        >
                            <span className={cx('tab-label')}>{t('feed.following')}</span>
                            {activeTab === 'following' && (
                                <Motion.div 
                                    className={cx('active-tab-bar')} 
                                    layoutId="feedActiveTabIndicator" 
                                />
                            )}
                        </button>
                    </div>
                </header>

                {/* Floating Reload Pill (New Posts / Back to Top) */}
                <AnimatePresence>
                    {showBackToTop && (
                        <Motion.button
                            type="button"
                            className={cx('floating-reload-pill')}
                            onClick={handleScrollToTopAndReload}
                            initial={{ opacity: 0, y: -16, scale: 0.85 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -16, scale: 0.85 }}
                            transition={{ duration: 0.2 }}
                            disabled={isReloading}
                        >
                            {isReloading ? (
                                <>
                                    <Loader2 size={16} className={cx('spin-loader')} />
                                    <span>{t('feed.reloading')}</span>
                                </>
                            ) : (
                                <>
                                    <ArrowUp size={16} />
                                    <span>{t('feed.newPosts')}</span>
                                </>
                            )}
                        </Motion.button>
                    )}
                </AnimatePresence>

                {/* 2. X Tweet Composer */}
                <XPostComposer
                    user={user}
                    content={newPostContent}
                    setContent={setNewPostContent}
                    images={newPostImages}
                    setImages={setNewPostImages}
                    video={newPostVideo}
                    setVideo={setNewPostVideo}
                    privacy={newPostPrivacy}
                    setPrivacy={setNewPostPrivacy}
                    onSubmit={handleCreatePost}
                    isCreating={isCreating}
                />

                {/* 3. Posts Stream */}
                <div className={cx('posts-stream')}>
                    {filteredPosts.map((post, index) => {
                        const isLast = filteredPosts.length === index + 1;
                        return (
                            <div 
                                key={post._id || index}
                                ref={isLast ? lastPostElementRef : null}
                            >
                                <PostItem
                                    post={post}
                                    currentUser={user}
                                    onLike={likePost}
                                    onComment={addComment}
                                    onDelete={deletePost}
                                />
                            </div>
                        );
                    })}

                    {/* Loading State */}
                    {isLoading && (
                        <div className={cx('feed-loading-box')}>
                            <LoadingSpin size={30} />
                        </div>
                    )}

                    {/* Empty State */}
                    {!isLoading && filteredPosts.length === 0 && (
                        <div className={cx('empty-timeline-box')}>
                            <h3 className={cx('empty-timeline-title')}>
                                {activeTab === 'following' 
                                    ? t('feed.emptyFollowing')
                                    : t('feed.emptyForYou')}
                            </h3>
                            <p className={cx('empty-timeline-desc')}>
                                {activeTab === 'following'
                                    ? "Hãy kết nối thêm bạn bè hoặc chuyển sang tab khác để khám phá những điều mới mẻ!"
                                    : "Hãy là người đầu tiên chia sẻ suy nghĩ của bạn với cộng đồng Shrimple!"}
                            </p>
                        </div>
                    )}

                    {/* End of Feed Message */}
                    {!hasMorePosts && filteredPosts.length > 0 && (
                        <div className={cx('end-of-feed-box')}>
                            <span>Bạn đã xem hết các bài viết mới nhất!</span>
                        </div>
                    )}
                </div>
            </main>

            {/* Right Column: Widgets Sidebar (Desktop >= 1024px) */}
            <aside className={cx('feed-widgets-col')}>
                <div className={cx('widgets-sticky-wrapper')}>
                    {/* Top Row: Notifications Button (nằm bên trái) + Search Bar */}
                    <div className={cx('widgets-top-row')}>
                        <NotificationDropdown align="left" />

                        {/* Search Bar Capsule */}
                        <div className={cx('widgets-search-box')}>
                            <Search size={18} className={cx('search-icon')} />
                            <input
                                type="text"
                                placeholder={t('feed.search')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchQuery.trim()) {
                                        navigate(`/feed/search?q=${encodeURIComponent(searchQuery.trim())}`);
                                    }
                                }}
                                className={cx('search-input')}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className={cx('search-clear-btn')}
                                    onClick={() => setSearchQuery('')}
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Who To Follow Widget */}
                    <WhoToFollowWidget onOpenAddFriend={onOpenNewChat} />

                    {/* Trends Widget */}
                    <TrendsWidget />
                </div>
            </aside>
        </div>
    );
};

/* --- X Post Composer Component --- */
const XPostComposer = ({ 
    user, 
    content, 
    setContent, 
    images = [], 
    setImages, 
    video = null, 
    setVideo, 
    privacy = 'public', 
    setPrivacy, 
    onSubmit, 
    isCreating 
}) => {
    const { t } = useTranslation();
    const imageInputRef = useRef(null);
    const videoInputRef = useRef(null);
    const textareaRef = useRef(null);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [videoPreview, setVideoPreview] = useState(null);
    const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
    const privacyMenuRef = useRef(null);

    // Close privacy menu on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (privacyMenuRef.current && !privacyMenuRef.current.contains(e.target)) {
                setShowPrivacyMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Manage image previews
    useEffect(() => {
        if (!images || images.length === 0) {
            setImagePreviews([]);
            return;
        }
        const urls = images.map(file => URL.createObjectURL(file));
        setImagePreviews(urls);
        return () => urls.forEach(url => URL.revokeObjectURL(url));
    }, [images]);

    // Manage video preview
    useEffect(() => {
        if (!video) {
            setVideoPreview(null);
            return;
        }
        const url = URL.createObjectURL(video);
        setVideoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [video]);

    const privacyConfig = {
        public: { label: "Công khai", desc: "Mọi người đều có thể xem bài viết này", icon: Globe },
        friends: { label: "Bạn bè", desc: "Chỉ bạn bè mới có thể xem bài viết này", icon: Users },
        private: { label: "Chỉ mình tôi", desc: "Chỉ bạn mới có thể xem bài viết này", icon: Lock },
    };

    const CurrentIcon = privacyConfig[privacy]?.icon || Globe;

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
            setImages(prev => [...(prev || []), ...imageFiles].slice(0, 4));
        }

        const videoFile = files.find(f => f.type.startsWith('video/'));
        if (videoFile && !video) {
            setVideo(videoFile);
        }

        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const handleVideoChange = (e) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('video/')) {
            setVideo(file);
        }
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    const handleRemoveImage = (idx) => {
        setImages(prev => prev.filter((_, i) => i !== idx));
    };

    const handleRemoveVideo = () => {
        setVideo(null);
    };

    // Auto-adjust textarea height
    const handleTextChange = (e) => {
        setContent(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.max(60, textareaRef.current.scrollHeight)}px`;
        }
    };

    const canPost = (content.trim().length > 0 || images.length > 0 || video) && !isCreating;

    return (
        <div className={cx('x-composer-box')}>
            <div className={cx('composer-left')}>
                <img
                    src={user?.avatarURL || default_avt}
                    alt="avatar"
                    className={cx('composer-avatar')}
                    onError={(e) => { e.currentTarget.src = default_avt; }}
                />
            </div>

            <div className={cx('composer-right')}>
                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    data-composer-input="true"
                    placeholder={t('feed.whatHappening')}
                    value={content}
                    onChange={handleTextChange}
                    rows={2}
                    className={cx('composer-textarea')}
                    disabled={isCreating}
                />

                {/* Multiple Images Preview Grid */}
                {imagePreviews.length > 0 && (
                    <div className={cx('composer-images-grid', `grid-${Math.min(imagePreviews.length, 4)}`)}>
                        {imagePreviews.map((url, idx) => (
                            <div key={idx} className={cx('composer-img-cell')}>
                                <img src={url} alt={`Upload ${idx + 1}`} className={cx('composer-cell-img')} />
                                <button
                                    type="button"
                                    className={cx('cell-remove-btn')}
                                    onClick={() => handleRemoveImage(idx)}
                                    title="Xóa hình ảnh này"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Video Preview Box */}
                {videoPreview && (
                    <div className={cx('composer-preview-container')}>
                        <video src={videoPreview} controls className={cx('composer-preview-video')} />
                        <button
                            type="button"
                            className={cx('preview-remove-btn')}
                            onClick={handleRemoveVideo}
                            title="Xóa video"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* Audience / Privacy Pill & Popover */}
                <div className={cx('composer-audience-wrapper')} ref={privacyMenuRef}>
                    <button
                        type="button"
                        className={cx('composer-audience-pill')}
                        onClick={() => setShowPrivacyMenu(!showPrivacyMenu)}
                        title="Chọn quyền riêng tư bài viết"
                    >
                        <CurrentIcon size={14} className={cx('globe-icon')} />
                        <span>{privacyConfig[privacy]?.label || "Công khai"}</span>
                        <ChevronDown size={13} className={cx('chevron-icon')} />
                    </button>

                    <AnimatePresence>
                        {showPrivacyMenu && (
                            <Motion.div
                                className={cx('composer-privacy-menu')}
                                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                                transition={{ duration: 0.15 }}
                            >
                                <div className={cx('privacy-menu-title')}>Ai có thể xem bài viết này?</div>
                                {Object.entries(privacyConfig).map(([key, item]) => {
                                    const ItemIcon = item.icon;
                                    const isSelected = privacy === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={cx('privacy-item', { active: isSelected })}
                                            onClick={() => {
                                                if (setPrivacy) setPrivacy(key);
                                                setShowPrivacyMenu(false);
                                            }}
                                        >
                                            <div className={cx('privacy-icon-box')}>
                                                <ItemIcon size={16} />
                                            </div>
                                            <div className={cx('privacy-info')}>
                                                <div className={cx('privacy-label')}>{item.label}</div>
                                                <div className={cx('privacy-desc')}>{item.desc}</div>
                                            </div>
                                            {isSelected && <Check size={16} className={cx('privacy-check-icon')} />}
                                        </button>
                                    );
                                })}
                            </Motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className={cx('composer-divider')} />

                {/* Bottom Action Bar */}
                <div className={cx('composer-toolbar')}>
                    <div className={cx('toolbar-icons')}>
                        <button
                            type="button"
                            className={cx('toolbar-btn', { active: images.length > 0 })}
                            onClick={() => imageInputRef.current?.click()}
                            title="Thêm ảnh (tối đa 4 ảnh)"
                            disabled={isCreating || images.length >= 4}
                        >
                            <Image size={19} />
                        </button>

                        <button
                            type="button"
                            className={cx('toolbar-btn', { active: !!video })}
                            onClick={() => videoInputRef.current?.click()}
                            title="Thêm video"
                            disabled={isCreating || !!video}
                        >
                            <Video size={19} />
                        </button>

                        <input
                            type="file"
                            ref={imageInputRef}
                            onChange={handleImageChange}
                            accept="image/*,video/*"
                            multiple
                            style={{ display: 'none' }}
                        />

                        <input
                            type="file"
                            ref={videoInputRef}
                            onChange={handleVideoChange}
                            accept="video/*"
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div className={cx('composer-submit-col')}>
                        <Motion.button
                            whileHover={canPost ? { scale: 1.03 } : undefined}
                            whileTap={canPost ? { scale: 0.97 } : undefined}
                            type="button"
                            className={cx('x-post-submit-btn', { disabled: !canPost })}
                            onClick={onSubmit}
                            disabled={!canPost}
                        >
                            {isCreating ? (
                                <Loader2 size={16} className={cx('btn-spinner')} />
                            ) : (
                                <span>{t('feed.post')}</span>
                            )}
                        </Motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PostsContainer;
