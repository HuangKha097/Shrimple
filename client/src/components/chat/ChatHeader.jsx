import React, { useMemo, useEffect, useState } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatHeader.module.scss';
import defaultAvatar from "../../../public/favicon.png";
import { Info, Phone, Video, ChevronLeft, MoreVertical, Pin, PinOff, ChevronDown, ChevronUp, X, PhoneCall } from 'lucide-react';
import { useAuthStore } from "../../stores/useAuthStore.js";
import { useChatStore } from "../../stores/useChatStore.js";
import { useCallStore } from '../../stores/useCallStore';
import { useGroupCallStore } from '../../stores/useGroupCallStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);

const ChatHeader = ({ onCloseChatInfo, chat }) => {
    const { user: currentUser, onlineUsers } = useAuthStore();
    const { friends, setActiveConversationId, pinnedMessages, fetchPinnedMessages, togglePinMessageAction } = useChatStore();
    const { initiateCall } = useCallStore();
    const { activeGroupCalls, isInCall, currentConversationId, joinGroupCall, setModalOpen } = useGroupCallStore();
    const navigate = useNavigate();
    const [showMenu, setShowMenu] = useState(false);
    const [showAllPins, setShowAllPins] = useState(false);

    useEffect(() => {
        if (chat && chat._id) {
            fetchPinnedMessages(chat._id);
        }
    }, [chat?._id]);

    if (!chat) return null;

    const isGroup = chat.isGroup;
    const hasActiveGroupCall = Boolean(activeGroupCalls[chat._id]?.isActive);
    const isCurrentInThisCall = isInCall && currentConversationId === chat._id;
    let displayName = "Unknown";
    let statusText = "Offline";
    let isOnline = false;
    let partnerId = null;

    // --- 1. XỬ LÝ DỮ LIỆU ---
    const participants = chat.participants || [];
    const groupInfo = chat.group;

    // Resolve Partner (for 1-1)
    let partner = !isGroup ? (participants.find(p => p && p._id && currentUser && p._id !== currentUser._id) || participants[0]) : null;

    if (partner && partner._id && Array.isArray(friends) && friends.length > 0) {
        const friend = friends.find(f => f && f._id && (f._id === partner._id || f._id === partner._id?.toString()));
        if (friend) {
            partner = { ...partner, ...friend };
        }
    }

    if (isGroup) {
        displayName = chat.name || groupInfo?.name || "Unnamed Group";
        statusText = `${participants.length} members`;
    } else if (partner) {
        displayName = partner.displayName || partner.username || "User";
        isOnline = onlineUsers.includes(partner._id);
        statusText = isOnline ? "Active now" : "Offline";
        partnerId = partner._id;
    }

    const isAllowedToCall = useMemo(() => {
        if (isGroup) return true;
        if (!partner) return false;
        return friends.some(f => f._id.toString() === partner._id.toString());
    }, [isGroup, partner, friends]);

    const renderAvatar = () => {
        const getAvatarSrc = (url) => {
            if (!url) return defaultAvatar;
            if (url.startsWith('http') || url.startsWith('data:')) return url;
            return `${ASSET_BASE_URL}${url}`;
        };

        if (isGroup) {
            if (chat.avatarURL || groupInfo?.avatarURL) {
                return (
                    <img
                        src={getAvatarSrc(chat.avatarURL || groupInfo?.avatarURL)}
                        alt="Group Avatar"
                        className={cx("profile-pic", "single-avatar")}
                        onError={(e) => { e.target.src = defaultAvatar }}
                    />
                );
            }
            if (participants.length > 0) {
                return (
                    <div className={cx('group-avatar-stack')}>
                        <img
                            src={getAvatarSrc(participants[0]?.avatarURL)}
                            alt="mem1"
                            className={cx('stack-avatar', 'first')}
                            onError={(e) => { e.target.src = defaultAvatar }}
                        />
                        {participants.length > 1 && (
                            <img
                                src={getAvatarSrc(participants[1]?.avatarURL)}
                                alt="mem2"
                                className={cx('stack-avatar', 'second')}
                                onError={(e) => { e.target.src = defaultAvatar }}
                            />
                        )}
                    </div>
                );
            }
        }

        const singleAvatarUrl = partner?.avatarURL;
        return (
            <img
                src={getAvatarSrc(singleAvatarUrl)}
                alt="avatar"
                className={cx("profile-pic")}
                onError={(e) => { e.target.src = defaultAvatar }}
            />
        );
    };

    const handleProfileClick = () => {
        if (!isGroup && partnerId) {
            navigate(`/feed/profile/${partnerId}`);
        }
    };

    // Pinned messages list for this chat
    const pins = pinnedMessages[chat._id] || [];

    const getPinPreviewText = (pin) => {
        if (pin.isRecalled) return "Tin nhắn đã bị thu hồi";
        switch (pin.messageType) {
            case 'text':
                return pin.content;
            case 'image':
                return "[Hình ảnh]";
            case 'audio':
                return "[Tin nhắn thoại]";
            case 'file':
                return `[Tập tin] ${pin.content || ""}`;
            case 'location':
                return "[Vị trí chia sẻ]";
            case 'group_call':
                return "[Cuộc gọi nhóm]";
            default:
                return "Tin nhắn ghim";
        }
    };

    const handleScrollToMessage = (messageId) => {
        const element = document.getElementById(`msg-${messageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('glow-highlight');
            setTimeout(() => element.classList.remove('glow-highlight'), 2000);
        } else {
            toast.info("Không tìm thấy tin nhắn hoặc tin nhắn chưa được tải.");
        }
    };

    const handleUnpinMessage = async (e, messageId) => {
        e.stopPropagation();
        try {
            await togglePinMessageAction(messageId);
            toast.success("Đã bỏ ghim tin nhắn!");
        } catch (error) {
            console.error("Failed to unpin:", error);
            toast.error("Không thể bỏ ghim");
        }
    };

    return (
        <div className={cx('header-container')}>
            <div className={cx('header-wrapper')}>
                <button
                    type="button"
                    className={cx('mobile-back-btn')}
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveConversationId(null);
                        navigate('/chat', { replace: true });
                    }}
                >
                    <ChevronLeft size={30} />
                </button>
                <div className={cx('user-info')} onClick={handleProfileClick} style={{ cursor: !isGroup ? 'pointer' : 'default' }}>
                    <div className={cx('avatar-container')}>
                        {renderAvatar()}
                    </div>

                    <div className={cx("info")}>
                        <p className={cx('user-name')}>{displayName}</p>
                        <span className={cx('user-status')}>
                            {!isGroup && isOnline && <span className={cx('online-dot')}></span>}
                            {statusText}
                        </span>
                    </div>
                </div>

                <div className={cx('action-buttons')}>
                    {isGroup ? (
                        <button
                            className={cx('btn', { 'active-call': hasActiveGroupCall })}
                            title={
                                hasActiveGroupCall
                                    ? isCurrentInThisCall
                                        ? 'Đang trong cuộc gọi nhóm · Nhấn để mở phòng'
                                        : 'Tham gia cuộc gọi nhóm đang diễn ra'
                                    : 'Bắt đầu cuộc gọi nhóm'
                            }
                            onClick={() => {
                                if (isCurrentInThisCall) {
                                    setModalOpen(true);
                                } else {
                                    joinGroupCall(chat._id, {
                                        _id: chat._id,
                                        name: displayName,
                                        avatarURL: chat.avatarURL || groupInfo?.avatarURL,
                                        participantsCount: participants.length,
                                    });
                                }
                            }}
                        >
                            <Phone size={20} />
                        </button>
                    ) : (
                        <>
                            <button
                                className={cx('btn')}
                                disabled={!isAllowedToCall}
                                title={!isAllowedToCall ? 'You are not friends' : 'Voice Call'}
                                onClick={() => {
                                    if (!partnerId) {
                                        toast.error('Không tìm thấy thông tin người nhận');
                                        return;
                                    }
                                    initiateCall(partnerId, false, partner);
                                }}
                            >
                                <Phone size={20} />
                            </button>
                            <button
                                className={cx('btn')}
                                disabled={!isAllowedToCall}
                                title={!isAllowedToCall ? 'You are not friends' : 'Video Call'}
                                onClick={() => {
                                    if (!partnerId) {
                                        toast.error('Không tìm thấy thông tin người nhận');
                                        return;
                                    }
                                    initiateCall(partnerId, true, partner);
                                }}
                            >
                                <Video size={20} />
                            </button>
                        </>
                    )}

                    <div className={cx('more-menu-container')}>
                        <button
                            className={cx('btn', { active: showMenu })}
                            onClick={() => setShowMenu(!showMenu)}
                        >
                            <MoreVertical size={20} />
                        </button>

                        {showMenu && (
                            <div className={cx('dropdown-menu')}>
                                <button className={cx('menu-item')} onClick={() => { onCloseChatInfo(); setShowMenu(false); }}>
                                    <Info size={18} />
                                    <span>Chat Info</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Premium Pinned Message Bar */}
            {pins.length > 0 && (
                <div className={cx('pinned-bar-wrapper')}>
                    <div className={cx('pinned-bar-main')} onClick={() => handleScrollToMessage(pins[0]._id)}>
                        <div className={cx('pin-icon-box')}>
                            <Pin size={14} className={cx('pin-icon')} />
                        </div>
                        <div className={cx('pin-info')}>
                            <span className={cx('pin-tag')}>Tin nhắn đã ghim {pins.length > 1 && `(1/${pins.length})`}</span>
                            <p className={cx('pin-preview')}>{getPinPreviewText(pins[0])}</p>
                        </div>
                        <div className={cx('pin-actions')} onClick={(e) => e.stopPropagation()}>
                            {pins.length > 1 && (
                                <button 
                                    className={cx('pin-toggle-btn')}
                                    onClick={() => setShowAllPins(!showAllPins)}
                                    title="Xem tất cả tin nhắn ghim"
                                >
                                    {showAllPins ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                            )}
                            <button 
                                className={cx('pin-close-btn')}
                                onClick={(e) => handleUnpinMessage(e, pins[0]._id)}
                                title="Bỏ ghim"
                            >
                                <PinOff size={14} />
                            </button>
                        </div>
                    </div>

                    {/* All Pinned Messages Collapsible Panel */}
                    {showAllPins && pins.length > 1 && (
                        <div className={cx('pinned-list-overlay')}>
                            <div className={cx('pinned-list-panel')}>
                                {pins.map((pin, idx) => (
                                    <div 
                                        key={pin._id} 
                                        className={cx('pinned-list-item')}
                                        onClick={() => {
                                            handleScrollToMessage(pin._id);
                                            setShowAllPins(false);
                                        }}
                                    >
                                        <div className={cx('item-content')}>
                                            <span className={cx('item-index')}>#{idx + 1}</span>
                                            <p className={cx('item-text')}>{getPinPreviewText(pin)}</p>
                                        </div>
                                        <button 
                                            className={cx('item-unpin-btn')}
                                            onClick={(e) => handleUnpinMessage(e, pin._id)}
                                            title="Bỏ ghim"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChatHeader;
