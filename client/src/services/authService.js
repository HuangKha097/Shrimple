import api from "../lib/axios.js";

export const authService = {
    signUp: async ({ fullName, password, email }) => {
        const res = await api.post("/api/auth/signup", {
            fullName,
            password,
            email
        }, {withCredentials: true, globalLoading: true})
        return res.data;
    },
    verifyEmailSignupOtp: async (pendingToken, otp) => {
        const res = await api.post("/api/auth/signup/verify-otp", { pendingToken, otp }, { withCredentials: true, globalLoading: true });
        return res.data;
    },
    resendEmailSignupOtp: async (pendingToken) => {
        const res = await api.post("/api/auth/signup/resend-otp", { pendingToken }, { withCredentials: true });
        return res.data;
    },

    signIn: async (email, password) => {
        const res = await api.post("/api/auth/signin", {
            email,
            password
        }, {withCredentials: true, globalLoading: true})
        return res.data; // accessToken
    },

    signOut: async () => {
        return await api.post("/api/auth/signout", {}, {withCredentials: true, globalLoading: true})
    },

    fetchMe: async () => {
        const res = await api.get("/api/users/me", {withCredentials: true})

        return res.data.user;
    },
    refresh: async () => {
        const res = await api.post("/api/auth/refresh", {withCredentials: true})
        return res.data.accessToken;
    },

    getUserById: async (userId) => {
        const res = await api.get(`/api/users/${userId}`);
        return res.data;
    },
    updateProfile: async (formData) => {
        const res = await api.put("/api/users/update-profile", formData);
        return res.data;
    },
    changePassword: async (oldPassword, newPassword) => {
        const res = await api.put("/api/auth/change-password", { oldPassword, newPassword }, {withCredentials: true, globalLoading: true});
        return res.data;
    },
    googleLogin: async (idToken) => {
        const res = await api.post("/api/auth/google", { idToken }, { withCredentials: true, globalLoading: true });
        return res.data;
    },
    verifyGoogleOtp: async (pendingToken, otp) => {
        const res = await api.post("/api/auth/google/verify-otp", { pendingToken, otp }, { withCredentials: true, globalLoading: true });
        return res.data;
    },
    resendGoogleOtp: async (pendingToken) => {
        const res = await api.post("/api/auth/google/resend-otp", { pendingToken }, { withCredentials: true });
        return res.data;
    },
    completeProfile: async (profileData) => {
        const res = await api.patch("/api/users/complete-profile", profileData, { withCredentials: true, globalLoading: true });
        return res.data;
    },
    forgotPassword: async (email) => {
        const res = await api.post("/api/auth/forgot-password", { email }, { withCredentials: true, globalLoading: true });
        return res.data;
    },
    verifyOtp: async (email, otp) => {
        const res = await api.post("/api/auth/verify-otp", { email, otp }, { withCredentials: true, globalLoading: true });
        return res.data;
    },
    resetPassword: async (email, otp, newPassword) => {
        const res = await api.post("/api/auth/reset-password", { email, otp, newPassword }, { withCredentials: true, globalLoading: true });
        return res.data;
    }
}
