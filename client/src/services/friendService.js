import api from "../lib/axios.js";

export const friendService = {
    // 1. Tìm kiếm (Sau này nên chuyển qua userService, nhưng tạm để đây ok)
    findUserByUsername: async (username) => {
        const res = await api.get("/api/users/get-user-by-username", {
            params: { username },
            withCredentials: true
        });
        return res.data;
    },

    // 2. Gửi lời mời
    sendRequest: async (targetUserId) => {
        const res = await api.post("/api/friends/request", {
            to: targetUserId,
            message: "Hi, can we be friend!"
        });
        return res.data;
    },

    // 3. Lấy danh sách lời mời (Backend trả về { sent, received })
    getFriendRequests: async () => {
        const res = await api.get("/api/friends/requests");
        return res.data;
    },

    // 4. Chấp nhận lời mời
    acceptRequest: async (requestId) => {
        const res = await api.post(`/api/friends/request/${requestId}/accept`);
        return res.data;
    },

    // 5. Từ chối lời mời
    declineRequest: async (requestId) => {
        const res = await api.post(`/api/friends/request/${requestId}/decline`);
        return res.data;
    },

    // --- CÁC HÀM BỔ SUNG (QUAN TRỌNG) ---

    // 6. Lấy danh sách bạn bè (Cần cái này để check nút Add/Friend)
    getFriends: async () => {
        const res = await api.get("/api/friends");
        return res.data;
    },

    // 7. Hủy kết bạn
    unfriend: async (friendId) => {
        const res = await api.post(`/api/friends/unFriend/${friendId}`);
        return res.data;
    },

    // 8. Chặn người dùng
    blockUser: async (userId) => {
        const res = await api.post(`/api/friends/block/${userId}`);
        return res.data;
    },

    // 9. Lấy gợi ý kết bạn
    getSuggestedFriends: async () => {
        const res = await api.get("/api/friends/suggestions");
        return res.data;
    }
};