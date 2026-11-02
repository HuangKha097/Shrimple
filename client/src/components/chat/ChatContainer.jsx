import MotionPresence from '../common/MotionPresence';
import React from 'react';

import classNames from 'classnames/bind';
import styles from '../../assets/css/ChatContainer.module.scss';
import ChatHeader from "./ChatHeader.jsx";
import ChatBody from "./ChatBody.jsx";
import ChatInput from "./ChatInput.jsx";
import ChatInfo from "./ChatInfo.jsx";
import { useChatStore } from "../../stores/useChatStore.js";
import { Navigate, useSearchParams } from 'react-router-dom';

const cx = classNames.bind(styles);

const ChatContainer = ({ onCloseChatInfo, isShowChatInfo }) => {
    const { activeConversationId, setActiveConversationId, conversations, fetchConversations } = useChatStore();
    const [searchParams] = useSearchParams();

    // Đồng bộ URL -> Store
    React.useEffect(() => {
        const idFromUrl = searchParams.get('id');
        if (idFromUrl && conversations.some(c => c._id === idFromUrl)) {
            if (idFromUrl !== activeConversationId) {
                setActiveConversationId(idFromUrl);
            }
        } else if (activeConversationId) {
            setActiveConversationId(null);
        }
    }, [searchParams, activeConversationId, setActiveConversationId, conversations]);

    // Nếu có activeConversationId nhưng chưa có trong conversations (vd: reload trang), fetch conversations
    React.useEffect(() => {
        if (activeConversationId && (!conversations || conversations.length === 0)) {
            if (fetchConversations) fetchConversations();
        }
    }, [activeConversationId, conversations, fetchConversations]);

    // Logic tìm conversation
    const selectedConvo = (conversations || []).find(conversation => conversation && conversation._id === activeConversationId);

    const invite = searchParams.get('invite');
    if (searchParams.has('joinGroup') && /^(?:[a-f0-9]{64}|[a-f0-9]{24})$/i.test(invite || '')) {
        return <Navigate to={`/groups/join/${invite}`} replace />;
    }

    // X-Style Empty State: "Select a message"
    if (!selectedConvo) {
        return (
            <div className={cx('x-empty-state-container')}>
                <div className={cx('empty-content-box')}>
                    <h2 className={cx('empty-title')}>Chọn một tin nhắn</h2>
                    <p className={cx('empty-subtitle')}>
                        Chọn từ các cuộc trò chuyện hiện có của bạn, bắt đầu một cuộc trò chuyện mới hoặc tiếp tục kết nối.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={cx('chat-container-wrapper')}>
            <div className={cx("block-left")}>
                <div className={cx("header")}>
                    <ChatHeader onCloseChatInfo={onCloseChatInfo} chat={selectedConvo} />
                </div>

                <div className={cx("body")}>
                    <ChatBody />
                </div>

                <div className={cx("footer")}>
                    <ChatInput />
                </div>
            </div>

            <MotionPresence open={isShowChatInfo} className={cx("block-right")}>
                <div className={cx("chat-info-wrapper")}>
                    <ChatInfo key={selectedConvo._id} chat={selectedConvo} onClose={onCloseChatInfo} />
                </div>
            </MotionPresence>
        </div>
    );
};

export default ChatContainer;
