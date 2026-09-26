import React from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatCard.module.scss';
import default_avt from "../../../public/favicon.png";
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import { useNavigate } from "react-router-dom";
import { ASSET_BASE_URL } from "../../config/env.js";
import { Image, Mic, Video, FileText, MapPin, PhoneCall } from 'lucide-react';

const cx = classNames.bind(styles);

const ChatCard = ({ props }) => {
    const { setActiveConversationId, activeConversationId, messages, fetchMessages, friends } = useChatStore();
    const { user: currentUser, onlineUsers } = useAuthStore();
    const navigate = useNavigate();

    // 1. Tìm người chat cùng (Partner)
    let partner = props?.participants?.find(p => p && p._id && currentUser && p._id !== currentUser._id) || props?.participants?.[0];

    if (partner && partner._id && Array.isArray(friends) && friends.length > 0) {
        const friend = friends.find(f => f && f._id && (f._id === partner._id || f._id === partner._id?.toString()));
        if (friend) {
            partner = { ...partner, ...friend };
        }
    }

    const isOnline = onlineUsers.includes(partner?._id);

    // 2. Unread Count
    const getUnreadCount = () => {
        if (!props.unreadCounts) return 0;
        if (props.unreadCounts instanceof Map) {
            return props.unreadCounts.get(currentUser?._id) || 0;
        } else if (typeof props.unreadCounts === 'object') {
            return props.unreadCounts[currentUser?._id] || 0;
        }
        return typeof props.unreadCounts === 'number' ? props.unreadCounts : 0;
    };

    const unreadCount = getUnreadCount();

    // 3. Format thời gian chuẩn X (12m, 3h, Sep 18)
    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        if (diffMins < 1) return 'vừa xong';
        if (diffMins < 60) return `${diffMins}p`;
        if (diffHours < 24 && date.toDateString() === now.toDateString()) {
            return `${diffHours}h`;
        }
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
    };

    const handleSelectConversation = async (conversationId) => {
        if (!conversationId) return;
        setActiveConversationId(conversationId);
        navigate(`/chat?id=${conversationId}`);

        if (!messages[conversationId]) {
            await fetchMessages(conversationId);
        }
    };

    const getSafeAvatar = (url) => {
        if (!url) return default_avt;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    const formatLastMessage = (lastMsg) => {
        if (!lastMsg) return <span className={cx('empty-msg')}>Chưa có tin nhắn</span>;
        if (lastMsg.isRecalled || lastMsg.content === "Tin nhắn đã bị thu hồi") {
            return "Tin nhắn đã bị thu hồi";
        }
        
        const type = lastMsg.messageType || 'text';
        const senderIdStr = typeof lastMsg.senderId === 'object' 
            ? lastMsg.senderId?._id?.toString() 
            : lastMsg.senderId?.toString();
        const isMe = currentUser && senderIdStr === currentUser._id?.toString();
        const prefix = isMe ? "Bạn: " : "";

        switch (type) {
            case 'image':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {prefix}<Image size={13} className={cx('preview-icon')} /> Hình ảnh
                    </span>
                );
            case 'audio':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {prefix}<Mic size={13} className={cx('preview-icon')} /> Tin nhắn thoại
                    </span>
                );
            case 'video':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {prefix}<Video size={13} className={cx('preview-icon')} /> Video
                    </span>
                );
            case 'file':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {prefix}<FileText size={13} className={cx('preview-icon')} /> Tập tin
                    </span>
                );
            case 'location':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {prefix}<MapPin size={13} className={cx('preview-icon')} /> Vị trí
                    </span>
                );
            case 'group_call':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {prefix}<PhoneCall size={13} className={cx('preview-icon')} /> Cuộc gọi nhóm
                    </span>
                );
            case 'text':
            default:
                return `${prefix}${lastMsg.content || ""}`;
        }
    };

    const isActive = Boolean(activeConversationId) && props._id === activeConversationId;

    return (
        <div
            className={cx('chat-card-wrapper', { active: isActive })}
            onClick={() => handleSelectConversation(props._id)}
        >
            <div className={cx('avatar-wrapper')}>
                <img
                    src={getSafeAvatar(partner?.avatarURL)}
                    alt="avatar"
                    className={cx('avatar')}
                    onError={(e) => { e.target.src = default_avt; }}
                />
                {isOnline && <div className={cx("status", "online")}></div>}
            </div>

            <div className={cx('info-wrapper')}>
                {/* Row 1: Name @username · Time (X Signature format) */}
                <div className={cx('card-top-row')}>
                    <p className={cx('full-name')}>{partner?.displayName || "Người dùng"}</p>
                    {partner?.username && <span className={cx('username')}>@{partner.username}</span>}
                    {props?.lastMessage?.createdAt && (
                        <>
                            <span className={cx('separator')}>·</span>
                            <span className={cx('time')}>{formatTime(props.lastMessage.createdAt)}</span>
                        </>
                    )}
                </div>

                {/* Row 2: Message preview + Unread pill */}
                <div className={cx('card-bottom-row')}>
                    <p className={cx('last-message', { unseen: unreadCount > 0 })}>
                        {formatLastMessage(props?.lastMessage)}
                    </p>
                    {unreadCount > 0 && (
                        <span className={cx('unread-badge')}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChatCard;
