import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { usePostStore } from '../stores/usePostStore';
import styles from '../assets/css/VideoFeed.module.scss';
import classNames from 'classnames/bind';
import { 
    Heart, 
    MessageCircle, 
    Share2, 
    Volume2, 
    VolumeX, 
    Send, 
    X, 
    ChevronLeft, 
    MoreHorizontal, 
    Trash2, 
    Flag, 
    Upload, 
    Play, 
    Pause, 
    Music, 
    Sparkles, 
    UserPlus, 
    UserCheck,
    Loader2
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';
import VideoUploadModal from '../components/posts/VideoUploadModal';
import { toast } from 'sonner';
import { formatHashtags } from '../utils/hashtagFormatter';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import default_avt from '../../public/favicon.png';

const cx = classNames.bind(styles);

// Single Video Item Component
const VideoItem = ({ 
    post, 
    isActive, 
    toggleLike, 
    toggleMute, 
    isMuted, 
    volume, 
    onVolumeChange, 
    onDelete,
    onOpenUpload
}) => {
    const videoRef = useRef(null);
    const progressRef = useRef(null);
    const { user: currentUser } = useAuthStore();
    const { friends = [], sendRequestAction } = useChatStore();
    const navigate = useNavigate();

    const [isPlaying, setIsPlaying] = useState(true);
    const [showPlaySplash, setShowPlaySplash] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [isFriendRequested, setIsFriendRequested] = useState(false);

    const isOwner = currentUser?._id === post.author?._id;
    const isFriend = Array.isArray(friends) && friends.some(f => f && f._id === post.author?._id);
    const isLiked = Array.isArray(post.likes) && post.likes.includes(currentUser?._id);

    // Hashtag & Mention handlers
    const handleHashtagClick = useCallback((tag) => {
        navigate(`/feed/search?q=${encodeURIComponent('#' + tag)}`);
    }, [navigate]);

    const handleMentionClick = useCallback((username) => {
        navigate(`/feed/search?q=${encodeURIComponent('@' + username)}`);
    }, [navigate]);

    // Autoplay / Pause based on viewport visibility
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isActive) {
            video.volume = isMuted ? 0 : volume;
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => setIsPlaying(true))
                    .catch((err) => {
                        console.log("Autoplay was prevented:", err);
                        setIsPlaying(false);
                    });
            }
        } else {
            video.pause();
            video.currentTime = 0;
            setIsPlaying(false);
            setProgress(0);
        }
    }, [isActive, isMuted, volume]);

    // Update progress bar
    const handleTimeUpdate = () => {
        const video = videoRef.current;
        if (!video || !video.duration) return;
        const currentProgress = (video.currentTime / video.duration) * 100;
        setProgress(currentProgress);
    };

    // Seek video on click/scrub
    const handleSeek = (e) => {
        e.stopPropagation();
        const video = videoRef.current;
        const bar = progressRef.current;
        if (!video || !bar) return;
        const rect = bar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = (clickX / rect.width) * video.duration;
        video.currentTime = newTime;
    };

    // Toggle Play/Pause on video click
    const handleVideoClick = (e) => {
        e.stopPropagation();
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
        setShowPlaySplash(true);
        setTimeout(() => setShowPlaySplash(false), 550);
    };

    const handleShare = (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}/post/${post._id}`;
        navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết vào bộ nhớ tạm");
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (window.confirm("Bạn có chắc chắn muốn xóa video này không?")) {
            await onDelete(post._id);
            toast.success("Đã xóa video thành công");
            setShowOptions(false);
        }
    };

    const handleAddFriend = async (e) => {
        e.stopPropagation();
        if (!post.author?._id || isFriendRequested) return;
        try {
            await sendRequestAction(post.author._id);
            setIsFriendRequested(true);
            toast.success("Đã gửi lời mời kết bạn");
        } catch (err) {
            toast.error(err.response?.data?.message || "Không thể gửi lời mời kết bạn");
        }
    };

    const videoSrc = post.video?.startsWith('http') 
        ? post.video 
        : `http://localhost:5001${post.video}`;

    const authorAvatar = post.author?.avatarURL?.startsWith('http')
        ? post.author.avatarURL
        : post.author?.avatarURL
            ? `http://localhost:5001${post.author.avatarURL}`
            : default_avt;

    const authorDisplayName = post.author?.displayName || post.author?.username || 'Người dùng';
    const authorHandle = post.author?.username ? `@${post.author.username}` : '';

    return (
        <div className={cx('videoItem')}>
            {/* Video Element */}
            <video
                ref={videoRef}
                className={cx('videoPlayer')}
                src={videoSrc}
                loop
                muted={isMuted}
                playsInline
                onClick={handleVideoClick}
                onTimeUpdate={handleTimeUpdate}
                preload="auto"
            />

            {/* Play/Pause Splash Indicator */}
            <AnimatePresence>
                {showPlaySplash && (
                    <Motion.div 
                        className={cx('playPauseIndicator')}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.2 }}
                        transition={{ duration: 0.25 }}
                    >
                        {isPlaying ? <Play size={36} fill="#ffffff" /> : <Pause size={36} fill="#ffffff" />}
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* Bottom Scrubber Progress Bar */}
            <div 
                ref={progressRef}
                className={cx('videoProgressBarWrapper')}
                onClick={handleSeek}
            >
                <div className={cx('videoProgressBar')}>
                    <div 
                        className={cx('videoProgressFill')} 
                        style={{ width: `${progress}%` }} 
                    />
                </div>
            </div>

            {/* Bottom Left: Author & Caption Overlay */}
            <div className={cx('videoOverlay')}>
                {/* Author row */}
                <div className={cx('authorRow')}>
                    <div 
                        className={cx('authorAvatarWrap')}
                        onClick={() => navigate(`/feed/profile/${post.author?._id}`)}
                    >
                        <img 
                            src={authorAvatar} 
                            alt={authorDisplayName} 
                            className={cx('authorAvatarImg')}
                            onError={(e) => { e.currentTarget.src = default_avt; }}
                        />
                    </div>

                    <div 
                        className={cx('authorMeta')}
                        onClick={() => navigate(`/feed/profile/${post.author?._id}`)}
                    >
                        <span className={cx('authorName')}>{authorDisplayName}</span>
                        {authorHandle && <span className={cx('authorHandle')}>{authorHandle}</span>}
                    </div>

                    {/* Follow/Add Friend Button */}
                    {!isOwner && !isFriend && (
                        <button
                            type="button"
                            className={cx('authorFollowBtn')}
                            onClick={handleAddFriend}
                            disabled={isFriendRequested}
                        >
                            {isFriendRequested ? (
                                <>
                                    <UserCheck size={14} />
                                    <span>Đã gửi</span>
                                </>
                            ) : (
                                <>
                                    <UserPlus size={14} />
                                    <span>Kết bạn</span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Caption with Tag & URL Linking */}
                {post.content && (
                    <div className={cx('captionText', { collapsed: !isCaptionExpanded })}>
                        {formatHashtags(post.content, handleHashtagClick, handleMentionClick)}
                        {post.content.length > 90 && (
                            <button 
                                type="button"
                                className={cx('moreTextBtn')}
                                onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
                            >
                                {isCaptionExpanded ? 'Ẩn bớt' : '...Xem thêm'}
                            </button>
                        )}
                    </div>
                )}

                {/* Audio track info */}
                <div className={cx('soundTrackInfo')}>
                    <Music size={14} />
                    <span>Âm thanh gốc - {authorDisplayName}</span>
                </div>
            </div>

            {/* Right Action Bar */}
            <aside className={cx('actionsBar')}>
                {/* Like */}
                <div className={cx('actionItemWrap')}>
                    <button 
                        type="button"
                        aria-label={isLiked ? "Bỏ thích" : "Thích"}
                        className={cx('actionBtn', { liked: isLiked })} 
                        onClick={(e) => { e.stopPropagation(); toggleLike(post._id); }}
                    >
                        <Heart size={24} />
                    </button>
                    <span className={cx('actionLabel')}>{post.likes?.length || 0}</span>
                </div>

                {/* Comment */}
                <div className={cx('actionItemWrap')}>
                    <button 
                        type="button"
                        aria-label="Bình luận"
                        className={cx('actionBtn')} 
                        onClick={(e) => { e.stopPropagation(); setShowComments(true); }}
                    >
                        <MessageCircle size={24} />
                    </button>
                    <span className={cx('actionLabel')}>{post.comments?.length || 0}</span>
                </div>

                {/* Share */}
                <div className={cx('actionItemWrap')}>
                    <button 
                        type="button"
                        aria-label="Chia sẻ"
                        className={cx('actionBtn')} 
                        onClick={handleShare}
                    >
                        <Share2 size={22} />
                    </button>
                    <span className={cx('actionLabel')}>Chia sẻ</span>
                </div>

                {/* Sound & Volume */}
                <div 
                    className={cx('volumeWrapper')}
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                >
                    <AnimatePresence>
                        {showVolumeSlider && (
                            <Motion.div 
                                className={cx('volumeSliderFlyout')}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                transition={{ duration: 0.15 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                    className={cx('verticalVolumeSlider')}
                                    aria-label="Âm lượng"
                                />
                            </Motion.div>
                        )}
                    </AnimatePresence>

                    <button 
                        type="button"
                        aria-label={isMuted ? "Bật âm thanh" : "Tắt âm thanh"} 
                        className={cx('actionBtn')} 
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    >
                        {isMuted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
                    </button>
                </div>

                {/* More Options */}
                <div className={cx('moreOptionsWrapper')} onClick={(e) => e.stopPropagation()}>
                    <button 
                        type="button"
                        aria-label="Tùy chọn khác"
                        className={cx('actionBtn')} 
                        onClick={() => setShowOptions(!showOptions)}
                    >
                        <MoreHorizontal size={22} />
                    </button>

                    <AnimatePresence>
                        {showOptions && (
                            <Motion.div 
                                className={cx('optionsPopup')}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.15 }}
                            >
                                {isOwner ? (
                                    <button 
                                        type="button" 
                                        className={cx('optionItem', 'deleteItem')} 
                                        onClick={handleDelete}
                                    >
                                        <Trash2 size={16} />
                                        <span>Xóa video</span>
                                    </button>
                                ) : (
                                    <button 
                                        type="button" 
                                        className={cx('optionItem')} 
                                        onClick={() => { toast.success("Đã báo cáo bài viết"); setShowOptions(false); }}
                                    >
                                        <Flag size={16} />
                                        <span>Báo cáo</span>
                                    </button>
                                )}
                            </Motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </aside>

            {/* Comments Drawer */}
            <CommentsDrawer 
                open={showComments} 
                post={post} 
                onClose={() => setShowComments(false)} 
            />
        </div>
    );
};

// Comments Drawer Component
const CommentsDrawer = ({ post, onClose, open }) => {
    const { addComment } = usePostStore();
    const { user: currentUser } = useAuthStore();
    const [text, setText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const commentsRef = useRef(null);
    const navigate = useNavigate();

    const handleHashtagClick = useCallback((tag) => {
        navigate(`/feed/search?q=${encodeURIComponent('#' + tag)}`);
    }, [navigate]);

    const handleMentionClick = useCallback((username) => {
        navigate(`/feed/search?q=${encodeURIComponent('@' + username)}`);
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await addComment(post._id, trimmed);
            setText("");
            setTimeout(() => {
                if (commentsRef.current) {
                    commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
                }
            }, 100);
        } catch (err) {
            toast.error("Không thể gửi bình luận");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!open) return null;

    const userAvatar = currentUser?.avatarURL?.startsWith('http')
        ? currentUser.avatarURL
        : currentUser?.avatarURL
            ? `http://localhost:5001${currentUser.avatarURL}`
            : default_avt;

    return (
        <AnimatePresence>
            {open && (
                <Motion.div 
                    className={cx('commentsDrawerBackdrop')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <Motion.div 
                        className={cx('commentsDrawerPanel')}
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 28, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className={cx('drawerHeader')}>
                            <span className={cx('drawerTitle')}>
                                {post.comments?.length || 0} bình luận
                            </span>
                            <button 
                                type="button" 
                                className={cx('drawerCloseBtn')} 
                                onClick={onClose} 
                                aria-label="Đóng"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Comments Body */}
                        <div className={cx('drawerBody')} ref={commentsRef}>
                            {post.comments && post.comments.length > 0 ? (
                                post.comments.map((comment, idx) => (
                                    <VideoCommentItem
                                        key={comment._id || idx}
                                        comment={comment}
                                        postId={post._id}
                                        currentUserId={currentUser?._id}
                                        onHashtagClick={handleHashtagClick}
                                        onMentionClick={handleMentionClick}
                                    />
                                ))
                            ) : (
                                <div className={cx('noCommentsPlaceholder')}>
                                    <MessageCircle size={38} color="#71767b" />
                                    <p>Chưa có bình luận nào</p>
                                    <small>Hãy là người đầu tiên bình luận về video này!</small>
                                </div>
                            )}
                        </div>

                        {/* Input Footer */}
                        <form className={cx('drawerFooter')} onSubmit={handleSubmit}>
                            <img 
                                src={userAvatar} 
                                alt={currentUser?.displayName || 'Avatar'} 
                                className={cx('footerAvatar')}
                                onError={(e) => { e.currentTarget.src = default_avt; }}
                            />

                            <div className={cx('commentInputWrap')}>
                                <input
                                    type="text"
                                    className={cx('commentTextInput')}
                                    placeholder="Thêm bình luận... #tag hoặc @nhắc_tên"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                />
                                <button 
                                    type="submit" 
                                    className={cx('sendCommentBtn')}
                                    disabled={!text.trim() || isSubmitting}
                                    aria-label="Gửi"
                                >
                                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                                </button>
                            </div>
                        </form>
                    </Motion.div>
                </Motion.div>
            )}
        </AnimatePresence>
    );
};

// Comment Item with replies & like
const VideoCommentItem = ({ comment, postId, currentUserId, onHashtagClick, onMentionClick }) => {
    const { reactToComment, replyComment, reactToReply } = usePostStore();
    const navigate = useNavigate();

    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [showReplies, setShowReplies] = useState(false);

    const isLiked = comment.reactions?.some(r => r.userId === currentUserId && r.reaction === 'like');
    const likeCount = comment.reactions?.filter(r => r.reaction === 'like').length || 0;

    const timeAgo = comment.created
        ? formatDistanceToNow(new Date(comment.created), { addSuffix: true, locale: vi })
        : '';

    const commenterAvatar = comment.postedBy?.avatarURL?.startsWith('http')
        ? comment.postedBy.avatarURL
        : comment.postedBy?.avatarURL
            ? `http://localhost:5001${comment.postedBy.avatarURL}`
            : default_avt;

    const commenterName = comment.postedBy?.displayName || comment.postedBy?.username || 'Người dùng';

    const handleLike = () => {
        reactToComment(postId, comment._id, "like");
    };

    const handleReply = async (e) => {
        e.preventDefault();
        const trimmed = replyText.trim();
        if (!trimmed) return;
        await replyComment(postId, comment._id, trimmed);
        setReplyText("");
        setIsReplying(false);
        setShowReplies(true);
    };

    return (
        <div className={cx('commentItemWrapper')}>
            <div className={cx('commentItem')}>
                <img 
                    src={commenterAvatar} 
                    alt={commenterName} 
                    className={cx('commentAvatar')}
                    onClick={() => comment.postedBy?._id && navigate(`/feed/profile/${comment.postedBy._id}`)}
                    onError={(e) => { e.currentTarget.src = default_avt; }}
                />

                <div className={cx('commentContent')}>
                    <div className={cx('commentUserRow')}>
                        <span 
                            className={cx('commentUserName')}
                            onClick={() => comment.postedBy?._id && navigate(`/feed/profile/${comment.postedBy._id}`)}
                        >
                            {commenterName}
                        </span>
                        {timeAgo && <span className={cx('commentTime')}>{timeAgo}</span>}
                    </div>

                    <div className={cx('commentBodyText')}>
                        {formatHashtags(comment.text, onHashtagClick, onMentionClick)}
                    </div>

                    <div className={cx('commentActionsRow')}>
                        <button 
                            type="button" 
                            className={cx('actionTextBtn', { liked: isLiked })} 
                            onClick={handleLike}
                        >
                            <Heart size={13} fill={isLiked ? "#f43f5e" : "none"} />
                            <span>{likeCount > 0 ? likeCount : "Thích"}</span>
                        </button>

                        <button 
                            type="button" 
                            className={cx('actionTextBtn')} 
                            onClick={() => setIsReplying(!isReplying)}
                        >
                            Trả lời
                        </button>
                    </div>
                </div>
            </div>

            {/* Replies List */}
            {comment.replies && comment.replies.length > 0 && (
                <div className={cx('repliesSection')}>
                    {!showReplies ? (
                        <button 
                            type="button"
                            className={cx('toggleRepliesBtn')} 
                            onClick={() => setShowReplies(true)}
                        >
                            Xem {comment.replies.length} câu trả lời
                        </button>
                    ) : (
                        <div className={cx('repliesList')}>
                            {comment.replies.map((reply, ridx) => {
                                const isReplyLiked = reply.reactions?.some(r => r.userId === currentUserId && r.reaction === 'like');
                                const replyLikeCount = reply.reactions?.filter(r => r.reaction === 'like').length || 0;
                                const replyAvatar = reply.postedBy?.avatarURL?.startsWith('http')
                                    ? reply.postedBy.avatarURL
                                    : reply.postedBy?.avatarURL
                                        ? `http://localhost:5001${reply.postedBy.avatarURL}`
                                        : default_avt;
                                const replyTime = reply.created
                                    ? formatDistanceToNow(new Date(reply.created), { addSuffix: true, locale: vi })
                                    : '';

                                return (
                                    <div key={reply._id || ridx} className={cx('commentItem')}>
                                        <img 
                                            src={replyAvatar} 
                                            alt={reply.postedBy?.displayName || 'User'} 
                                            className={cx('commentAvatar')}
                                            onClick={() => reply.postedBy?._id && navigate(`/feed/profile/${reply.postedBy._id}`)}
                                            onError={(e) => { e.currentTarget.src = default_avt; }}
                                        />
                                        <div className={cx('commentContent')}>
                                            <div className={cx('commentUserRow')}>
                                                <span 
                                                    className={cx('commentUserName')}
                                                    onClick={() => reply.postedBy?._id && navigate(`/feed/profile/${reply.postedBy._id}`)}
                                                >
                                                    {reply.postedBy?.displayName || reply.postedBy?.username || 'Người dùng'}
                                                </span>
                                                {replyTime && <span className={cx('commentTime')}>{replyTime}</span>}
                                            </div>
                                            <div className={cx('commentBodyText')}>
                                                {formatHashtags(reply.text, onHashtagClick, onMentionClick)}
                                            </div>
                                            <div className={cx('commentActionsRow')}>
                                                <button 
                                                    type="button" 
                                                    className={cx('actionTextBtn', { liked: isReplyLiked })} 
                                                    onClick={() => reactToReply(postId, comment._id, reply._id, "like")}
                                                >
                                                    <Heart size={12} fill={isReplyLiked ? "#f43f5e" : "none"} />
                                                    <span>{replyLikeCount > 0 ? replyLikeCount : "Thích"}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <button 
                                type="button"
                                className={cx('toggleRepliesBtn')} 
                                onClick={() => setShowReplies(false)}
                            >
                                Ẩn câu trả lời
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Inline Reply Input */}
            {isReplying && (
                <form onSubmit={handleReply} className={cx('replyForm')}>
                    <input
                        type="text"
                        className={cx('replyInput')}
                        placeholder={`Trả lời @${comment.postedBy?.username || 'user'}...`}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        autoFocus
                    />
                    <button 
                        type="submit" 
                        className={cx('replySendBtn')}
                        disabled={!replyText.trim()}
                    >
                        Gửi
                    </button>
                </form>
            )}
        </div>
    );
};

// Main Video Feed Page
const VideoFeed = () => {
    const { videoPosts, fetchVideoFeed, likePost, deletePost, hasMoreVideos } = usePostStore();
    const { toggleSidebar } = useOutletContext() || { toggleSidebar: () => { } };
    const navigate = useNavigate();

    const [activePostId, setActivePostId] = useState(() => {
        return sessionStorage.getItem('last_active_video_id') || null;
    });

    const [isScrollRestored, setIsScrollRestored] = useState(() => {
        return !sessionStorage.getItem('last_active_video_id');
    });

    const [isMuted, setIsMuted] = useState(() => {
        const saved = localStorage.getItem('video_muted');
        return saved ? JSON.parse(saved) : false;
    });

    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('video_volume');
        return saved ? parseFloat(saved) : 0.6;
    });

    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const restoreTargetId = useRef(activePostId);
    const observer = useRef(null);
    const containerRef = useRef(null);
    const isLoadingRef = useRef(false);

    useEffect(() => {
        localStorage.setItem('video_muted', JSON.stringify(isMuted));
    }, [isMuted]);

    useEffect(() => {
        localStorage.setItem('video_volume', volume.toString());
    }, [volume]);

    const toggleMute = () => {
        setIsMuted(prev => !prev);
    };

    const handleVolumeChange = (newVol) => {
        setVolume(newVol);
        if (newVol > 0 && isMuted) setIsMuted(false);
        if (newVol === 0 && !isMuted) setIsMuted(true);
    };

    // Initial Fetch
    useEffect(() => {
        if (!videoPosts || videoPosts.length === 0) {
            fetchVideoFeed(true);
        }
    }, [fetchVideoFeed, videoPosts?.length]);

    // Restore scroll position
    useEffect(() => {
        if (!videoPosts?.length || !restoreTargetId.current) return;
        const timeout = setTimeout(() => {
            const element = Array.from(containerRef.current?.querySelectorAll('[data-id]') || [])
                .find(item => item.dataset.id === restoreTargetId.current);
            element?.scrollIntoView({ block: 'center', behavior: 'auto' });
            restoreTargetId.current = null;
            setIsScrollRestored(true);
        }, 100);
        return () => clearTimeout(timeout);
    }, [videoPosts?.length]);

    // Intersection Observer for active video detection
    useEffect(() => {
        const options = {
            root: containerRef.current,
            rootMargin: '0px',
            threshold: 0.6
        };

        const handleIntersect = (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('data-id');
                    setActivePostId(id);
                    sessionStorage.setItem('last_active_video_id', id);
                }
            });
        };

        observer.current = new IntersectionObserver(handleIntersect, options);
        const elements = containerRef.current?.querySelectorAll('[data-id]') || [];
        elements.forEach(el => observer.current.observe(el));

        return () => {
            observer.current?.disconnect();
        };
    }, [videoPosts]);

    // Infinite scroll pagination
    const handleScroll = async (e) => {
        const bottom = Math.abs(e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight) < 300;
        if (bottom && hasMoreVideos && !isLoadingRef.current) {
            isLoadingRef.current = true;
            await fetchVideoFeed(false);
            isLoadingRef.current = false;
        }
    };

    return (
        <div className={cx('feedWrapper')}>
            {/* Top Floating Controls */}
            <div className={cx('topControlsRow')}>
                <button 
                    type="button" 
                    className={cx('navBtn')} 
                    onClick={() => navigate('/feed')} 
                    aria-label="Quay lại Bảng tin"
                    title="Quay lại Bảng tin"
                >
                    <ChevronLeft size={22} />
                </button>

                <button 
                    type="button" 
                    className={cx('uploadVideoBtn')} 
                    onClick={() => setIsUploadOpen(true)}
                >
                    <Upload size={16} />
                    <span>Đăng video</span>
                </button>
            </div>

            {/* Video Feed Stream */}
            {!videoPosts || videoPosts.length === 0 ? (
                <div className={cx('emptyFeedBox')}>
                    <div className={cx('emptyIconWrap')}>
                        <Sparkles size={40} />
                    </div>
                    <h3>Chưa có video nào</h3>
                    <p>Hãy là người đầu tiên chia sẻ khoảnh khắc với cộng đồng Shrimple!</p>
                    <button 
                        type="button" 
                        className={cx('uploadVideoBtn')} 
                        onClick={() => setIsUploadOpen(true)}
                    >
                        <Upload size={16} />
                        <span>Đăng video ngay</span>
                    </button>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    className={cx('videoFeedContainer')}
                    onScroll={handleScroll}
                    style={{ opacity: isScrollRestored ? 1 : 0, transition: 'opacity 0.2s' }}
                >
                    {videoPosts.map(post => (
                        <div key={post._id} data-id={post._id} className={cx('videoItem')}>
                            <VideoItem
                                post={post}
                                isActive={isScrollRestored && activePostId === post._id}
                                toggleLike={likePost}
                                toggleMute={toggleMute}
                                isMuted={isMuted}
                                volume={volume}
                                onVolumeChange={handleVolumeChange}
                                onDelete={deletePost}
                                onOpenUpload={() => setIsUploadOpen(true)}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Modal */}
            <VideoUploadModal 
                isOpen={isUploadOpen} 
                onClose={() => setIsUploadOpen(false)} 
            />
        </div>
    );
};

export default VideoFeed;
