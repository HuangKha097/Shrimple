import {useAuthStore} from "../stores/useAuthStore.js";
import axios from "axios";
import { useUIStore } from "../stores/useUIStore.js";
import { API_URL } from "../config/env.js";

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
});

// gắn access token vào req header
api.interceptors.request.use((config) => {
    const {accessToken} = useAuthStore.getState();
    
    // Only show global loading if explicitly requested
    if (config.globalLoading) {
        useUIStore.getState().startLoading();
    }

    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
});

// tự động gọi refresh api khi access token hết hạn
api.interceptors.response.use(
    (res) => {
        if (res.config?.globalLoading) {
            useUIStore.getState().stopLoading();
        }
        return res;
    },
    async (error) => {
        if (error.config?.globalLoading) {
            useUIStore.getState().stopLoading();
        }
        const originalRequest = error.config;

        // những api không cần check
        if (originalRequest.url.includes("/api/auth/")) {
            return Promise.reject(error);
        }

        originalRequest._retryCount = originalRequest._retryCount || 0;

        if ((error.response?.status === 403 || error.response?.status === 401) && originalRequest._retryCount < 4) {
            originalRequest._retryCount += 1;

            try {
                const res = await api.post("/api/auth/refresh", {withCredentials: true});
                const newAccessToken = res.data.accessToken;

                useAuthStore.getState().setAccessToken(newAccessToken);

                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                useAuthStore.getState().clearState();
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
