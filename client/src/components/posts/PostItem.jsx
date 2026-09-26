import React, { useState, useEffect, useRef, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { usePostStore } from '../../stores/usePostStore';
import { 
    Heart, 
    MessageCircle, 
    Trash2, 
    MoreHorizontal, 
    Bookmark, 
    EyeOff, 
    Flag, 
    Link as LinkIcon, 
    Repeat, 
    Share, 
    Send, 
    Smile, 
    Globe, 
    Users, 
    Lock, 
    Check, 
    X, 
    Pencil, 
    Volume2, 
    VolumeX 
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import default_avt from "../../../public/favicon.png";
import MediaLightboxModal from './MediaLightboxModal';
import PostCommentItem from './PostCommentItem';
import formatHashtags from '../../utils/hashtagFormatter';

const cx = classNames.bind(styles);

// Format relative time like Twitter/X
function formatXTime(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'vừa xong';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}p`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}g`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}ng`;

    return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
}

const PostItem = ({ post, currentUser, onLike, onComment, onDelete, defaultShowComments = false }) => {
    const { toggleSavePost, repostPost, updatePostPrivacy, editPost } = usePostStore();
    const [commentText, setCommentText] = useState('');
    const [showComments, setShowComments] = useState(defaultShowComments);
    const [showOptions, setShowOptions] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Edit Post state
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(post.content || '');
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Feed Video Sound state (default muted)
    const [isVideoMuted, setIsVideoMuted] = useState(true);

    const optionsRef = useRef(null);
    const navigate = useNavigate();

    // Extract images list (support both multiple images and legacy single image)
    const postImages = useMemo(() => {
        if (Array.isArray(post.images) && post.images.length > 0) {
            return post.images.filter(Boolean);
        }
        if (post.image) {
            return [post.image];
        }
        return [];
    }, [post.images, post.image]);

    // Unified media list for fullscreen lightbox & feed grid
    const allMedia = useMemo(() => {
        const list = [];
        if (post.video) {
            list.push({ type: 'video', url: post.video });
        }
        postImages.forEach(img => {
            list.push({ type: 'image', url: img });
        });
        return list;
    }, [postImages, post.video]);

    const handleSaveEdit = async () => {
        const trimmed = editContent.trim();
        if (!trimmed || isSavingEdit) return;
        setIsSavingEdit(true);
        try {
            const res = await editPost(post._id, trimmed);
            if (res?.success) {
                setIsEditing(false);
            }
        } catch (err) {
            console.error("Error editing post:", err);
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Close options menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (optionsRef.current && !optionsRef.current.contains(event.target)) {
                setShowOptions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const isLiked = Array.isArray(post.likes) && post.likes.includes(currentUser?._id);
    const isReposted = Array.isArray(post.reposts) && post.reposts.includes(currentUser?._id);

    // Check if saved
    const isSaved = currentUser?.savedPosts?.some(
        saved => (typeof saved === 'string' ? saved : saved?._id) === post._id
    );

    const privacy = post.privacy || 'public';
    const privacyDetails = {
        public: { label: "Công khai", icon: Globe, desc: "Mọi người trên Shrimple đều có thể xem bài viết này" },
        friends: { label: "Bạn bè", icon: Users, desc: "Chỉ bạn bè của bạn mới có thể xem bài viết này" },
        private: { label: "Chỉ mình tôi", icon: Lock, desc: "Chỉ bạn mới có thể xem bài viết này" },
    };
    const CurrentPrivacyIcon = privacyDetails[privacy]?.icon || Globe;

    const handleCommentSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const trimmed = commentText.trim();
        if (!trimmed || isSubmittingComment) return;

        setIsSubmittingComment(true);
        try {
            await onComment(post._id, trimmed);
            setCommentText('');
            setShowComments(true);
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleDelete = () => {
        if (window.confirm("Bạn có chắc chắn muốn xóa bài viết này không?")) {
            onDelete(post._id);
        }
        setShowOptions(false);
    };

    const handleCopyLink = (e) => {
        if (e) e.stopPropagation();
        navigator.clipboard.writeText(`${window.location.origin}/post/${post._id}`);
        toast.success("Đã sao chép liên kết vào bộ nhớ tạm!");
        setShowOptions(false);
    };

    const handleRepost = async (e) => {
        if (e) e.stopPropagation();
        try {
            await repostPost(post._id);
        } catch (error) {
            console.error("Error reposting:", error);
        }
    };

    const handleUpdatePrivacy = async (newPrivacy) => {
        if (newPrivacy === privacy || isUpdatingPrivacy) return;
        setIsUpdatingPrivacy(true);
        try {
            await updatePostPrivacy(post._id, newPrivacy);
            setShowPrivacyModal(false);
        } catch (error) {
            console.error("Error updating privacy:", error);
        } finally {
            setIsUpdatingPrivacy(false);
        }
    };

    const handleHidePost = () => {
        toast.info("Đã ẩn bài viết. Chúng tôi sẽ hiển thị ít bài viết tương tự hơn.");
        setShowOptions(false);
    };

    const handleReportPost = () => {
        toast.info("Cảm ơn bạn đã báo cáo. Chúng tôi sẽ xem xét bài viết này.");
        setShowOptions(false);
    };

    const handleSavePost = async (e) => {
        if (e) e.stopPropagation();
        await toggleSavePost(post._id);
        setShowOptions(false);
    };

    const handleUserClick = (e, userId) => {
        if (e) e.stopPropagation();
        if (userId) {
            navigate(`/feed/profile/${userId}`);
        }
    };

    const authorDisplayName = post.author?.displayName || post.author?.username || 'Người dùng';
    const authorUsername = post.author?.username ? `@${post.author.username}` : '';
    const authorAvatar = post.author?.avatarURL ? (post.author.avatarURL.startsWith('http') ? post.author.avatarURL : `http://localhost:5001${post.author.avatarURL}`) : default_avt;
    const timeAgo = formatXTime(post.createdAt);

    return (
        <Motion.article 
            className={cx('x-post-card')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
        >
            {/* Left: Author Avatar */}
            <div className={cx('post-avatar-col')}>
                <img
                    src={authorAvatar}
                    alt={authorDisplayName}
                    onClick={(e) => handleUserClick(e, post.author?._id)}
                    className={cx('author-avatar')}
                    onError={(e) => { e.currentTarget.src = default_avt; }}
                />
            </div>

            {/* Right: Tweet Content & Actions */}
            <div className={cx('post-main-col')}>
                {/* Header Row: Name @handle · time · options */}
                <div className={cx('post-header-row')}>
                    <div 
                        className={cx('author-meta')}
                        onClick={(e) => handleUserClick(e, post.author?._id)}
                    >
                        <span className={cx('author-name')}>{authorDisplayName}</span>
                        {authorUsername && <span className={cx('author-handle')}>{authorUsername}</span>}
                        <span className={cx('dot-divider')}>·</span>
                        <span className={cx('post-time')}>{timeAgo}</span>
                        {post.isEdited && (
                            <>
                                <span className={cx('dot-divider')}>·</span>
                                <span className={cx('edited-badge')} title={`Đã chỉnh sửa 1 lần (${new Date(post.editedAt || post.updatedAt).toLocaleString('vi-VN')})`}>
                                    <Pencil size={11} style={{ marginRight: '3px' }} />
                                    Đã chỉnh sửa
                                </span>
                            </>
                        )}
                        <span className={cx('dot-divider')}>·</span>
                        <span className={cx('privacy-badge')} title={privacyDetails[privacy]?.label || "Công khai"}>
                            <CurrentPrivacyIcon size={12} />
                        </span>
                    </div>

                    <div className={cx('more-options-wrapper')} ref={optionsRef}>
                        <button 
                            type="button"
                            className={cx('more-btn')} 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowOptions(!showOptions);
                            }}
                            title="Tùy chọn khác"
                        >
                            <MoreHorizontal size={18} />
                        </button>

                        {showOptions && (
                            <div className={cx('options-menu')} onClick={(e) => e.stopPropagation()}>
                                {post.author?._id === currentUser?._id && !post.isEdited && (
                                    <button 
                                        type="button" 
                                        className={cx('menu-option')} 
                                        onClick={() => {
                                            setShowOptions(false);
                                            setIsEditing(true);
                                            setEditContent(post.content || '');
                                        }}
                                    >
                                        <Pencil size={16} />
                                        <span>Chỉnh sửa bài viết</span>
                                    </button>
                                )}

                                <button type="button" className={cx('menu-option')} onClick={handleSavePost}>
                                    <Bookmark size={16} fill={isSaved ? "#f97316" : "none"} color={isSaved ? "#f97316" : "currentColor"} />
                                    <span>{isSaved ? "Bỏ lưu bài viết" : "Lưu bài viết"}</span>
                                </button>

                                <button type="button" className={cx('menu-option')} onClick={handleCopyLink}>
                                    <LinkIcon size={16} />
                                    <span>Sao chép liên kết</span>
                                </button>

                                <button type="button" className={cx('menu-option')} onClick={handleHidePost}>
                                    <EyeOff size={16} />
                                    <span>Không quan tâm</span>
                                </button>

                                <button type="button" className={cx('menu-option')} onClick={handleReportPost}>
                                    <Flag size={16} />
                                    <span>Báo cáo bài viết</span>
                                </button>

                                {post.author?._id === currentUser?._id && (
                                    <>
                                        <button 
                                            type="button" 
                                            className={cx('menu-option')} 
                                            onClick={() => {
                                                setShowOptions(false);
                                                setShowPrivacyModal(true);
                                            }}
                                        >
                                            <CurrentPrivacyIcon size={16} />
                                            <span>Chỉnh sửa quyền riêng tư</span>
                                        </button>
                                        <div className={cx('menu-separator')}></div>
                                        <button type="button" className={cx('menu-option', 'delete-option')} onClick={handleDelete}>
                                            <Trash2 size={16} />
                                            <span>Xóa bài viết</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Text Body or Inline Edit */}
                {isEditing ? (
                    <div className={cx('edit-post-box')} onClick={(e) => e.stopPropagation()}>
                        <textarea
                            className={cx('edit-post-textarea')}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            placeholder="Chỉnh sửa nội dung bài viết..."
                            autoFocus
                        />
                        <div className={cx('edit-post-actions')}>
                            <button
                                type="button"
                                className={cx('edit-cancel-btn')}
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditContent(post.content || '');
                                }}
                                disabled={isSavingEdit}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                className={cx('edit-save-btn')}
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit || !editContent.trim()}
                            >
                                {isSavingEdit ? "Đang lưu..." : "Lưu"}
                            </button>
                        </div>
                    </div>
                ) : (
                    post.content && (
                        <div className={cx('post-content-body')}>
                            {formatHashtags(post.content, (tag) => {
                                navigate(`/feed/search?q=${encodeURIComponent('#' + tag)}`);
                            })}
                        </div>
                    )
                )}

                {/* Unified Media Attachment */}
                {allMedia.length === 1 && allMedia[0].type === 'video' ? (
                    /* Single Standalone Video: Natural dimensions, no horizontal letterbox padding */
                    <div className={cx('post-media-container')}>
                        <video
                            autoPlay
                            loop
                            muted={isVideoMuted}
                            playsInline
                            src={allMedia[0].url.startsWith('http') ? allMedia[0].url : `http://localhost:5001${allMedia[0].url}`}
                            className={cx('post-media-video')}
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMediaIndex(0);
                                setIsLightboxOpen(true);
                            }}
                        />
                        <button
                            type="button"
                            className={cx('video-audio-toggle')}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsVideoMuted(!isVideoMuted);
                            }}
                            title={isVideoMuted ? "Bật âm thanh" : "Tắt âm thanh"}
                        >
                            {isVideoMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                    </div>
                ) : allMedia.length > 0 && (
                    /* Unified Grid for 1 image or 2+ mixed media items (photos + video) */
                    <div className={cx('post-media-grid', `grid-${Math.min(allMedia.length, 4)}`)}>
                        {allMedia.slice(0, 4).map((item, idx) => {
                            const rawUrl = item.url || item;
                            const fullSrc = rawUrl.startsWith('http') ? rawUrl : `http://localhost:5001${rawUrl}`;
                            const isExtraFourth = idx === 3 && allMedia.length > 4;
                            const extraCount = allMedia.length - 4;
                            const isItemVideo = item.type === 'video' || (typeof rawUrl === 'string' && (rawUrl.endsWith('.mp4') || rawUrl.endsWith('.webm') || rawUrl.includes('video/')));

                            return (
                                <div 
                                    key={idx} 
                                    className={cx('grid-image-wrapper')}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMediaIndex(idx);
                                        setIsLightboxOpen(true);
                                    }}
                                >
                                    {isItemVideo ? (
                                        <>
                                            <video
                                                src={fullSrc}
                                                autoPlay
                                                loop
                                                muted={isVideoMuted}
                                                playsInline
                                                className={cx('grid-image-item')}
                                            />
                                            <button
                                                type="button"
                                                className={cx('grid-audio-toggle')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsVideoMuted(!isVideoMuted);
                                                }}
                                                title={isVideoMuted ? "Bật âm thanh" : "Tắt âm thanh"}
                                            >
                                                {isVideoMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                            </button>
                                        </>
                                    ) : (
                                        <img
                                            src={fullSrc}
                                            alt={`Post media ${idx + 1}`}
                                            className={cx('grid-image-item')}
                                            loading="lazy"
                                        />
                                    )}

                                    {isExtraFourth && (
                                        <div className={cx('extra-images-overlay')}>
                                            <span>+{extraCount}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* X-Style Engagement Bar (4 Signature Actions) */}
                <div className={cx('post-engagement-bar')}>
                    {/* Reply / Comment */}
                    <button 
                        type="button"
                        className={cx('engagement-btn', 'reply-btn', { active: showComments })}
                        onClick={() => setShowComments(!showComments)}
                        title="Bình luận"
                    >
                        <div className={cx('icon-glow')}>
                            <MessageCircle size={18} />
                        </div>
                        <span className={cx('metric-count')}>
                            {post.comments?.length || 0}
                        </span>
                    </button>

                    {/* Repost */}
                    <button 
                        type="button"
                        className={cx('engagement-btn', 'repost-btn', { reposted: isReposted })}
                        onClick={handleRepost}
                        title={isReposted ? "Hủy chia sẻ lại" : "Chia sẻ lại"}
                    >
                        <div className={cx('icon-glow')}>
                            <Repeat size={18} />
                        </div>
                        <span className={cx('metric-count')}>
                            {post.reposts?.length || 0}
                        </span>
                    </button>

                    {/* Like with Heart Pop Animation */}
                    <Motion.button 
                        whileTap={{ scale: 1.35 }}
                        type="button"
                        className={cx('engagement-btn', 'like-btn', { liked: isLiked })}
                        onClick={() => onLike(post._id)}
                        title={isLiked ? "Bỏ thích" : "Thích"}
                    >
                        <div className={cx('icon-glow')}>
                            <Heart 
                                size={18} 
                                fill={isLiked ? "#f91880" : "none"} 
                                stroke={isLiked ? "#f91880" : "currentColor"} 
                            />
                        </div>
                        <span className={cx('metric-count')}>
                            {post.likes?.length || 0}
                        </span>
                    </Motion.button>

                    {/* Bookmark */}
                    <button 
                        type="button"
                        className={cx('engagement-btn', 'bookmark-btn', { saved: isSaved })}
                        onClick={handleSavePost}
                        title={isSaved ? "Bỏ lưu" : "Lưu"}
                    >
                        <div className={cx('icon-glow')}>
                            <Bookmark 
                                size={18} 
                                fill={isSaved ? "#f97316" : "none"} 
                                stroke={isSaved ? "#f97316" : "currentColor"} 
                            />
                        </div>
                    </button>

                    {/* Copy Link / Share */}
                    <button 
                        type="button"
                        className={cx('engagement-btn', 'share-btn')}
                        onClick={handleCopyLink}
                        title="Chia sẻ liên kết"
                    >
                        <div className={cx('icon-glow')}>
                            <Share size={18} />
                        </div>
                    </button>
                </div>

                {/* Inline Threaded Comments Section */}
                <AnimatePresence>
                    {showComments && (
                        <Motion.div 
                            className={cx('inline-comments-section')}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Reply Input Capsule */}
                            <form onSubmit={handleCommentSubmit} className={cx('comment-compose-row')}>
                                <img 
                                    src={currentUser?.avatarURL ? (currentUser.avatarURL.startsWith('http') ? currentUser.avatarURL : `http://localhost:5001${currentUser.avatarURL}`) : default_avt} 
                                    alt="avatar" 
                                    className={cx('compose-avatar')}
                                    onError={(e) => { e.currentTarget.src = default_avt; }}
                                />
                                <div className={cx('comment-input-box')}>
                                    <input
                                        type="text"
                                        placeholder="Đăng câu trả lời của bạn..."
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        className={cx('comment-input-field')}
                                    />
                                    <button 
                                        type="submit" 
                                        className={cx('comment-send-btn', { active: commentText.trim() })}
                                        disabled={!commentText.trim() || isSubmittingComment}
                                        title="Gửi câu trả lời"
                                    >
                                        <Send size={15} />
                                    </button>
                                </div>
                            </form>

                            {/* Comments List */}
                            <div className={cx('comment-list')}>
                                {post.comments?.map((comment, index) => (
                                    <PostCommentItem key={comment._id || index} comment={comment} postId={post._id} />
                                ))}
                            </div>
                        </Motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Image/Video Fullscreen Lightbox Modal */}
            <MediaLightboxModal 
                isOpen={isLightboxOpen} 
                mediaList={allMedia} 
                initialIndex={selectedMediaIndex}
                onClose={() => setIsLightboxOpen(false)} 
            />

            {/* Privacy Edit Modal */}
            <AnimatePresence>
                {showPrivacyModal && (
                    <div 
                        className={cx('privacy-modal-overlay')} 
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowPrivacyModal(false);
                        }}
                    >
                        <Motion.div 
                            className={cx('privacy-modal-card')}
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.94 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className={cx('modal-header-row')}>
                                <h3 className={cx('modal-title')}>Chỉnh sửa quyền riêng tư</h3>
                                <button 
                                    type="button"
                                    className={cx('modal-close-btn')}
                                    onClick={() => setShowPrivacyModal(false)}
                                    title="Đóng"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <p className={cx('modal-subtitle')}>
                                Chọn ai có thể nhìn thấy bài viết này trên trang cá nhân và bảng tin Shrimple.
                            </p>

                            <div className={cx('privacy-options-list')}>
                                {Object.entries(privacyDetails).map(([key, item]) => {
                                    const OptionIcon = item.icon;
                                    const isSelected = privacy === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={cx('privacy-choice-btn', { selected: isSelected })}
                                            onClick={() => handleUpdatePrivacy(key)}
                                            disabled={isUpdatingPrivacy}
                                        >
                                            <div className={cx('choice-icon-circle')}>
                                                <OptionIcon size={18} />
                                            </div>
                                            <div className={cx('choice-info')}>
                                                <div className={cx('choice-label')}>{item.label}</div>
                                                <div className={cx('choice-desc')}>{item.desc}</div>
                                            </div>
                                            {isSelected && <Check size={18} className={cx('choice-check')} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </Motion.div>
                    </div>
                )}
            </AnimatePresence>
        </Motion.article>
    );
};

export default PostItem;
