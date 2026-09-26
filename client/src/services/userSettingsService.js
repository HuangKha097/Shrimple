import api from "../lib/axios.js";

export const userSettingsService = {
    // Settings
    updateSettings: async (settings) => {
        const res = await api.put("/api/users/settings", settings);
        return res.data;
    },

    // Blocking
    getBlockedUsers: async () => {
        const res = await api.get("/api/users/blocked");
        return res.data;
    },
    blockUser: async (userId) => {
        const res = await api.post("/api/users/block", { userId });
        return res.data;
    },
    unblockUser: async (userId) => {
        const res = await api.post("/api/users/unblock", { userId });
        return res.data;
    },
    updatePrivacy: async (privacyData) => {
        const res = await api.put("/api/users/privacy", privacyData);
        return res.data;
    },
    deleteAccount: async () => {
        const res = await api.delete("/api/users/account");
        return res.data;
    }
};
