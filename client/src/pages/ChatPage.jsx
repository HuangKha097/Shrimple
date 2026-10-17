import { useSceneMotion } from '../hooks/useSceneMotion';
import MotionPresence from '../components/common/MotionPresence';
import React, { useRef, useState } from 'react';
import classNames from 'classnames/bind';
import styles from '../assets/css/ChatPage.module.scss';
import { Outlet, useLocation } from 'react-router-dom';

import SlideBar from "../components/slidebar/SlideBar.jsx";
import XNavRail from "../components/common/XNavRail.jsx";

import { useAuthStore } from "../stores/useAuthStore.js";
import { useChatStore } from "../stores/useChatStore.js";
import AddFriendPopUp from "../components/slidebar/AddFriendPopUp.jsx";
import CreateGroupPopUp from "../components/slidebar/CreateGroupPopUp.jsx";
import TreeQRCodeModal from "../components/common/TreeQRCodeModal.jsx";
import PostsSidebar from "../components/posts/PostsSidebar.jsx";
import GlobalLoadingOverlay from "../components/common/GlobalLoadingOverlay.jsx";

const cx = classNames.bind(styles);

const ChatPage = () => {
    const { activeConversationId } = useChatStore();
    const [isShowSlideBar, setIsShowSlideBar] = useState(true);
    const [isShowChatInfo, setIsShowChatInfo] = useState(false);
    const [isShowAddFriendPopup, setIsShowAddFriendPopup] = useState(false);
    const [isShowCreateGroupPopup, setIsShowCreateGroupPopup] = useState(false);
    const [isShowQRModal, setIsShowQRModal] = useState(false);
    const { user: currentUser } = useAuthStore();
    const location = useLocation();
    const shellRef = useRef(null);
    const contentRef = useRef(null);
    useSceneMotion(shellRef, contentRef, location.pathname);
    const [feedMenuPath, setFeedMenuPath] = useState(null);
    const isFeedMenuOpen = feedMenuPath === location.pathname;
    const closeFeedMenu = () => setFeedMenuPath(null);
    const toggleFeedMenu = () => setFeedMenuPath(isFeedMenuOpen ? null : location.pathname);

    // Determine view mode from URL
    const isFeedView = location.pathname.startsWith('/feed') || 
                       location.pathname.startsWith('/video') || 
                       location.pathname.startsWith('/post') ||
                       location.pathname.startsWith('/profile') ||
                       location.pathname.startsWith('/setting');

    React.useEffect(() => {
        if (!activeConversationId) {
            setIsShowSlideBar(true);
        }
    }, [activeConversationId]);

    const onCloseSlideBar = () => setIsShowSlideBar((prev) => !prev);
    const onCloseChatInfo = () => setIsShowChatInfo((prev) => !prev);
    const onCloseAddFriendPopup = () => setIsShowAddFriendPopup((prev) => !prev);
    const onCloseCreateGroupPopup = () => setIsShowCreateGroupPopup((prev) => !prev);

    const outletContext = {
        isShowChatInfo,
        onCloseChatInfo,
        toggleSidebar: isFeedView ? toggleFeedMenu : onCloseSlideBar,
        isSidebarOpen: isFeedView ? isFeedMenuOpen : isShowSlideBar,
        onOpenNewChat: onCloseAddFriendPopup
    };

    return (
        <div className={cx("container")} onKeyDown={(event) => { if (event.key === "Escape") closeFeedMenu(); }}>
            <div ref={shellRef} className={cx("chat-wrapper", {
                "has-active-chat": activeConversationId && !isFeedView,
                "feed-view": isFeedView,
                "sidebar-open": isShowSlideBar,
                "feed-menu-open": isFeedMenuOpen
            })}>
                {/* Column 1: X Global Navigation Rail (Always present on desktop) */}
                <XNavRail />

                {/* Column 2: Chat Sidebar (Only in /chat mode on desktop) OR Mobile Drawer for Feed */}
                {!isFeedView && isShowSlideBar && (
                    <div className={cx("block-left")}>
                        <div key="chat-sidebar" style={{ height: '100%', width: '100%' }}>
                            <SlideBar
                                onCloseAddFriendPopup={onCloseAddFriendPopup}
                                onCloseCreateGroupPopup={onCloseCreateGroupPopup}
                                onOpenQRModal={() => setIsShowQRModal(true)}
                                onOpenNavigation={toggleFeedMenu}
                            />
                        </div>
                    </div>
                )}

                {/* Mobile Drawer for Feed */}
                {isFeedMenuOpen && (
                    <>
                        <div className={cx("mobile-backdrop")} onClick={closeFeedMenu}></div>
                        <div className={cx("mobile-feed-drawer")}>
                            <PostsSidebar
                                onNavigate={closeFeedMenu}
                                onClose={closeFeedMenu}
                            />
                        </div>
                    </>
                )}

                {/* Column 3: Conversation View / Feed Content */}
                <div className={cx("block-right")}>
                    <div ref={contentRef} style={{ height: '100%', width: '100%' }}>
                        <Outlet context={outletContext} />
                    </div>
                </div>

                <GlobalLoadingOverlay />
            </div>

            {/* Add Friend / Compose Popup */}
            <MotionPresence 
                open={isShowAddFriendPopup}
                className={cx("add-friend-wrapper")}
                onClick={(e) => e.target === e.currentTarget && onCloseAddFriendPopup()}
            >
                <AddFriendPopUp onCloseAddFriendPopup={onCloseAddFriendPopup} />
            </MotionPresence>

            {/* Create Group Popup */}
            <MotionPresence 
                open={isShowCreateGroupPopup}
                className={cx("add-friend-wrapper")}
                onClick={(e) => e.target === e.currentTarget && onCloseCreateGroupPopup()}
            >
                <CreateGroupPopUp onCloseCreateGroupPopup={onCloseCreateGroupPopup} />
            </MotionPresence>

            {/* Personal Tree QR Code Modal */}
            <TreeQRCodeModal 
                isOpen={isShowQRModal}
                onClose={() => setIsShowQRModal(false)}
                type="user"
                title="Mã QR kết bạn của tôi"
                dataValue={`${window.location.origin}/feed/profile/${currentUser?._id}?action=add_friend`}
                name={currentUser?.displayName || currentUser?.username}
                subText={currentUser?.username ? `@${currentUser.username}` : "Quét để kết bạn"}
                avatarUrl={currentUser?.avatarURL}
            />
        </div>
    );
};

export default ChatPage;
