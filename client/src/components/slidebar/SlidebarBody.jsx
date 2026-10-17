import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion } from 'motion/react';
import { Search } from 'lucide-react';
import styles from '../../assets/css/SlideBarBody.module.scss';
import BodyFriendsChat from "./BodyFriendsChat.jsx";
import BodyGroupsChat from "./BodyGroupsChat.jsx";
import BodyRequests from "./BodyRequests.jsx";
import { useTranslation } from 'react-i18next';
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";

const cx = classNames.bind(styles);

const SlidebarBody = () => {
    const { t } = useTranslation();
    const { conversations = [], friendRequests = [], fetchConversations, fetchFriends, fetchFriendRequests } = useChatStore();
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('friends');
    const [searchText, setSearchText] = useState('');

    useEffect(() => {
        if (fetchConversations) fetchConversations();
        if (fetchFriends) fetchFriends();
        if (fetchFriendRequests) fetchFriendRequests();
    }, [fetchConversations, fetchFriends, fetchFriendRequests]);

    // LOGIC LỌC TRÙNG LẶP & NULL-SAFE
    const directConversations = useMemo(() => {
        if (!user) return [];

        const processedPartnerIds = new Set();
        const uniqueConversations = [];

        // 1. Sắp xếp conversations
        const sortedConversations = [...(conversations || [])].sort((a, b) => {
            const dateA = new Date(a?.lastMessageAt || a?.updatedAt || 0);
            const dateB = new Date(b?.lastMessageAt || b?.updatedAt || 0);
            return dateB - dateA;
        });

        // 2. Lặp qua danh sách đã sắp xếp để lọc trùng
        sortedConversations.forEach(c => {
            if (!c || c.isGroup) return;

            if (!c.participants || !Array.isArray(c.participants)) {
                return;
            }

            const partner = c.participants.find(p => p && p._id && user && p._id !== user._id);

            if (partner && partner._id) {
                if (!processedPartnerIds.has(partner._id)) {
                    processedPartnerIds.add(partner._id);
                    uniqueConversations.push(c);
                }
            }
        });

        return uniqueConversations;
    }, [conversations, user]);

    // Lọc theo search input
    const filteredFriends = useMemo(() => {
        if (!searchText.trim()) return directConversations;
        return directConversations.filter(c => {
            const partner = c.participants?.find(p => p && p._id && user && p._id !== user._id);
            const name = partner?.displayName || partner?.username || '';
            return name.toLowerCase().includes(searchText.toLowerCase());
        });
    }, [directConversations, searchText, user]);

    // Nhóm chat
    const groupConversations = useMemo(() => {
        return (conversations || []).filter(c => c && c.isGroup);
    }, [conversations]);

    const filteredGroups = useMemo(() => {
        if (!searchText.trim()) return groupConversations;
        return groupConversations.filter(c => 
            (c.groupName || c.name || c.group?.name || '').toLowerCase().includes(searchText.toLowerCase())
        );
    }, [groupConversations, searchText]);

    // Helper calculate unread count for current user
    const getConvoUnread = (convo) => {
        if (!convo || !convo.unreadCounts || !user?._id) return 0;
        if (convo.unreadCounts instanceof Map) {
            return convo.unreadCounts.get(user._id) || 0;
        } else if (typeof convo.unreadCounts === 'object') {
            return convo.unreadCounts[user._id] || 0;
        } else if (typeof convo.unreadCounts === 'number') {
            return convo.unreadCounts;
        }
        return 0;
    };

    const unreadDirectCount = directConversations.reduce((sum, c) => sum + getConvoUnread(c), 0);
    const unreadGroupCount = groupConversations.reduce((sum, c) => sum + getConvoUnread(c), 0);
    const countFriendRequest = (friendRequests || []).length;

    const tabs = [
        { key: 'friends', label: t('chat.directMessages'), count: unreadDirectCount },
        { key: 'groups', label: t('chat.groups'), count: unreadGroupCount },
        { key: 'requests', label: t('chat.requests'), count: countFriendRequest }
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'friends':
                return <BodyFriendsChat convo={filteredFriends} />;
            case 'groups':
                return <BodyGroupsChat convo={filteredGroups} />;
            case 'requests':
                return <BodyRequests friendRequests={friendRequests || []} />;
            default:
                return <BodyFriendsChat convo={directConversations} />;
        }
    };

    return (
        <div className={cx("slidebar-body-wrapper")}>
            {/* Pill Search Box */}
            <div className={cx("search-container")}>
                <div className={cx("search-box")}>
                    <Search className={cx("search-icon")} size={16} />
                    <input
                        type="text"
                        placeholder={t('chat.searchDirect')}
                        className={cx("search-input")}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
            </div>

            {/* Sub-Tabs X-Style */}
            <div className={cx("slidebar-body-navigation")}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            className={cx("nav-item", { active: isActive })}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <span className={cx("tab-label")}>
                                {tab.label}
                                {tab.count > 0 && <span className={cx("tab-badge")}>{tab.count}</span>}
                            </span>
                            {isActive && (
                                <Motion.div
                                    layoutId="x-msg-tab"
                                    className={cx("active-indicator")}
                                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Conversations List */}
            <div className={cx("slidebar-body-list")}>
                {renderContent()}
            </div>
        </div>
    );
};

export default SlidebarBody;