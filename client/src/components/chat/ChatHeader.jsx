import { useEffect, useState } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatHeader.module.scss';
import defaultAvatar from "../../../public/favicon.png";
import { Info, Phone, Video, ChevronLeft, MoreVertical, Pin, PinOff, ChevronDown, ChevronUp, X, PenTool } from 'lucide-react';
import { useAuthStore } from "../../stores/useAuthStore.js";
import { useChatStore } from "../../stores/useChatStore.js";
import { useCallStore } from '../../stores/useCallStore';
import { useGroupCallStore } from '../../stores/useGroupCallStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);

const ChatHeader = ({ onCloseChatInfo, chat }) => {
    const { user: currentUser, onlineUsers } = useAuthStore();
    const { friends, setActiveConversationId, pinnedMessages, fetchPinnedMessages, togglePinMessageAction, isDrawModeOpen, toggleDrawMode, chatDrawings } = useChatStore();
    const { initiateCall } = useCallStore();
    const { activeGroupCalls, isInCall, currentConversationId, joinGroupCall, setModalOpen } = useGroupCallStore();
    const navigate = useNavigate();
    const [showMenu, setShowMenu] = useState(false);
    const [showAllPins, setShowAllPins] = useState(false);
    const chatId = chat?._id;

    useEffect(() => {
        if (chatId) {
            fetchPinnedMessages(chatId);
        }
    }, [chatId, fetchPinnedMessages]);

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
        displayName = chat.name || groupInfo?.name || "Nhóm chưa đặt tên";
        statusText = `${participants.length} thành viên`;
    } else if (partner) {
        displayName = partner.displayName || partner.username || "Người dùng";
        isOnline = onlineUsers.includes(partner._id);
        statusText = isOnline ? "Đang hoạt động" : "Ngoại tuyến";
        partnerId = partner._id;
    }

    const isAllowedToCall = isGroup || Boolean(
        partner && friends.some(f => f._id.toString() === partner._id.toString())
    );

    const renderAvatar = () => {
        const getAvatarSrc = (url) => {
            if (!url) return defaultAvatar;
            if (url.startsWith('http') || url.startsWith('data:')) return url;
            return `${ASSET_BASE_URL}${url}`;
        };

        const resolveParticipantAvatar = (p) => {
            if (!p) return null;
            if (p.avatarURL) return p.avatarURL;
            const pId = (p._id || p.userId || p)?.toString();
            if (pId && currentUser && pId === currentUser._id?.toString()) return currentUser.avatarURL;
            const f = Array.isArray(friends) ? friends.find(fr => fr?._id?.toString() === pId) : null;
            return f?.avatarURL || null;
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
                            src={getAvatarSrc(resolveParticipantAvatar(participants[0]))}
                            alt="mem1"
                            className={cx('stack-avatar', 'first')}
                            onError={(e) => { e.target.src = defaultAvatar }}
                        />
                        {participants.length > 1 && (
                            <img
                                src={getAvatarSrc(resolveParticipantAvatar(participants[1]))}
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
        } else if (isGroup && onCloseChatInfo) {
            onCloseChatInfo();
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
            case 'poll':
                return `[Bình chọn] ${pin.poll?.question || pin.content || ""}`;
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
                <div className={cx('user-info')} onClick={handleProfileClick} style={{ cursor: 'pointer' }} title={isGroup ? "Xem thông tin nhóm" : "Xem trang cá nhân"}>
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
                                title={!isAllowedToCall ? 'Chưa kết bạn' : 'Gọi thoại'}
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
                                title={!isAllowedToCall ? 'Chưa kết bạn' : 'Gọi video'}
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

                    <button
                        type="button"
                        className={cx('btn', { active: isDrawModeOpen })}
                        title="Cây bút vẽ đính trên màn hình chat (Instagram Draw)"
                        onClick={toggleDrawMode}
                        style={{
                            position: 'relative',
                            color: isDrawModeOpen || (chatDrawings?.[chat._id]?.strokes?.length > 0) ? '#f97316' : undefined,
                        }}
                    >
                        <PenTool size={19} />
                        {chatDrawings?.[chat._id]?.strokes?.length > 0 && (
                            <span
                                style={{
                                    position: 'absolute',
                                    top: '6px',
                                    right: '6px',
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    backgroundColor: '#f97316',
                                    boxShadow: '0 0 6px #f97316',
                                }}
                            />
                        )}
                    </button>

                    <button
                        type="button"
                        className={cx('btn')}
                        title={isGroup ? "Thông tin nhóm" : "Thông tin hội thoại"}
                        onClick={onCloseChatInfo}
                    >
                        <Info size={20} />
                    </button>

                    <div className={cx('more-menu-container')}>
                        <button
                            className={cx('btn', { active: showMenu })}
                            onClick={() => setShowMenu(!showMenu)}
                            title="Tùy chọn khác"
                        >
                            <MoreVertical size={20} />
                        </button>

                        {showMenu && (
                            <div className={cx('dropdown-menu')}>
                                <button className={cx('menu-item')} onClick={() => { toggleDrawMode(); setShowMenu(false); }}>
                                    <PenTool size={18} />
                                    <span>{isDrawModeOpen ? "Đóng bút vẽ màn hình" : "Vẽ lên màn hình chat"}</span>
                                </button>
                                <button className={cx('menu-item')} onClick={() => { onCloseChatInfo(); setShowMenu(false); }}>
                                    <Info size={18} />
                                    <span>{isGroup ? "Thông tin nhóm" : "Thông tin hội thoại"}</span>
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
