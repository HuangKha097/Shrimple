import React, { useEffect, useState } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/BodyChatList.module.scss';

import FriendRequestCard from "../../components/chat/FriendRequestCard.jsx";
import { useChatStore } from "../../stores/useChatStore.js";
import { toast } from "sonner";
import { UserX } from 'lucide-react';
import LoadingSpin from "../common/loading/LoadingSpin.jsx";

const cx = classNames.bind(styles);

const BodyRequests = () => {
    const {
        friendRequests,
        fetchFriendRequests,
        isFriendRequestsLoading, // Biến này quan trọng
        acceptRequestAction,
        declineRequestAction
    } = useChatStore();

    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        fetchFriendRequests();
    }, [fetchFriendRequests]);

    const handleAccept = async (requestId) => {
        setProcessingId(requestId);
        try {
            await acceptRequestAction(requestId);
            toast.success("Đã chấp nhận lời mời!");
            // Không cần gọi removeFriendRequest thủ công nữa, Store tự làm
        } catch (error) {
            console.error(error);
            toast.error("Lỗi khi chấp nhận kết bạn");
        } finally {
            setProcessingId(null);
        }
    };

    const handleDecline = async (requestId) => {
        setProcessingId(requestId);
        try {
            await declineRequestAction(requestId);
            toast.success("Đã từ chối lời mời.");
        } catch (error) {
            console.error(error);
            toast.error("Lỗi khi từ chối");
        } finally {
            setProcessingId(null);
        }
    };

    const safeRequests = Array.isArray(friendRequests) ? friendRequests : [];

    return (
        <div className={cx('body-requests-container')}>
            <div className={cx('list-container')}>

                {/* 2. Sử dụng LoadingSpin khi đang tải */}
                {isFriendRequestsLoading && (
                    <LoadingSpin fullHeight={true} />
                )}

                {/* Case: Danh sách trống */}
                {!isFriendRequestsLoading && safeRequests.length === 0 && (
                    <div className={cx('empty-state')}>
                        <div style={{padding: 20, textAlign: 'center', color: '#888'}}>No friend request yet!</div>
                    </div>
                )}
                {!isFriendRequestsLoading && safeRequests.map((req) => (
                    <FriendRequestCard
                        key={req._id}
                        request={req}
                        onAccept={handleAccept}
                        onDecline={handleDecline}
                        isProcessing={processingId === req._id}
                    />
                ))}
            </div>
        </div>
    );
};

export default BodyRequests;