import { create } from "zustand";
import api from "../lib/axios.js";
import { useAuthStore } from "./useAuthStore.js";
import { toast } from "sonner";

export const useNotificationStore = create((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,

    fetchNotifications: async () => {
        set({ isLoading: true });
        try {
            const res = await api.get("/api/notifications");
            const notifs = res.data || [];
            const unread = notifs.filter(n => !n.isRead).length;
            set({ notifications: notifs, unreadCount: unread });
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    markAsRead: async (id) => {
        try {
            await api.put(`/api/notifications/${id}/read`);
            set(state => {
                const updated = state.notifications.map(n =>
                    n._id === id ? { ...n, isRead: true } : n
                );
                return {
                    notifications: updated,
                    unreadCount: updated.filter(n => !n.isRead).length,
                };
            });
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
        }
    },

    markAllAsRead: async () => {
        try {
            await api.put("/api/notifications/read-all");
            set(state => ({
                notifications: state.notifications.map(n => ({ ...n, isRead: true })),
                unreadCount: 0,
            }));
        } catch (error) {
            console.error("Failed to mark all as read:", error);
        }
    },

    addNotification: (notif) => {
        set(state => {
            const exists = state.notifications.some(n => n._id === notif._id);
            if (exists) return state;
            const nextList = [notif, ...state.notifications];
            return {
                notifications: nextList,
                unreadCount: state.unreadCount + 1,
            };
        });
    },

    subscribeToNotificationEvents: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newNotification");
        socket.on("newNotification", (notif) => {
            get().addNotification(notif);

            const senderName = notif.sender?.displayName || notif.sender?.username || "Ai đó";
            let message = "";
            if (notif.type === "like") {
                message = `${senderName} đã thích bài viết của bạn.`;
            } else if (notif.type === "comment") {
                message = `${senderName} đã bình luận: "${notif.text}"`;
            } else if (notif.type === "reply") {
                message = `${senderName} đã phản hồi bình luận: "${notif.text}"`;
            } else {
                message = `${senderName} đã gửi cho bạn một thông báo.`;
            }

            toast.info(message, {
                duration: 4000,
            });
        });
    },

    unsubscribeFromNotificationEvents: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;
        socket.off("newNotification");
    },
}));
