import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatBody.module.scss';
import Message from './Message.jsx';
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import defaultAvatar from "../../../public/favicon.png";
import LoadingSpin from "../common/loading/LoadingSpin.jsx";
import GroupCallBanner from "./GroupCallBanner.jsx";
import { ChatDrawScrollLayer } from "./ChatDrawOverlay.jsx";
import { useNavigate } from 'react-router-dom';
import { Calendar, GraduationCap, Users, ArrowDown } from 'lucide-react';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);
const EMPTY_MESSAGES = [];

const ChatBody = () => {
    const { messages, activeConversationId, conversations, fetchMessages, reactToMessageAction, friends, messageLoading } = useChatStore();
    const { user: currentUser } = useAuthStore();
    const navigate = useNavigate();
    const endOfMessagesRef = useRef(null);

    const currentConvo = conversations.find(c => c._id === activeConversationId);
    const currentMessagesData = messages[activeConversationId];
    const messageList = currentMessagesData?.items || EMPTY_MESSAGES;
    const hasMore = Boolean(currentMessagesData?.hasMore);
    const isInitialized = Boolean(currentMessagesData?.initialized);

    const containerRef = useRef(null);
    const innerRef = useRef(null);

    const lastConvoIdRef = useRef(null);
    const prevFirstMsgIdRef = useRef(null);
    const prevLastMsgIdRef = useRef(null);
    const prevMsgLenRef = useRef(0);
    const prevScrollHeightRef = useRef(0);
    const prevScrollTopRef = useRef(0);
    const isLoadingOlderRef = useRef(false);
    const stickToBottomRef = useRef(true);

    const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
    const [unreadBelowCount, setUnreadBelowCount] = useState(0);

    const getSenderIdStr = (msg) => {
        if (!msg) return '';
        const raw = typeof msg.senderId === 'object' ? msg.senderId?._id : msg.senderId;
        return raw ? raw.toString() : '';
    };

    // Fetch initial batch (20 newest messages) when entering a conversation
    useEffect(() => {
        if (activeConversationId && !isInitialized) {
            fetchMessages(activeConversationId, { loadMore: false });
        }
    }, [activeConversationId, isInitialized, fetchMessages]);

    // Clear loading lock when fetch finishes
    useEffect(() => {
        if (!messageLoading && isLoadingOlderRef.current) {
            isLoadingOlderRef.current = false;
        }
    }, [messageLoading]);

    // Synchronously position scroll BEFORE browser paint
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const isNewConvo = lastConvoIdRef.current !== activeConversationId;

        if (isNewConvo) {
            prevFirstMsgIdRef.current = null;
            prevLastMsgIdRef.current = null;
            prevMsgLenRef.current = 0;
            isLoadingOlderRef.current = false;
            stickToBottomRef.current = true;
            setShowScrollBottomBtn(false);
            setUnreadBelowCount(0);

            if (messageList.length > 0 || isInitialized) {
                container.scrollTop = container.scrollHeight;
                requestAnimationFrame(() => {
                    if (containerRef.current && stickToBottomRef.current) {
                        containerRef.current.scrollTop = containerRef.current.scrollHeight;
                    }
                });
                lastConvoIdRef.current = activeConversationId;
                prevFirstMsgIdRef.current = messageList[0]?._id ?? null;
                prevLastMsgIdRef.current = messageList[messageList.length - 1]?._id ?? null;
                prevMsgLenRef.current = messageList.length;
            }
            return;
        }

        const currentFirstId = messageList[0]?._id ?? null;
        const currentLastId = messageList[messageList.length - 1]?._id ?? null;
        const prevFirstId = prevFirstMsgIdRef.current;
        const prevLastId = prevLastMsgIdRef.current;
        const prevLen = prevMsgLenRef.current;

        // 1. Older messages prepended at top (Messenger-style upward infinite scroll)
        if (
            messageList.length > prevLen &&
            prevFirstId &&
            currentFirstId !== prevFirstId &&
            currentLastId === prevLastId
        ) {
            const newScrollHeight = container.scrollHeight;
            const heightDiff = newScrollHeight - prevScrollHeightRef.current;
            container.scrollTop = prevScrollTopRef.current + heightDiff;
            isLoadingOlderRef.current = false;
        }
        // 2. New message(s) appended at bottom
        else if (
            messageList.length > prevLen &&
            currentLastId !== prevLastId
        ) {
            const lastMsg = messageList[messageList.length - 1];
            const senderIdStr = getSenderIdStr(lastMsg);
            const isMyNewMsg = Boolean(
                lastMsg?.isOwn || (currentUser?._id && senderIdStr === currentUser._id.toString())
            );

            if (isMyNewMsg || stickToBottomRef.current) {
                container.scrollTop = container.scrollHeight;
                requestAnimationFrame(() => {
                    if (containerRef.current) {
                        containerRef.current.scrollTop = containerRef.current.scrollHeight;
                    }
                });
                stickToBottomRef.current = true;
                setShowScrollBottomBtn(false);
                setUnreadBelowCount(0);
            } else {
                setUnreadBelowCount((c) => c + (messageList.length - prevLen));
            }
        }

        prevFirstMsgIdRef.current = currentFirstId;
        prevLastMsgIdRef.current = currentLastId;
        prevMsgLenRef.current = messageList.length;
    }, [activeConversationId, messageList, isInitialized, currentUser?._id]);

    // Keep pinned to newest message when images/embeds inside messages finish loading
    useEffect(() => {
        const innerEl = innerRef.current;
        const container = containerRef.current;
        if (!innerEl || !container) return;

        const observer = new ResizeObserver(() => {
            if (stickToBottomRef.current && !isLoadingOlderRef.current) {
                container.scrollTop = container.scrollHeight;
            }
        });

        observer.observe(innerEl);
        return () => observer.disconnect();
    }, [activeConversationId, isInitialized]);

    const handleScroll = (e) => {
        const container = e.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = container;

        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const isNearBottom = distanceFromBottom < 80;
        stickToBottomRef.current = isNearBottom;
        setShowScrollBottomBtn(distanceFromBottom > 280);
        if (isNearBottom && unreadBelowCount > 0) {
            setUnreadBelowCount(0);
        }

        // Trigger upward infinite load when scrolling near the top
        if (
            scrollTop <= 70 &&
            hasMore &&
            !messageLoading &&
            !isLoadingOlderRef.current &&
            lastConvoIdRef.current === activeConversationId
        ) {
            isLoadingOlderRef.current = true;
            prevScrollHeightRef.current = scrollHeight;
            prevScrollTopRef.current = scrollTop;
            fetchMessages(activeConversationId, { loadMore: true });
        }
    };

    const scrollToBottom = () => {
        const container = containerRef.current;
        if (!container) return;
        stickToBottomRef.current = true;
        setShowScrollBottomBtn(false);
        setUnreadBelowCount(0);
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
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
        if (!senderId) return { name: "Người dùng", avatar: defaultAvatar };
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

    const groupDisplayName = currentConvo?.name || currentConvo?.group?.name || 'Nhóm trò chuyện';
    const groupParticipants = currentConvo?.participants || [];
    const isInitialLoading = !isInitialized && messageLoading && messageList.length === 0;

    return (
        <div
            className={cx('chat-body-wrapper')}
            ref={containerRef}
            onScroll={handleScroll}
        >
            {isInitialLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <LoadingSpin size={30} />
                </div>
            ) : (
                <div ref={innerRef} data-chat-inner="true" className={cx('messages-inner-container')}>
                    {activeConversationId && (
                        <ChatDrawScrollLayer
                            conversationId={activeConversationId}
                            innerRef={innerRef}
                        />
                    )}
                    {/* Active Group Call Live Banner */}
                    {isGroup && activeConversationId && (
                        <GroupCallBanner
                            conversationId={activeConversationId}
                            groupInfo={{
                                _id: currentConvo?._id,
                                name: groupDisplayName,
                                avatarURL: currentConvo?.avatarURL || currentConvo?.group?.avatarURL,
                                participantsCount: groupParticipants.length,
                            }}
                        />
                    )}

                    {/* Older messages loading indicator (Messenger-style top spinner) */}
                    {messageLoading && messageList.length > 0 && (
                        <div className={cx('older-messages-loader')}>
                            <LoadingSpin size={18} />
                            <span>Đang tải tin nhắn cũ hơn...</span>
                        </div>
                    )}

                    {/* Group Welcome Header at top of Group Thread (only when all history is loaded) */}
                    {isGroup && !hasMore && (
                        <div className={cx('x-profile-banner', 'group-banner')}>
                            <div className={cx('banner-avatar-box')}>
                                {currentConvo?.avatarURL || currentConvo?.group?.avatarURL ? (
                                    <img
                                        src={getAvatarSrc(currentConvo.avatarURL || currentConvo.group?.avatarURL)}
                                        alt={groupDisplayName}
                                        className={cx('banner-avatar')}
                                        onError={(e) => { e.target.src = defaultAvatar; }}
                                    />
                                ) : (
                                    <div className={cx('banner-group-stack')}>
                                        <img
                                            src={getSenderInfo(groupParticipants[0]?._id).avatar}
                                            alt=""
                                            className={cx('stack-img', 'first')}
                                            onError={(e) => { e.target.src = defaultAvatar; }}
                                        />
                                        {groupParticipants.length > 1 && (
                                            <img
                                                src={getSenderInfo(groupParticipants[1]?._id).avatar}
                                                alt=""
                                                className={cx('stack-img', 'second')}
                                                onError={(e) => { e.target.src = defaultAvatar; }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                            <h3 className={cx('banner-name')}>{groupDisplayName}</h3>
                            <div className={cx('banner-meta')}>
                                <Users size={14} />
                                <span>{groupParticipants.length} thành viên</span>
                            </div>
                            {currentConvo?.group?.descriptionGroup && (
                                <p className={cx('banner-bio')}>{currentConvo.group.descriptionGroup}</p>
                            )}
                            <p className={cx('banner-divider-note')}>
                                Đây là điểm bắt đầu của cuộc trò chuyện nhóm <strong>{groupDisplayName}</strong>.
                            </p>
                        </div>
                    )}

                    {/* X-Style Profile Card on top of 1-1 messages thread (only when all history is loaded) */}
                    {!isGroup && partner && !hasMore && (
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

                    {/* Messages with Date Separators & Smart Grouping */}
                    {messageList.map((message, index) => {
                        const senderIdStr = getSenderIdStr(message);

                        const isMe = message.isOwn !== undefined
                            ? message.isOwn
                            : Boolean(currentUser?._id && senderIdStr === currentUser._id.toString());

                        const senderInfo = isMe ? {} : getSenderInfo(senderIdStr);

                        // Date divider check
                        const prevMessage = index > 0 ? messageList[index - 1] : null;
                        const nextMessage = index < messageList.length - 1 ? messageList[index + 1] : null;

                        const showDateDivider = !prevMessage || (
                            new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString()
                        );

                        const nextHasDateDivider = !nextMessage || (
                            new Date(nextMessage.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
                        );

                        const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

                        const isSameSenderAsPrev = Boolean(
                            !showDateDivider &&
                            prevMessage &&
                            getSenderIdStr(prevMessage) === senderIdStr &&
                            Math.abs(new Date(message.createdAt) - new Date(prevMessage.createdAt)) < GROUP_THRESHOLD_MS
                        );

                        const isSameSenderAsNext = Boolean(
                            !nextHasDateDivider &&
                            nextMessage &&
                            getSenderIdStr(nextMessage) === senderIdStr &&
                            Math.abs(new Date(nextMessage.createdAt) - new Date(message.createdAt)) < GROUP_THRESHOLD_MS
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
                                    isFirstInGroup={!isSameSenderAsPrev}
                                    isLastInGroup={!isSameSenderAsNext}
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

            {showScrollBottomBtn && (
                <button
                    type="button"
                    className={cx('scroll-bottom-btn', { 'has-unread': unreadBelowCount > 0 })}
                    onClick={scrollToBottom}
                    title="Cuộn xuống tin nhắn mới nhất"
                >
                    <ArrowDown size={18} />
                    {unreadBelowCount > 0 && (
                        <span className={cx('unread-pill')}>
                            {unreadBelowCount > 99 ? '99+' : `${unreadBelowCount} tin nhắn mới`}
                        </span>
                    )}
                </button>
            )}
        </div>
    );
};

export default ChatBody;
