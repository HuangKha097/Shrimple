import {create} from "zustand";
import {persist} from "zustand/middleware";
import {toast} from "sonner";
import {authService} from "../services/authService.js";
import {useChatStore} from "./useChatStore.js";
import {useCallStore} from "./useCallStore.js";
import {useGroupCallStore} from "./useGroupCallStore.js";
import {useNotificationStore} from "./useNotificationStore.js";
import {useUIStore} from "./useUIStore.js";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config/env.js";

// Keep appearance preferences when clearing account/session data.
const clearStorageKeepingTheme = () => {
    const theme = localStorage.getItem('theme-storage');
    localStorage.clear();
    if (theme) localStorage.setItem('theme-storage', theme);
};

export const useAuthStore = create(
    persist(
        (set, get) => ({
            accessToken: null,
            user: null,
            loading: false,
            socket: null,
            onlineUsers: [],

            checkAuth: async () => { await get().fetchMe(); },

            signUp: async (profileData) => {
                try {
                    set({loading: true});
                    const res = await authService.signUp(profileData);
                    if (res.requiresOtp) {
                        toast.success(res.message || "Verification code sent.");
                        return {
                            success: true,
                            requiresOtp: true,
                            pendingToken: res.pendingToken,
                            email: res.email
                        };
                    }
                    clearStorageKeepingTheme();
                    localStorage.setItem("accessToken", res.accessToken);
                    set({ accessToken: res.accessToken, user: res.user });
                    toast.success(res.message || "Sign Up Successfully!");
                    return { success: true };
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Sign Up Failed!";
                    toast.error(errorMsg);
                    return { success: false };
                } finally {
                    set({loading: false});
                }
            },

            verifyEmailSignupOtp: async (pendingToken, otp) => {
                try {
                    set({ loading: true });
                    const res = await authService.verifyEmailSignupOtp(pendingToken, otp);
                    clearStorageKeepingTheme();
                    localStorage.setItem("accessToken", res.accessToken);
                    set({ accessToken: res.accessToken, user: res.user });
                    toast.success(res.message || "Email verified.");
                    return { success: true, user: res.user };
                } catch (err) {
                    toast.error(err.response?.data?.message || "Verification failed.");
                    return { success: false };
                } finally {
                    set({ loading: false });
                }
            },

            resendEmailSignupOtp: async (pendingToken) => {
                try {
                    const res = await authService.resendEmailSignupOtp(pendingToken);
                    toast.success(res.message || "A new code was sent.");
                    return { success: true };
                } catch (err) {
                    toast.error(err.response?.data?.message || "Could not resend the code.");
                    return { success: false };
                }
            },


            signIn: async (email, password) => {
                try {
                    set({loading: true});

                    // xoá dữ liệu cũ, Phòng lỗi user bị văng khi chưa logout
                    clearStorageKeepingTheme()
                    useChatStore.getState().reset()

                    const res = await authService.signIn(email, password);
                    const {accessToken, message} = res;

                    if (accessToken) {
                        localStorage.setItem("accessToken", accessToken);
                    }

                    get().setAccessToken(accessToken);
                    await get().fetchMe(); // This will connect socket now inside fetchMe or explicitly here

                    await useChatStore.getState().fetchConversations()
                    await useChatStore.getState().fetchFriends()
                    await useChatStore.getState().fetchFriendRequests()

                    get().connectSocket(); // Ensure connection

                    toast.success(message || "Sign In successfully!");
                    return {success: true};
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Sign In Failed!";
                    toast.error(errorMsg);
                    return {success: false};
                } finally {
                    set({loading: false});
                }
            },

            signOut: async () => {
                try {
                    // Attempt to sign out on server, but limit wait to 1 second
                    // This prevents "infinite spinner" if server is unresponsive
                    await Promise.race([
                        authService.signOut(),
                        new Promise((resolve) => setTimeout(resolve, 1000))
                    ]);
                    
                    toast.success("Sign Out Successfully!");
                } catch (error) {
                    console.error("Sign Out API Failed or Timed Out:", error);
                } finally {
                    // Ensure global loading is turned off even if the request is still pending in background
                    useUIStore.getState().stopLoading(); 
                    
                    get().disconnectSocket();
                    get().clearState();
                }
            },


            googleLogin: async (idToken) => {
                try {
                    set({loading: true});
                    const res = await authService.googleLogin(idToken);
                    if (res.requiresOtp) {
                        toast.success(res.message || "Verification code sent.");
                        return {
                            success: true,
                            requiresOtp: true,
                            pendingToken: res.pendingToken,
                            email: res.email
                        };
                    }
                    const {accessToken, user, message} = res;

                    if (accessToken) {
                        localStorage.setItem("accessToken", accessToken);
                    }

                    set({accessToken, user});
                    get().connectSocket();

                    toast.success(message || "Login with Google successfully!");
                    return {success: true, isProfileComplete: user.isProfileComplete};
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Google Login Failed!";
                    toast.error(errorMsg);
                    return {success: false};
                } finally {
                    set({loading: false});
                }
            },

            verifyGoogleOtp: async (pendingToken, otp) => {
                try {
                    set({ loading: true });
                    const res = await authService.verifyGoogleOtp(pendingToken, otp);
                    clearStorageKeepingTheme();
                    localStorage.setItem("accessToken", res.accessToken);
                    set({ accessToken: res.accessToken, user: res.user });
                    toast.success(res.message || "Email verified.");
                    return { success: true, user: res.user };
                } catch (err) {
                    const errorMsg = err.response?.data?.message || "Verification failed.";
                    toast.error(errorMsg);
                    return { success: false };
                } finally {
                    set({ loading: false });
                }
            },

            resendGoogleOtp: async (pendingToken) => {
                try {
                    const res = await authService.resendGoogleOtp(pendingToken);
                    toast.success(res.message || "A new code was sent.");
                    return { success: true };
                } catch (err) {
                    toast.error(err.response?.data?.message || "Could not resend the code.");
                    return { success: false };
                }
            },

            completeProfile: async (profileData) => {
                try {
                    set({loading: true});
                    const res = await authService.completeProfile(profileData);
                    set({user: res.user});
                    toast.success("Profile completed successfully!");
                    return {success: true};
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Failed to complete profile";
                    toast.error(errorMsg);
                    return {success: false};
                } finally {
                    set({loading: false});
                }
            },

            updateUser: (updated) => {
                set((state) => ({
                    user: typeof updated === 'function' 
                        ? updated(state.user) 
                        : { ...state.user, ...(typeof updated === 'object' ? updated : {}) }
                }));
            },

            updateProfile: async (profileData) => {
                try {
                    set({ loading: true });
                    const user = await authService.updateProfile(profileData);
                    set({ user });
                    return { success: true, user };
                } catch (err) {
                    toast.error(err.response?.data?.message || "Failed to update profile.");
                    return { success: false };
                } finally {
                    set({ loading: false });
                }
            },

            fetchMe: async () => {
                try {
                    set({loading: true});
                    const res = await authService.fetchMe();
                    // res might be { user } or just user depending on API
                    const user = res.user || res;
                    set({user});
                    if (user && user.isProfileComplete) {
                        get().connectSocket();
                    }
                } catch (err) {
                    console.log(err);
                    set({user: null, accessToken: null});
                } finally {
                    set({loading: false});
                }
            },

            refresh: async () => {
                try {
                    set({loading: true});
                    const {user, fetchMe, setAccessToken} = get();
                    const accessToken = await authService.refresh();
                    setAccessToken(accessToken);

                    if (!user) {
                        await fetchMe();
                    }
                } catch (err) {
                    console.error(err);
                    toast.error("Session is expired, please sign in again!");
                    get().clearState();
                } finally {
                    set({loading: false});
                }
            },


            clearState: () => {
                get().disconnectSocket();
                set({user: null,accessToken: null, onlineUsers: [], socket: null});
                clearStorageKeepingTheme()
                useChatStore.getState().reset()
            },
            setAccessToken: (accessToken) => set({accessToken}),
            connectSocket: () => {
                const { user, socket } = get();
                if (!user || socket?.connected) return;

                const newSocket = io(SOCKET_URL, {
                    auth: (callback) => callback({ token: get().accessToken }),
                    query: {
                        userId: user._id,
                        showOnlineStatus: user?.privacy?.showOnlineStatus !== false ? "true" : "false",
                    },
                });

                newSocket.connect();
                set({ socket: newSocket });

                newSocket.on("getOnlineUsers", (userIds) => {
                    const currentUser = get().user;
                    if (currentUser?.privacy?.showOnlineStatus === false) {
                        set({ onlineUsers: [] });
                    } else {
                        set({ onlineUsers: userIds });
                    }
                });
                
                // Subscribe to chat and notification events
                useChatStore.getState().subscribeToMessages();
                useChatStore.getState().fetchConversations();
                useChatStore.getState().fetchFriendRequests();
                useChatStore.getState().fetchFriends();
                // Subscribe to call signaling events
                useCallStore.getState().subscribeToCallEvents();
                useGroupCallStore.getState().subscribeToGroupCallEvents();
                // Subscribe to like/comment/reply notification events
                useNotificationStore.getState().subscribeToNotificationEvents();
                useNotificationStore.getState().fetchNotifications();
            },

            setOnlineVisibility: (isVisible) => {
                const { socket } = get();
                if (socket?.connected) {
                    socket.emit("setOnlineVisibility", isVisible);
                }
                if (!isVisible) {
                    set({ onlineUsers: [] });
                }
            },

            disconnectSocket: () => {
                useChatStore.getState().unsubscribeFromMessages();
                useCallStore.getState().unsubscribeFromCallEvents();
                useNotificationStore.getState().unsubscribeFromNotificationEvents();
                if (get().socket?.connected) get().socket.disconnect();
                set({ socket: null, onlineUsers: [] });
            },

            forgotPassword: async (email) => {
                try {
                    set({ loading: true });
                    const res = await authService.forgotPassword(email);
                    toast.success(res.message || "OTP sent successfully!");
                    return { success: true };
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Failed to send OTP.";
                    toast.error(errorMsg);
                    return { success: false };
                } finally {
                    set({ loading: false });
                }
            },

            verifyOtp: async (email, otp) => {
                try {
                    set({ loading: true });
                    const res = await authService.verifyOtp(email, otp);
                    toast.success(res.message || "OTP verified successfully!");
                    return { success: true };
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Failed to verify OTP.";
                    toast.error(errorMsg);
                    return { success: false };
                } finally {
                    set({ loading: false });
                }
            },

            resetPassword: async (email, otp, newPassword) => {
                try {
                    set({ loading: true });
                    const res = await authService.resetPassword(email, otp, newPassword);
                    toast.success(res.message || "Password reset successfully!");
                    return { success: true };
                } catch (err) {
                    console.error(err);
                    const errorMsg = err.response?.data?.message || "Failed to reset password.";
                    toast.error(errorMsg);
                    return { success: false };
                } finally {
                    set({ loading: false });
                }
            }
        }),

        {
            name: "auth-storage",
            partialize: (state) => ({
                user: state.user
                    ? { ...state.user, antiPeepData: undefined }
                    : null,
                accessToken: state.accessToken,
            }),
        }
    )
);
