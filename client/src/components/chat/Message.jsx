import React, { useState } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion } from 'motion/react';
import styles from '../../assets/css/Message.module.scss';
import profilePic_test from "../../../public/favicon.png";
import { X, MapPin, ExternalLink, File, Download, Pin, CornerUpRight, RotateCcw, Trash2, MoreHorizontal, PinOff, Check, CheckCheck, PhoneCall, PhoneOff, Radio, BarChart2 } from 'lucide-react';
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import { useGroupCallStore } from "../../stores/useGroupCallStore.js";
import CustomAudioPlayer from './CustomAudioPlayer.jsx';
import ForwardModal from './ForwardModal.jsx';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const Message = ({
    text,
    time,
    senderName,
    avatar = profilePic_test,
    isMe = false,
    image = null,
    messageType = 'text',
    fileUrl = null,
    isGroup = false,
    reactions = [],
    onReact,
    isRecalled = false,
    isPinned = false,
    isForwarded = false,
    messageId,
    createdAt,
    callId = null,
    callStatus = 'ended',
    callDuration = null,
    poll = null
}) => {
    const [pickerStyle, setPickerStyle] = useState({});
    const [showDropdown, setShowDropdown] = useState(false);
    const [isForwardOpen, setIsForwardOpen] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const containerRef = React.useRef(null);
    const timeoutRef = React.useRef(null);

    const { 
        recallMessageAction, 
        deleteMessageForMeAction, 
        togglePinMessageAction,
        activeReactionMessageId,
        setActiveReactionMessageId,
        activeConversationId,
        conversations,
        votePollAction,
        closePollAction
    } = useChatStore();

    const { user: currentUser } = useAuthStore();

    const { 
        activeGroupCalls, 
        isInCall, 
        currentConversationId, 
        joinGroupCall, 
        setModalOpen 
    } = useGroupCallStore();

    const currentConvo = (conversations || []).find(c => c && c._id === activeConversationId);
    const activeCall = activeConversationId ? activeGroupCalls[activeConversationId] : null;

    // A group call message is only active if the global activeCall matches this message's callId
    const isThisCallActive = Boolean(
        activeCall?.isActive && 
        (callId ? activeCall?.callId === callId : callStatus === 'active')
    );
    const isCurrentInThisCall = isInCall && currentConversationId === activeConversationId && (!callId || !activeCall?.callId || activeCall?.callId === callId);
    const participantsCount = activeCall?.participants?.length || 0;

    const handleGroupCallAction = () => {
        if (!isThisCallActive) {
            toast.info("Cuộc gọi này đã kết thúc.");
            return;
        }
        if (!activeConversationId) return;
        if (isCurrentInThisCall) {
            setModalOpen(true);
        } else {
            const groupInfo = {
                _id: currentConvo?._id,
                name: currentConvo?.name || currentConvo?.group?.name || 'Nhóm',
                avatarURL: currentConvo?.avatarURL || currentConvo?.group?.avatarURL,
                participantsCount: currentConvo?.participants?.length || 0,
            };
            joinGroupCall(activeConversationId, groupInfo, callId);
        }
    };

    const isPickerOpen = !isRecalled && activeReactionMessageId === messageId;

    let locationData = null;
    if (messageType === 'location' && text && !isRecalled) {
        try {
            locationData = JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse coordinates JSON:", e);
        }
    }

    const reactionsByEmoji = reactions.reduce((acc, curr) => {
        if (!acc[curr.reaction]) {
            acc[curr.reaction] = [];
        }
        acc[curr.reaction].push(curr.userId);
        return acc;
    }, {});

    const hasReactions = Object.keys(reactionsByEmoji).length > 0;

    const handleMouseEnter = () => {
        if (isRecalled) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const top = Math.max(8, rect.top - 46); 
            
            const style = {
                position: 'fixed',
                top: `${top}px`,
                zIndex: 9999,
            };

            if (isMe) {
                style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
                style.left = 'auto';
            } else {
                style.left = `${Math.max(12, rect.left)}px`;
                style.right = 'auto';
            }
            setPickerStyle(style);

            if (activeReactionMessageId !== messageId) {
                setActiveReactionMessageId(messageId);
            }
        }
    };

    const handleMouseLeave = () => {
        if (showDropdown) return;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            if (useChatStore.getState().activeReactionMessageId === messageId && !showDropdown) {
                setActiveReactionMessageId(null);
                setShowDropdown(false);
            }
        }, 400);
    };

    const isRecallable = isMe && createdAt && (Date.now() - new Date(createdAt).getTime() < 3 * 60 * 60 * 1000);

    const handleTogglePin = async (e) => {
        e.stopPropagation();
        try {
            await togglePinMessageAction(messageId);
            toast.success(isPinned ? "Đã bỏ ghim tin nhắn!" : "Đã ghim tin nhắn!");
            setActiveReactionMessageId(null);
            setShowDropdown(false);
        } catch (err) {
            console.error("Failed to pin:", err);
            toast.error("Không thể ghim tin nhắn");
        }
    };

    const handleRecall = async (e) => {
        e.stopPropagation();
        try {
            await recallMessageAction(messageId);
            toast.success("Đã thu hồi tin nhắn!");
            setActiveReactionMessageId(null);
            setShowDropdown(false);
        } catch (err) {
            console.error("Failed to recall:", err);
            toast.error("Không thể thu hồi tin nhắn");
        }
    };

    const handleDeleteForMe = async (e) => {
        e.stopPropagation();
        try {
            await deleteMessageForMeAction(messageId);
            toast.success("Đã xóa tin nhắn đối với bạn!");
            setActiveReactionMessageId(null);
            setShowDropdown(false);
        } catch (err) {
            console.error("Failed to delete:", err);
            toast.error("Không thể xóa tin nhắn");
        }
    };

    return (
        <Motion.div
            id={messageId ? `msg-${messageId}` : undefined}
            className={cx('message-wrapper', { me: isMe })}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 450, damping: 30 }}
        >
            {!isMe && (
                <img 
                    src={avatar} 
                    alt="avatar" 
                    className={cx('avatar')} 
                    onError={(e) => { e.target.src = profilePic_test; }}
                />
            )}

            <div className={cx('message-content')}>
                {!isMe && isGroup && senderName && (
                    <p className={cx('sender-name')}>{senderName}</p>
                )}

                {isForwarded && !isRecalled && (
                    <div className={cx('forwarded-label')}>
                        <CornerUpRight size={12} className={cx('forward-icon')} />
                        <span>Đã chuyển tiếp</span>
                    </div>
                )}

                <div 
                    className={cx('message-container')} 
                    ref={containerRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {/* Reaction Picker */}
                    {isPickerOpen && (
                        <div 
                            className={cx('reaction-picker')} 
                            style={pickerStyle}
                            onMouseEnter={() => {
                                if (timeoutRef.current) {
                                    clearTimeout(timeoutRef.current);
                                    timeoutRef.current = null;
                                }
                            }}
                            onMouseLeave={handleMouseLeave}
                        >
                            {EMOJIS.map(emoji => (
                                <span 
                                    key={emoji} 
                                    className={cx('emoji-btn')}
                                    onClick={() => {
                                        onReact(emoji);
                                        setActiveReactionMessageId(null);
                                        setShowDropdown(false);
                                    }}
                                >
                                    {emoji}
                                </span>
                            ))}
                            
                            <span 
                                className={cx('emoji-btn', 'more-actions-btn', { active: showDropdown })}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdown(!showDropdown);
                                }}
                            >
                                <MoreHorizontal size={18} />
                            </span>

                            {showDropdown && (
                                <div 
                                    className={cx('actions-dropdown', { 'dropdown-me': isMe })} 
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseEnter={() => {
                                        if (timeoutRef.current) {
                                            clearTimeout(timeoutRef.current);
                                            timeoutRef.current = null;
                                        }
                                    }}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <button className={cx('dropdown-item')} onClick={handleTogglePin}>
                                        {isPinned ? <PinOff size={14} className={cx('icon')} /> : <Pin size={14} className={cx('icon')} />}
                                        <span>{isPinned ? "Bỏ ghim" : "Ghim"}</span>
                                    </button>
                                    <button className={cx('dropdown-item')} onClick={() => { setIsForwardOpen(true); setActiveReactionMessageId(null); setShowDropdown(false); }}>
                                        <CornerUpRight size={14} className={cx('icon')} />
                                        <span>Chuyển tiếp</span>
                                    </button>
                                    {isRecallable && (
                                        <button className={cx('dropdown-item', 'recall-item')} onClick={handleRecall}>
                                            <RotateCcw size={14} className={cx('icon')} />
                                            <span>Thu hồi</span>
                                        </button>
                                    )}
                                    <button className={cx('dropdown-item', 'delete-item')} onClick={handleDeleteForMe}>
                                        <Trash2 size={14} className={cx('icon')} />
                                        <span>Xóa bên tôi</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bubble Content */}
                    {isRecalled ? (
                        <div className={cx('message-bubble', 'recalled-bubble')}>
                            Tin nhắn đã bị thu hồi
                        </div>
                    ) : (
                        <>
                            {image && (messageType === 'image' || messageType === 'text') && (
                                <img 
                                    src={image} 
                                    alt="chat-content" 
                                    className={cx('message-image')}
                                    onClick={() => setIsImageModalOpen(true)}
                                    style={{ cursor: 'pointer', marginBottom: '4px' }}
                                />
                            )}
                            
                            {messageType === 'location' && locationData ? (
                                <div className={cx('location-bubble')}>
                                    <div className={cx('location-card')}>
                                        <div className={cx('location-header')}>
                                            <MapPin size={16} className={cx('pin-icon')} />
                                            <span>{locationData.address || "Vị trí đã chia sẻ"}</span>
                                        </div>
                                        <div className={cx('map-preview')}>
                                            <iframe
                                                title="Location Preview"
                                                width="100%"
                                                height="150"
                                                frameBorder="0"
                                                src={`https://maps.google.com/maps?q=${locationData.lat},${locationData.lng}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                                allowFullScreen
                                            ></iframe>
                                        </div>
                                        <a 
                                            href={`https://www.google.com/maps?q=${locationData.lat},${locationData.lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={cx('maps-btn')}
                                        >
                                            <span>Mở trên Google Maps</span>
                                            <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </div>
                            ) : messageType === 'file' ? (
                                <div className={cx('file-bubble')}>
                                    <div className={cx('file-card')}>
                                        <div className={cx('file-info')}>
                                            <div className={cx('file-icon-wrapper')}>
                                                <File size={20} />
                                            </div>
                                            <div className={cx('file-details')}>
                                                <div className={cx('file-name')} title={text}>
                                                    {text || "Tệp đính kèm"}
                                                </div>
                                                <div className={cx('file-meta')}>Tài liệu</div>
                                            </div>
                                        </div>
                                        <a 
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download={text || "download"}
                                            className={cx('file-download-btn')}
                                            title="Tải về"
                                        >
                                            <Download size={15} />
                                        </a>
                                    </div>
                                </div>
                            ) : messageType === 'audio' ? (
                                <div className={cx('audio-bubble')}>
                                    <CustomAudioPlayer src={fileUrl} />
                                </div>
                            ) : messageType === 'group_call' ? (
                                <div className={cx('group-call-bubble', { 'active-call': isThisCallActive })}>
                                    <div className={cx('group-call-header')}>
                                        <div className={cx('group-call-icon-box', { active: isThisCallActive })}>
                                            {isThisCallActive ? <Radio size={20} /> : <PhoneCall size={20} />}
                                        </div>
                                        <div className={cx('group-call-meta')}>
                                            <span className={cx('group-call-title')}>Cuộc gọi thoại nhóm</span>
                                            <span className={cx('group-call-status')}>
                                                {isThisCallActive ? (
                                                    <>
                                                        <span className={cx('live-dot')} />
                                                        <span>{`Đang diễn ra • ${participantsCount} người tham gia`}</span>
                                                    </>
                                                ) : (
                                                    <span>{text || 'Cuộc gọi đã kết thúc'}</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {isThisCallActive ? (
                                        <button
                                            type="button"
                                            className={cx('group-call-btn', {
                                                'in-call': isCurrentInThisCall
                                            })}
                                            onClick={handleGroupCallAction}
                                        >
                                            <PhoneCall size={16} />
                                            <span>
                                                {isCurrentInThisCall
                                                    ? 'Mở phòng thoại'
                                                    : 'Tham gia cuộc gọi'}
                                            </span>
                                        </button>
                                    ) : (
                                        <div className={cx('group-call-ended-badge')}>
                                            <PhoneOff size={14} />
                                            <span>Đã kết thúc</span>
                                        </div>
                                    )}
                                </div>
                            ) : messageType === 'poll' && poll ? (
                                <div className={cx('poll-card')}>
                                    <div className={cx('poll-header')}>
                                        <div className={cx('poll-icon-box')}>
                                            <BarChart2 size={18} className={cx('poll-icon')} />
                                        </div>
                                        <div className={cx('poll-meta')}>
                                            <span className={cx('poll-type-badge')}>
                                                {poll.allowMultiple ? 'Chọn nhiều phương án' : 'Chọn 1 phương án'}
                                                {poll.closed && ' • Đã kết thúc'}
                                            </span>
                                            <h4 className={cx('poll-question')}>{poll.question || text}</h4>
                                        </div>
                                    </div>

                                    <div className={cx('poll-options')}>
                                        {(poll.options || []).map((opt) => {
                                            const totalVotes = (poll.options || []).reduce((sum, o) => sum + (o.votes?.length || 0), 0);
                                            const optVotes = opt.votes?.length || 0;
                                            const percent = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                                            const isVotedByMe = (opt.votes || []).some((v) => {
                                                const vId = (v?._id || v)?.toString();
                                                return vId === currentUser?._id?.toString();
                                            });

                                            return (
                                                <div
                                                    key={opt.id}
                                                    className={cx('poll-option-item', {
                                                        'voted-by-me': isVotedByMe,
                                                        'disabled': poll.closed
                                                    })}
                                                    onClick={() => {
                                                        if (!poll.closed) {
                                                            votePollAction(messageId, opt.id);
                                                        }
                                                    }}
                                                >
                                                    <div
                                                        className={cx('poll-progress-bar')}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                    <div className={cx('poll-option-content')}>
                                                        <div className={cx('poll-option-left')}>
                                                            <span className={cx('poll-checkbox', { checked: isVotedByMe })}>
                                                                {isVotedByMe && <Check size={12} strokeWidth={3} />}
                                                            </span>
                                                            <span className={cx('poll-option-text')}>{opt.text}</span>
                                                        </div>
                                                        <div className={cx('poll-option-right')}>
                                                            <span className={cx('poll-percent')}>{percent}%</span>
                                                            <span className={cx('poll-count')}>({optVotes})</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className={cx('poll-footer')}>
                                        <span className={cx('poll-total-votes')}>
                                            {(poll.options || []).reduce((s, o) => s + (o.votes?.length || 0), 0)} lượt bình chọn
                                        </span>
                                        {!poll.closed && (
                                            (poll.createdBy?.toString() === currentUser?._id?.toString() ||
                                            currentConvo?.participants?.some(p => p._id === currentUser?._id && p.role === 'admin'))
                                        ) && (
                                            <button
                                                type="button"
                                                className={cx('poll-close-btn')}
                                                onClick={() => closePollAction(messageId)}
                                            >
                                                Kết thúc bình chọn
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                (!image || text) && (
                                    <div className={cx('message-bubble', { 'pinned-message': isPinned })}>
                                        <p className={cx('message-text')}>{text}</p>
                                    </div>
                                )
                            )}
                        </>
                    )}

                    {/* Reactions Display */}
                    {hasReactions && !isRecalled && (
                        <div className={cx('reactions-display', { 'reactions-me': isMe })}>
                            {Object.entries(reactionsByEmoji).map(([emoji, users]) => (
                                <ReactionItem key={emoji} emoji={emoji} users={users} />
                            ))}
                        </div>
                    )}

                    {/* X-Style Timestamp and Status BELOW Bubble */}
                    {!isRecalled && (
                        <div className={cx('message-time-meta')}>
                            {isPinned && <Pin size={11} className={cx('meta-pin')} />}
                            <span className={cx('meta-time')}>{time}</span>
                            {isMe && (
                                <span className={cx('meta-status')}>
                                    <CheckCheck size={13} style={{ color: '#f97316' }} />
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Image Modal Overlay */}
            {isImageModalOpen && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0, 
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(0,0,0,0.95)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000
                    }} 
                    onClick={() => setIsImageModalOpen(false)}
                >
                    <img 
                        src={image} 
                        alt="Full size" 
                        style={{
                            maxWidth: '90%',
                            maxHeight: '90%',
                            objectFit: 'contain'
                        }} 
                    />
                    <button 
                        onClick={() => setIsImageModalOpen(false)}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            right: '20px',
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={32} />
                    </button>
                </div>
            )}

            {/* Forward Modal Overlay */}
            {isForwardOpen && (
                <ForwardModal messageId={messageId} onClose={() => setIsForwardOpen(false)} />
            )}
        </Motion.div>
    );
};

const ReactionItem = ({ emoji, users }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const { friends } = useChatStore.getState();
    const { user: currentUser } = useAuthStore.getState();

    const userNames = users.map(u => {
        if (typeof u === 'object' && (u.displayName || u.username)) {
             if (u._id === currentUser?._id) return "Bạn";
             return u.displayName || u.username;
        }

        const userIdStr = typeof u === 'object' ? u._id : u;
        if (userIdStr === currentUser?._id) return "Bạn";

        const friend = Array.isArray(friends) ? friends.find(f => f && f._id && f._id.toString() === userIdStr?.toString()) : null;
        if (friend) return friend.displayName || friend.username;

        return "Người dùng";
    });

    const displayNames = userNames.slice(0, 5);
    const remaining = userNames.length - 5;

    let tooltipText = displayNames.join(', ');
    if (remaining > 0) tooltipText += ` và ${remaining} người khác`;

    return (
        <div 
            className={cx('reaction-item')}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {emoji} <span className={cx('reaction-count')}>{users.length > 1 ? users.length : ''}</span>
            
            {showTooltip && (
                <div className={cx('reaction-tooltip')}>
                    {tooltipText}
                </div>
            )}
        </div>
    );
};

export default Message;