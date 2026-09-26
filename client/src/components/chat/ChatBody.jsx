import React, { useEffect, useRef } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatBody.module.scss';
import Message from './Message.jsx';
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import defaultAvatar from "../../../public/favicon.png";
import LoadingSpin from "../common/loading/LoadingSpin.jsx";
import GroupCallBanner from "./GroupCallBanner.jsx";
import { useNavigate } from 'react-router-dom';
import { Calendar, GraduationCap } from 'lucide-react';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);

const ChatBody = () => {
    const { messages, activeConversationId, conversations, fetchMessages, reactToMessageAction, friends, messageLoading } = useChatStore();
    const { user: currentUser } = useAuthStore();
    const navigate = useNavigate();
    const endOfMessagesRef = useRef(null);

    const currentConvo = conversations.find(c => c._id === activeConversationId);
    const currentMessagesData = messages[activeConversationId];
    const messageList = currentMessagesData?.items || [];
    const hasMore = currentMessagesData?.hasMore;

    const containerRef = useRef(null);
    const prevScrollHeightRef = useRef(0);
    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (activeConversationId && !currentMessagesData) {
            fetchMessages(activeConversationId);
        }
    }, [activeConversationId, currentMessagesData, fetchMessages]);

    const isFirstLoadRef = useRef(true);
    const [isReady, setIsReady] = React.useState(false);

    React.useLayoutEffect(() => {
        isFirstLoadRef.current = true;
        setIsReady(false);
    }, [activeConversationId]);

    React.useLayoutEffect(() => {
        if (messageLoading && messageList.length === 0) {
            setIsReady(false);
            return;
        }

        const finalizeScroll = () => {
            setTimeout(() => {
                setIsReady(true);
            }, 250);
        };

        if (messageList.length === 0) {
            if (!isReady) finalizeScroll();
            return;
        }

        if (!containerRef.current) return;

        if (isFetchingRef.current) {
            const newScrollHeight = containerRef.current.scrollHeight;
            const diff = newScrollHeight - prevScrollHeightRef.current;
            containerRef.current.scrollTop = diff; 
            isFetchingRef.current = false;
            setIsReady(true); 
        } else if (isFirstLoadRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            isFirstLoadRef.current = false;
            finalizeScroll();
        } else {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            setIsReady(true);
        }
    }, [messageList, messageLoading]);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight } = e.target;
        if (scrollTop === 0 && hasMore && !messageLoading) {
            isFetchingRef.current = true;
            prevScrollHeightRef.current = scrollHeight;
            fetchMessages(activeConversationId);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateDivider = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) return "Hôm nay";

        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";

        return date.toLocaleDateString('vi-VN', {
            day: 'numeric',
            month: 'long',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    const getAvatarSrc = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    // Tìm partner của cuộc trò chuyện 1-1
    const isGroup = currentConvo?.isGroup;
    let partner = null;

    if (!isGroup && currentConvo?.participants) {
        partner = currentConvo.participants.find(p => p && p._id && currentUser && p._id !== currentUser._id) || currentConvo.participants[0];
    }

    if (partner && partner._id && Array.isArray(friends) && friends.length > 0) {
        const friendObj = friends.find(f => f && f._id && (f._id === partner._id || f._id === partner._id?.toString()));
        if (friendObj) {
            partner = { ...partner, ...friendObj };
        }
    }

    const getSenderInfo = (senderId) => {
        if (!senderId) return { name: "Unknown User", avatar: defaultAvatar };
        const senderIdStr = senderId.toString();

        let participant = null;
        if (currentConvo?.participants && Array.isArray(currentConvo.participants)) {
            participant = currentConvo.participants.find(p => {
                if (!p) return false;
                if (p._id && p._id.toString() === senderIdStr) return true;
                if (p.userId) {
                    const uId = typeof p.userId === 'object' ? p.userId._id?.toString() : p.userId.toString();
                    if (uId === senderIdStr) return true;
                }
                return false;
            });
        }

        let sender = null;
        if (participant) {
            if (participant.userId && typeof participant.userId === 'object') {
                sender = { ...participant.userId, ...participant };
            } else {
                sender = participant;
            }
        }

        if (Array.isArray(friends) && friends.length > 0) {
            const friend = friends.find(f => f && f._id && f._id?.toString() === senderIdStr);
            if (friend) {
                sender = sender ? { ...sender, ...friend } : friend;
            }
        }

        if (!sender && currentUser && currentUser._id?.toString() === senderIdStr) {
            sender = currentUser;
        }

        return {
            name: sender?.displayName || sender?.username || "Người dùng",
            avatar: getAvatarSrc(sender?.avatarURL)
        };
    };

    return (
        <div
            className={cx('chat-body-wrapper')}
            ref={containerRef}
            onScroll={handleScroll}
            style={{ 
                opacity: isReady ? 1 : 0,
                visibility: isReady ? 'visible' : 'hidden'
            }}
        >
            {!isReady ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <LoadingSpin size={30} />
                </div>
            ) : (
                <div className={cx('messages-inner-container')}>
                    {/* Active Group Call Live Banner */}
                    {isGroup && activeConversationId && (
                        <GroupCallBanner
                            conversationId={activeConversationId}
                            groupInfo={{
                                _id: currentConvo?._id,
                                name: currentConvo?.name || currentConvo?.group?.name || 'Nhóm',
                                avatarURL: currentConvo?.avatarURL || currentConvo?.group?.avatarURL,
                                participantsCount: currentConvo?.participants?.length || 0,
                            }}
                        />
                    )}

                    {/* Older messages loading */}
                    {messageLoading && messageList.length > 0 && (
                        <div style={{ textAlign: 'center', padding: '1.2rem', display: 'flex', justifyContent: 'center' }}>
                            <LoadingSpin size={20} />
                        </div>
                    )}

                    {/* X-Style Profile Card on top of messages thread */}
                    {!isGroup && partner && (
                        <div className={cx('x-profile-banner')}>
                            <div className={cx('banner-avatar-box')}>
                                <img
                                    src={getAvatarSrc(partner.avatarURL)}
                                    alt={partner.displayName}
                                    className={cx('banner-avatar')}
                                    onError={(e) => { e.target.src = defaultAvatar; }}
                                />
                            </div>
                            <h3 className={cx('banner-name')}>{partner.displayName || "Người dùng"}</h3>
                            {partner.username && <p className={cx('banner-username')}>@{partner.username}</p>}
                            
                            {partner.bio && <p className={cx('banner-bio')}>{partner.bio}</p>}

                            {partner.university && (
                                <div className={cx('banner-meta')}>
                                    <GraduationCap size={15} />
                                    <span>{partner.university}</span>
                                </div>
                            )}

                            {partner.createdAt && (
                                <div className={cx('banner-meta')}>
                                    <Calendar size={14} />
                                    <span>Đã tham gia {new Date(partner.createdAt).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</span>
                                </div>
                            )}

                            <button
                                type="button"
                                className={cx('banner-profile-btn')}
                                onClick={() => navigate(`/feed/profile/${partner._id}`)}
                            >
                                Xem trang cá nhân
                            </button>

                            <p className={cx('banner-divider-note')}>
                                Đây là phần đầu của lịch sử tin nhắn trực tiếp giữa bạn và {partner.displayName || partner.username}.
                            </p>
                        </div>
                    )}

                    {/* Messages with Date Separators */}
                    {messageList.map((message, index) => {
                        const senderId = typeof message.senderId === 'object'
                            ? message.senderId?._id
                            : message.senderId;

                        const isMe = message.isOwn !== undefined
                            ? message.isOwn
                            : currentUser?._id && senderId === currentUser._id;

                        const senderInfo = isMe ? {} : getSenderInfo(senderId);

                        // Date divider check
                        const prevMessage = index > 0 ? messageList[index - 1] : null;
                        const showDateDivider = !prevMessage || (
                            new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString()
                        );

                        return (
                            <React.Fragment key={message._id || index}>
                                {showDateDivider && (
                                    <div className={cx('date-divider')}>
                                        <span className={cx('date-pill')}>
                                            {formatDateDivider(message.createdAt)}
                                        </span>
                                    </div>
                                )}
                                <Message
                                    senderName={isMe ? 'Bạn' : senderInfo.name}
                                    avatar={isMe ? getAvatarSrc(currentUser?.avatarURL) : senderInfo.avatar}
                                    text={message.content}
                                    image={message.imgUrl}
                                    messageType={message.messageType}
                                    fileUrl={message.fileUrl}
                                    isGroup={currentConvo?.isGroup}
                                    time={formatTime(message.createdAt)}
                                    isMe={isMe}
                                    reactions={message.reactions || []}
                                    onReact={(emoji) =>
                                        reactToMessageAction(
                                            message._id,
                                            emoji,
                                            activeConversationId
                                        )
                                    }
                                    isRecalled={message.isRecalled}
                                    isPinned={message.isPinned}
                                    isForwarded={message.isForwarded}
                                    messageId={message._id}
                                    createdAt={message.createdAt}
                                    callId={message.callId}
                                    callStatus={message.callStatus}
                                    callDuration={message.callDuration}
                                    poll={message.poll}
                                />
                            </React.Fragment>
                        );
                    })}

                    <div ref={endOfMessagesRef} />
                </div>
            )}
        </div>
    );
};

export default ChatBody;