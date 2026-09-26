import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import SignInPage from "./pages/SignInPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import { Toaster } from "sonner";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import { useThemeStore } from "./stores/useThemeStore.js";
import PostsContainer from "./components/posts/PostsContainer.jsx";
import SearchResultsContainer from "./components/posts/SearchResultsContainer.jsx";
import ChatContainer from "./components/chat/ChatContainer.jsx";
import { useOutletContext } from "react-router-dom";
import SinglePostPage from "./pages/SinglePostPage.jsx";
import SavedPostsContainer from "./components/posts/SavedPostsContainer.jsx";
import FriendsContainer from "./components/posts/FriendsContainer.jsx";
import ProfileContainer from "./components/posts/ProfileContainer.jsx";
import VideoFeed from "./pages/VideoFeed.jsx";
import CompleteProfile from "./pages/CompleteProfile.jsx";
import SettingContainer from "./components/setting/SettingContainer.jsx";
import CallModal from "./components/chat/CallModal.jsx";
import GroupCallModal from "./components/chat/GroupCallModal.jsx";
import GroupCallFloatingBar from "./components/chat/GroupCallFloatingBar.jsx";
import { useCallStore } from "./stores/useCallStore.js";
import { useGroupCallStore } from "./stores/useGroupCallStore.js";
import { useNotificationStore } from "./stores/useNotificationStore.js";
import { useAuthStore } from "./stores/useAuthStore.js";
import { useUIStore } from "./stores/useUIStore.js";
// import LoadingSpin from "./components/common/loading/LoadingSpin.jsx"; // Removed from here


import { AntiPeepProvider } from "./components/anti-peep/AntiPeepProvider.jsx";


import { useTranslation } from 'react-i18next';

// Wrapper to consume outlet context and pass it to ChatContainer
const ChatContainerWrapper = () => {
    const context = useOutletContext();
    return <ChatContainer {...context} />;
};

const App = () => {
    const { i18n } = useTranslation();
    const { isLight } = useThemeStore();
    const { subscribeToCallEvents, unsubscribeFromCallEvents } = useCallStore();
    const { subscribeToGroupCallEvents, unsubscribeFromGroupCallEvents } = useGroupCallStore();
    const { subscribeToNotificationEvents, unsubscribeFromNotificationEvents } = useNotificationStore();

    const { user, socket } = useAuthStore(); // Check if user and socket are ready to subscribe
    const { setOffline } = useUIStore();

    useEffect(() => {
        document.documentElement.lang = i18n.language || 'vi';
    }, [i18n.language]);

    // Subscribe to call & notification events (1-1, Group Voice Room, and Feed/Chat Notifications)
    useEffect(() => {
        if (socket && user) {
            subscribeToCallEvents();
            subscribeToGroupCallEvents();
            subscribeToNotificationEvents();
        }
        return () => {
            unsubscribeFromCallEvents();
            unsubscribeFromGroupCallEvents();
            unsubscribeFromNotificationEvents();
        };
    }, [socket, user, subscribeToCallEvents, unsubscribeFromCallEvents, subscribeToGroupCallEvents, unsubscribeFromGroupCallEvents, subscribeToNotificationEvents, unsubscribeFromNotificationEvents]);

    useEffect(() => {
        const handleOnline = () => setOffline(false);
        const handleOffline = () => setOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [setOffline]);

    return (
        <AntiPeepProvider>
            <Toaster 
                theme={isLight ? "light" : "dark"} 
                position="bottom-center"
                toastOptions={{
                    duration: 2600,
                }}
            />

            <CallModal />
            <GroupCallModal />
            <GroupCallFloatingBar />

            <BrowserRouter>
                <Routes>
                    {/* Public routes */}
                    <Route path="/signin" element={<SignInPage />} />
                    <Route path="/signup" element={<SignUpPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />


                    <Route element={<ProtectedRoute />}>
                        <Route path="/complete-profile" element={<CompleteProfile />} />
                        <Route element={<ChatPage />}>
                            <Route path="/" element={<Navigate to="/chat" replace />} />
                            <Route path="/chat" element={<ChatContainerWrapper />} />
                            <Route path="/feed" element={<PostsContainer />} />
                            <Route path="/post/:postId" element={<SinglePostPage />} />
                            <Route path="/feed/post/:postId" element={<SinglePostPage />} />
                            <Route path="/feed/search" element={<SearchResultsContainer />} />
                            <Route path="/feed/saved" element={<SavedPostsContainer />} />
                            <Route path="/feed/friends" element={<FriendsContainer />} />
                            <Route path="/feed/profile/:userId" element={<ProfileContainer />} />
                            <Route path="/profile/:userId" element={<ProfileContainer />} />
                            <Route path="/video" element={<VideoFeed />} />
                            <Route path="/setting" element={<SettingContainer />} />
                            <Route path="/settings" element={<SettingContainer />} />
                        </Route>
                    </Route>
                </Routes>
            </BrowserRouter>
        </AntiPeepProvider>
    );
};

export default App;
