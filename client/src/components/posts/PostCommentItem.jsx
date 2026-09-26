import React, { useState, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { usePostStore } from '../../stores/usePostStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import default_avt from "../../../public/favicon.png";
import formatHashtags from '../../utils/hashtagFormatter';

const cx = classNames.bind(styles);
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const PostCommentItem = ({ comment, postId }) => {
    const { reactToComment, replyComment, reactToReply } = usePostStore();
    const { user: currentUser } = useAuthStore();
    const navigate = useNavigate();

    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [showReplies, setShowReplies] = useState(true);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // Group replies into Level 2 and Level 3 hierarchy
    const { level2Replies, level3Map } = useMemo(() => {
        const l2 = [];
        const l3Map = {};

        const replies = comment.replies || [];
        replies.forEach((r) => {
            if (r.level === 3 || r.replyToReplyId) {
                const parentId = String(r.replyToReplyId || 'orphan');
                if (!l3Map[parentId]) l3Map[parentId] = [];
                l3Map[parentId].push(r);
            } else {
                l2.push(r);
            }
        });

        // If any replies couldn't find parent, attach to first l2 or create dummy l2
        if (l3Map['orphan'] && l2.length > 0) {
            const firstId = String(l2[0]._id);
            if (!l3Map[firstId]) l3Map[firstId] = [];
            l3Map[firstId].push(...l3Map['orphan']);
            delete l3Map['orphan'];
        }

        return { level2Replies: l2, level3Map: l3Map };
    }, [comment.replies]);

    // Helper to get user reaction if any
    const userReaction = comment.reactions?.find(r => r.userId === currentUser?._id);

    // Group reactions for display
    const reactionCounts = comment.reactions?.reduce((acc, curr) => {
        acc[curr.reaction] = (acc[curr.reaction] || 0) + 1;
        return acc;
    }, {});

    const handleReact = (emoji) => {
        reactToComment(postId, comment._id, emoji);
        setShowEmojiPicker(false);
    };

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        const trimmed = replyText.trim();
        if (!trimmed) return;
        await replyComment(postId, comment._id, trimmed);
        setReplyText("");
        setIsReplying(false);
        setShowReplies(true);
    };

    const handleHashtagClick = (tag) => {
        navigate(`/feed/search?q=${encodeURIComponent('#' + tag)}`);
    };

    const totalReplies = comment.replies?.length || 0;

    return (
        <div className={cx('comment-item-wrapper')}>
            {/* Level 1: Root Comment */}
            <div className={cx('comment')}>
                <img
                    src={comment.postedBy?.avatarURL ? (comment.postedBy.avatarURL.startsWith('http') ? comment.postedBy.avatarURL : `http://localhost:5001${comment.postedBy.avatarURL}`) : default_avt}
                    alt="avt"
                    className={cx('comment-avatar')}
                    onClick={() => comment.postedBy?._id && navigate(`/feed/profile/${comment.postedBy._id}`)}
                    style={{ cursor: 'pointer' }}
                    onError={(e) => { e.currentTarget.src = default_avt; }}
                />
                <div className={cx('comment-content-wrapper')}>
                    <div className={cx('comment-bubble')}>
                        <strong 
                            onClick={() => comment.postedBy?._id && navigate(`/feed/profile/${comment.postedBy._id}`)}
                            style={{ cursor: 'pointer' }}
                        >
                            {comment.postedBy?.displayName || comment.postedBy?.username || 'Người dùng'}
                        </strong>
                        <span style={{ marginLeft: '5px' }}>
                            {formatHashtags(comment.text, handleHashtagClick)}
                        </span>
                    </div>

                    <div className={cx('comment-actions')}>
                        <span className={cx('comment-time')}>
                            {comment.created ? new Date(comment.created).toLocaleDateString('vi-VN') : ''}
                        </span>

                        <div className={cx('reaction-wrapper')} onMouseLeave={() => setShowEmojiPicker(false)}>
                            <button
                                type="button"
                                className={cx('action-text', { active: !!userReaction })}
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                onMouseEnter={() => setShowEmojiPicker(true)}
                            >
                                {userReaction ? userReaction.reaction : "Thích"}
                            </button>

                            {showEmojiPicker && (
                                <div className={cx('mini-emoji-picker')} onMouseLeave={() => setShowEmojiPicker(false)}>
                                    {EMOJIS.map(emoji => (
                                        <span key={emoji} onClick={() => handleReact(emoji)}>{emoji}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Reply button for Level 1 */}
                        <button 
                            type="button" 
                            className={cx('action-text')} 
                            onClick={() => setIsReplying(!isReplying)}
                        >
                            Trả lời
                        </button>

                        {/* Display Reactions Count */}
                        {reactionCounts && Object.keys(reactionCounts).length > 0 && (
                            <div className={cx('reactions-count')}>
                                {Object.entries(reactionCounts).map(([emoji, count]) => (
                                    <span key={emoji}>{emoji}{count > 1 ? count : ''}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Level 1 Reply input */}
            {isReplying && (
                <form onSubmit={handleReplySubmit} className={cx('reply-input-form')}>
                    <input
                        type="text"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder={`Trả lời ${comment.postedBy?.displayName || 'bình luận'}...`}
                        autoFocus
                    />
                </form>
            )}

            {/* View/Hide Nested Replies Toggle */}
            {totalReplies > 0 && (
                <div className={cx('replies-container')}>
                    {!showReplies ? (
                        <button 
                            type="button" 
                            className={cx('view-replies-btn')} 
                            onClick={() => setShowReplies(true)}
                        >
                            ── Xem {totalReplies} câu trả lời
                        </button>
                    ) : (
                        <div className={cx('replies-list')}>
                            {level2Replies.map((l2Reply) => (
                                <Level2ReplyItem
                                    key={l2Reply._id}
                                    reply={l2Reply}
                                    childReplies={level3Map[String(l2Reply._id)] || []}
                                    postId={postId}
                                    commentId={comment._id}
                                    currentUser={currentUser}
                                    reactToReply={reactToReply}
                                    replyComment={replyComment}
                                    onHashtagClick={handleHashtagClick}
                                />
                            ))}
                            {totalReplies > 3 && (
                                <button 
                                    type="button" 
                                    className={cx('hide-replies-btn')} 
                                    onClick={() => setShowReplies(false)}
                                >
                                    Ẩn bớt câu trả lời
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Level 2 Reply Component (Has "Trả lời" button to create Level 3)
const Level2ReplyItem = ({ 
    reply, 
    childReplies = [], 
    postId, 
    commentId, 
    currentUser, 
    reactToReply, 
    replyComment,
    onHashtagClick 
}) => {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const navigate = useNavigate();

    const userReaction = reply.reactions?.find(r => r.userId === currentUser?._id);
    const reactionCounts = reply.reactions?.reduce((acc, curr) => {
        acc[curr.reaction] = (acc[curr.reaction] || 0) + 1;
        return acc;
    }, {});

    const handleReact = (emoji) => {
        reactToReply(postId, commentId, reply._id, emoji);
        setShowEmojiPicker(false);
    };

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        const trimmed = replyText.trim();
        if (!trimmed) return;
        // Level 3 reply specifies replyToReplyId and replyToUserId
        await replyComment(postId, commentId, trimmed, reply._id, reply.postedBy?._id);
        setReplyText("");
        setIsReplying(false);
    };

    const authorName = reply.postedBy?.displayName || reply.postedBy?.username || 'Người dùng';

    return (
        <div className={cx('level-2-wrapper')}>
            <div className={cx('comment', 'reply')}>
                <img
                    src={reply.postedBy?.avatarURL ? (reply.postedBy.avatarURL.startsWith('http') ? reply.postedBy.avatarURL : `http://localhost:5001${reply.postedBy.avatarURL}`) : default_avt}
                    alt="avt"
                    className={cx('comment-avatar', 'small')}
                    onClick={() => reply.postedBy?._id && navigate(`/feed/profile/${reply.postedBy._id}`)}
                    style={{ cursor: 'pointer' }}
                    onError={(e) => { e.currentTarget.src = default_avt; }}
                />
                <div className={cx('comment-content-wrapper')}>
                    <div className={cx('comment-bubble')}>
                        <strong 
                            onClick={() => reply.postedBy?._id && navigate(`/feed/profile/${reply.postedBy._id}`)}
                            style={{ cursor: 'pointer' }}
                        >
                            {authorName}
                        </strong>
                        <span style={{ marginLeft: '5px' }}>
                            {formatHashtags(reply.text, onHashtagClick)}
                        </span>
                    </div>

                    <div className={cx('comment-actions')}>
                        <span className={cx('comment-time')}>
                            {reply.created ? new Date(reply.created).toLocaleDateString('vi-VN') : ''}
                        </span>

                        <div className={cx('reaction-wrapper')} onMouseLeave={() => setShowEmojiPicker(false)}>
                            <button
                                type="button"
                                className={cx('action-text', { active: !!userReaction })}
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                onMouseEnter={() => setShowEmojiPicker(true)}
                            >
                                {userReaction ? userReaction.reaction : "Thích"}
                            </button>
                            {showEmojiPicker && (
                                <div className={cx('mini-emoji-picker')} onMouseLeave={() => setShowEmojiPicker(false)}>
                                    {EMOJIS.map(emoji => (
                                        <span key={emoji} onClick={() => handleReact(emoji)}>{emoji}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Reply button for Level 2 (leads to Level 3) */}
                        <button 
                            type="button" 
                            className={cx('action-text')} 
                            onClick={() => setIsReplying(!isReplying)}
                        >
                            Trả lời
                        </button>

                        {reactionCounts && Object.keys(reactionCounts).length > 0 && (
                            <div className={cx('reactions-count')}>
                                {Object.entries(reactionCounts).map(([emoji, count]) => (
                                    <span key={emoji}>{emoji}{count > 1 ? count : ''}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Reply Input for Level 2 */}
            {isReplying && (
                <form onSubmit={handleReplySubmit} className={cx('reply-input-form')}>
                    <input
                        type="text"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder={`Trả lời @${authorName}...`}
                        autoFocus
                    />
                </form>
            )}

            {/* Level 3 Children List (Max level: no further reply button inside level 3) */}
            {childReplies.length > 0 && (
                <div className={cx('level-3-list')}>
                    {childReplies.map((l3Reply) => (
                        <Level3ReplyItem
                            key={l3Reply._id}
                            reply={l3Reply}
                            postId={postId}
                            commentId={commentId}
                            currentUser={currentUser}
                            reactToReply={reactToReply}
                            onHashtagClick={onHashtagClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Level 3 Reply Component (Deepest level - displays @tag, reactions, NO reply button)
const Level3ReplyItem = ({ 
    reply, 
    postId, 
    commentId, 
    currentUser, 
    reactToReply, 
    onHashtagClick 
}) => {
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const navigate = useNavigate();

    const userReaction = reply.reactions?.find(r => r.userId === currentUser?._id);
    const reactionCounts = reply.reactions?.reduce((acc, curr) => {
        acc[curr.reaction] = (acc[curr.reaction] || 0) + 1;
        return acc;
    }, {});

    const handleReact = (emoji) => {
        reactToReply(postId, commentId, reply._id, emoji);
        setShowEmojiPicker(false);
    };

    const replyToName = reply.replyToUser?.displayName || reply.replyToUser?.username;
    const authorName = reply.postedBy?.displayName || reply.postedBy?.username || 'Người dùng';

    return (
        <div className={cx('level-3-wrapper')}>
            <div className={cx('comment', 'reply')}>
                <img
                    src={reply.postedBy?.avatarURL ? (reply.postedBy.avatarURL.startsWith('http') ? reply.postedBy.avatarURL : `http://localhost:5001${reply.postedBy.avatarURL}`) : default_avt}
                    alt="avt"
                    className={cx('comment-avatar', 'level-3-avt')}
                    onClick={() => reply.postedBy?._id && navigate(`/feed/profile/${reply.postedBy._id}`)}
                    style={{ cursor: 'pointer' }}
                    onError={(e) => { e.currentTarget.src = default_avt; }}
                />
                <div className={cx('comment-content-wrapper')}>
                    <div className={cx('comment-bubble')}>
                        <strong 
                            onClick={() => reply.postedBy?._id && navigate(`/feed/profile/${reply.postedBy._id}`)}
                            style={{ cursor: 'pointer' }}
                        >
                            {authorName}
                        </strong>
                        <span style={{ marginLeft: '5px' }}>
                            {replyToName && (
                                <span 
                                    className={cx('reply-mention-tag')}
                                    onClick={() => reply.replyToUser?._id && navigate(`/feed/profile/${reply.replyToUser._id}`)}
                                >
                                    @{replyToName}
                                </span>
                            )}
                            {formatHashtags(reply.text, onHashtagClick)}
                        </span>
                    </div>

                    <div className={cx('comment-actions')}>
                        <span className={cx('comment-time')}>
                            {reply.created ? new Date(reply.created).toLocaleDateString('vi-VN') : ''}
                        </span>

                        <div className={cx('reaction-wrapper')} onMouseLeave={() => setShowEmojiPicker(false)}>
                            <button
                                type="button"
                                className={cx('action-text', { active: !!userReaction })}
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                onMouseEnter={() => setShowEmojiPicker(true)}
                            >
                                {userReaction ? userReaction.reaction : "Thích"}
                            </button>
                            {showEmojiPicker && (
                                <div className={cx('mini-emoji-picker')} onMouseLeave={() => setShowEmojiPicker(false)}>
                                    {EMOJIS.map(emoji => (
                                        <span key={emoji} onClick={() => handleReact(emoji)}>{emoji}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Level 3 intentionally has NO Reply button (max 3 levels) */}

                        {reactionCounts && Object.keys(reactionCounts).length > 0 && (
                            <div className={cx('reactions-count')}>
                                {Object.entries(reactionCounts).map(([emoji, count]) => (
                                    <span key={emoji}>{emoji}{count > 1 ? count : ''}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PostCommentItem;
