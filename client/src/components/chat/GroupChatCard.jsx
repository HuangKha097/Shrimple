import { useNavigate } from "react-router-dom";
import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatCard.module.scss';
import default_avt from "../../../public/favicon.png";
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import { ASSET_BASE_URL } from "../../config/env.js";
import { Image, Mic, Video, FileText, MapPin, PhoneCall, BarChart2 } from 'lucide-react';

const cx = classNames.bind(styles);

const GroupChatCard = ({ props }) => {
    const { setActiveConversationId, activeConversationId, fetchMessages, friends } = useChatStore();
    const { user: currentUser } = useAuthStore();
    const navigate = useNavigate();

    const groupInfo = props?.group;
    const participants = props?.participants || [];
    const lastMessage = props?.lastMessage;

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

    const renderAvatar = () => {
        const getAvatarSrc = (url) => {
            if (!url) return default_avt;
            if (url.startsWith('http') || url.startsWith('data:')) return url;
            return `${ASSET_BASE_URL}${url}`;
        };

        if (groupInfo?.avatarURL) {
            return (
                <img
                    src={getAvatarSrc(groupInfo.avatarURL)}
                    alt="Group Avatar"
                    className={cx('avatar', 'single-avatar')}
                    onError={(e) => { e.target.src = default_avt; }}
                />
            );
        }

        if (participants.length > 0) {
            const resolveAvatar = (member) => {
                if (!member) return null;
                if (friends && friends.length > 0) {
                    const friend = friends.find(f => f._id === member._id || f._id === member._id?.toString());
                    if (friend && friend.avatarURL) return friend.avatarURL;
                }
                return member.avatarURL;
            };

            const firstAvatar = resolveAvatar(participants[0]);
            const secondAvatar = participants.length > 1 ? resolveAvatar(participants[1]) : null;

            return (
                <div className={cx('group-avatar-stack')}>
                    <img
                        src={getAvatarSrc(firstAvatar)}
                        alt="mem1"
                        className={cx('stack-avatar', 'first')}
                        onError={(e) => { e.target.src = default_avt; }}
                    />
                    {participants.length > 1 && (
                        <img
                            src={getAvatarSrc(secondAvatar)}
                            alt="mem2"
                            className={cx('stack-avatar', 'second')}
                            onError={(e) => { e.target.src = default_avt; }}
                        />
                    )}
                </div>
            );
        }
        return <img src={default_avt} alt="default" className={cx('avatar', 'single-avatar')} />;
    };

    const handleSelectConversation = async (conversationId) => {
        setActiveConversationId(conversationId);
        navigate(`/chat?id=${conversationId}`);
        await fetchMessages(conversationId);
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
            
        let senderName = "";
        const isMe = currentUser && senderIdStr === currentUser._id?.toString();
        
        if (isMe) {
            senderName = "Bạn";
        } else if (typeof lastMsg.senderId === 'object' && lastMsg.senderId?.displayName) {
            senderName = lastMsg.senderId.displayName;
        } else if (participants.length > 0) {
            const p = participants.find(part => {
                const id = part._id || (typeof part.userId === 'object' ? part.userId?._id : part.userId);
                return id?.toString() === senderIdStr;
            });
            if (p) senderName = p.displayName || p.username;
        }
        if (!senderName) senderName = "Thành viên";

        switch (type) {
            case 'image':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <Image size={13} className={cx('preview-icon')} /> Hình ảnh
                    </span>
                );
            case 'audio':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <Mic size={13} className={cx('preview-icon')} /> Tin nhắn thoại
                    </span>
                );
            case 'video':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <Video size={13} className={cx('preview-icon')} /> Video
                    </span>
                );
            case 'file':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <FileText size={13} className={cx('preview-icon')} /> Tập tin
                    </span>
                );
            case 'location':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <MapPin size={13} className={cx('preview-icon')} /> Vị trí
                    </span>
                );
            case 'group_call':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <PhoneCall size={13} className={cx('preview-icon')} /> Cuộc gọi nhóm
                    </span>
                );
            case 'poll':
                return (
                    <span className={cx('msg-preview-inline')}>
                        {senderName}: <BarChart2 size={13} className={cx('preview-icon')} /> Bình chọn: {lastMsg.poll?.question || lastMsg.content || ""}
                    </span>
                );
            case 'text':
            default:
                return `${senderName}: ${lastMsg.content || ""}`;
        }
    };

    const isActive = Boolean(activeConversationId) && props._id === activeConversationId;
    const timeDisplay = props?.lastMessage?.createdAt || props?.updatedAt || props?.lastMessageAt;

    return (
        <div
            className={cx('chat-card-wrapper', { active: isActive })}
            onClick={() => handleSelectConversation(props._id)}
        >
            <div className={cx('avatar-wrapper')}>
                {renderAvatar()}
            </div>

            <div className={cx('info-wrapper')}>
                {/* Row 1: Group Name · Time */}
                <div className={cx('card-top-row')}>
                    <p className={cx('group-name')}>
                        {props.name || groupInfo?.name || "Nhóm trò chuyện"}
                    </p>
                    <span className={cx('username')}>({participants.length})</span>
                    {timeDisplay && (
                        <>
                            <span className={cx('separator')}>·</span>
                            <span className={cx('time')}>{formatTime(timeDisplay)}</span>
                        </>
                    )}
                </div>

                {/* Row 2: Snippet + Unread badge */}
                <div className={cx('card-bottom-row')}>
                    <p className={cx('last-message', { unseen: props?.unreadCounts > 0 })}>
                        {formatLastMessage(lastMessage)}
                    </p>
                    {props?.unreadCounts > 0 && (
                        <span className={cx('unread-badge')}>
                            {props.unreadCounts > 9 ? '9+' : props.unreadCounts}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroupChatCard;
