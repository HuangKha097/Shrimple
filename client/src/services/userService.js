import api from "../lib/axios.js";

export const userService = {
    // 1. Lấy danh sách lời mời kết bạn (GET /requests)
    getFriendRequests: async () => {
        const res = await api.get("/api/friends/requests");
        return res.data;
    },

    // 2. Lấy danh sách bạn bè hiện tại (GET /)
    getFriends: async () => {
        const res = await api.get("/api/friends");
        return res.data;
    },

    // 3. Gửi lời mời kết bạn (POST /request)
    sendRequest: async (targetUserId) => {
        // Không cần try-catch ở đây nếu bạn muốn handle lỗi ở component
        const res = await api.post("/api/friends/request", {
            to: targetUserId,
            message: "Hi, can we be friend!" // Message mặc định
        });
        return res.data;
    },

    // 4. Chấp nhận lời mời (POST /request/:requestId/accept)
    acceptRequest: async (requestId) => {
        const res = await api.post(`/api/friends/request/${requestId}/accept`);
        return res.data;
    },

    // 5. Từ chối lời mời (POST /request/:requestId/decline)
    declineRequest: async (requestId) => {
        const res = await api.post(`/api/friends/request/${requestId}/decline`);
        return res.data;
    },

    // 6. Hủy kết bạn (POST /unFriend/:friendId)
    unfriend: async (friendId) => {
        const res = await api.post(`/api/friends/unFriend/${friendId}`);
        return res.data;
    },

    // 7. Chặn user (POST /block/:userId)
    blockUser: async (userId) => {
        const res = await api.post(`/api/friends/block/${userId}`);
        return res.data;
    }
};