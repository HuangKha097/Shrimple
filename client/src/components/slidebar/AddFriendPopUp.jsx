import React, { useState, useEffect, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/AddFriendPopUp.module.scss';
import { Search, UserPlus, X, Check, UserCheck, Loader2, Sparkles, Users, QrCode } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import default_avt from "../../../public/favicon.png";
import TreeQRCodeModal from "../common/TreeQRCodeModal.jsx";

import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import { friendService } from "../../services/friendService.js";
import { toast } from "sonner";
import LoadingSpin from "../common/loading/LoadingSpin.jsx";

const cx = classNames.bind(styles);

const AddFriendPopUp = ({ onCloseAddFriendPopup }) => {
    const { friends, fetchFriends, suggestedFriends, fetchSuggestedFriends } = useChatStore();
    const { user: currentUser } = useAuthStore();

    const [keyword, setKeyword] = useState('');
    const [isLoadingSearch, setIsLoadingSearch] = useState(false);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showQRModal, setShowQRModal] = useState(false);

    // State lưu trạng thái gửi lời mời
    const [sentRequests, setSentRequests] = useState({});
    const [pendingRequests, setPendingRequests] = useState({});

    // 1. Fetch danh sách bạn bè và danh sách gợi ý khi popup mở
    useEffect(() => {
        if (fetchFriends) fetchFriends();

        const loadSuggestions = async () => {
            setIsLoadingSuggestions(true);
            try {
                if (fetchSuggestedFriends) {
                    await fetchSuggestedFriends();
                }
            } catch (err) {
                console.error("Error loading suggestions:", err);
            } finally {
                setIsLoadingSuggestions(false);
            }
        };

        loadSuggestions();
    }, [fetchFriends, fetchSuggestedFriends]);

    // Tìm kiếm qua username
    const handleSearch = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const trimmed = keyword.trim();
        if (!trimmed) return;

        setIsLoadingSearch(true);
        setSearchResults([]);

        try {
            const data = await friendService.findUserByUsername(trimmed);
            // Lọc bỏ chính mình khỏi kết quả tìm kiếm
            const filtered = Array.isArray(data)
                ? data.filter((item) => item && item._id && item._id !== currentUser?._id)
                : [];
            setSearchResults(filtered);
        } catch (error) {
            console.error(error);
            toast.error("Lỗi tìm kiếm người dùng");
        } finally {
            setIsLoadingSearch(false);
        }
    };

    // Khi người dùng xóa hết chữ trong ô search -> reset về gợi ý
    const handleInputChange = (e) => {
        const val = e.target.value;
        setKeyword(val);
        if (!val.trim()) {
            setSearchResults([]);
        }
    };

    const handleClearSearch = () => {
        setKeyword('');
        setSearchResults([]);
    };

    const handleAddFriend = async (userId) => {
        if (!userId) return;
        setPendingRequests(prev => ({ ...prev, [userId]: true }));
        try {
            await friendService.sendRequest(userId);
            setSentRequests(prev => ({ ...prev, [userId]: true }));
            toast.success("Đã gửi lời mời kết bạn!");
        } catch (error) {
            const msg = error.response?.data?.message || "Lỗi gửi lời mời";
            if (msg === "You already send request" || msg.includes("already")) {
                setSentRequests(prev => ({ ...prev, [userId]: true }));
                toast.info("Bạn đã gửi lời mời kết bạn trước đó rồi.");
            } else {
                toast.error(msg);
            }
        } finally {
            setPendingRequests(prev => ({ ...prev, [userId]: false }));
        }
    };

    // Kiểm tra an toàn
    const safeFriends = useMemo(() => {
        return Array.isArray(friends) ? friends.filter(f => f && f._id) : [];
    }, [friends]);

    const safeSuggested = useMemo(() => {
        return Array.isArray(suggestedFriends)
            ? suggestedFriends.filter(u => u && u._id && u._id !== currentUser?._id)
            : [];
    }, [suggestedFriends, currentUser]);

    const isSearching = keyword.trim().length > 0;

    return (
        <Motion.div 
            className={cx('popup-container')}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header X Style */}
            <div className={cx('header')}>
                <div className={cx('header-left')}>
                    <button 
                        className={cx('close-btn')} 
                        onClick={onCloseAddFriendPopup}
                        title="Đóng"
                        aria-label="Đóng"
                    >
                        <X size={20} />
                    </button>
                    <h3 className={cx('title')}>Thêm bạn bè</h3>
                </div>
                <button 
                    type="button"
                    className={cx('qr-action-btn')}
                    onClick={() => setShowQRModal(true)}
                    title="Mã QR cá nhân & Quét mã"
                >
                    <QrCode size={16} />
                    <span>Mã QR</span>
                </button>
            </div>

            {/* Search Bar X Style */}
            <div className={cx('search-section')}>
                <form onSubmit={handleSearch} className={cx('search-form')}>
                    <div className={cx('search-wrapper')}>
                        <Search size={18} className={cx('search-icon')} />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo username..."
                            value={keyword}
                            onChange={handleInputChange}
                            className={cx('search-input')}
                            autoFocus
                        />
                        {keyword && (
                            <button
                                type="button"
                                className={cx('clear-btn')}
                                onClick={handleClearSearch}
                                title="Xóa tìm kiếm"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* List Header */}
            <div className={cx('section-header')}>
                {isSearching ? (
                    <span className={cx('section-title')}>
                        Kết quả tìm kiếm cho <span className={cx('highlight')}>"{keyword}"</span>
                    </span>
                ) : (
                    <div className={cx('suggestion-title-row')}>
                        <Sparkles size={16} className={cx('sparkle-icon')} />
                        <span className={cx('section-title')}>Gợi ý kết bạn</span>
                        {safeSuggested.length > 0 && (
                            <span className={cx('badge-count')}>{safeSuggested.length}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className={cx('results-list')}>
                {/* CASE 1: Đang tìm kiếm */}
                {isSearching && isLoadingSearch && (
                    <div className={cx('loading-state')}>
                        <LoadingSpin size={32} />
                        <p>Đang tìm kiếm người dùng...</p>
                    </div>
                )}

                {/* CASE 2: Tìm kiếm nhưng không thấy kết quả */}
                {isSearching && !isLoadingSearch && searchResults.length === 0 && (
                    <div className={cx('empty-state')}>
                        <div className={cx('empty-icon-wrap')}>
                            <Users size={32} />
                        </div>
                        <h4 className={cx('empty-title')}>Không tìm thấy kết quả</h4>
                        <p className={cx('empty-desc')}>
                            Không có người dùng nào khớp với username "{keyword}". Hãy kiểm tra lại chính tả.
                        </p>
                    </div>
                )}

                {/* CASE 3: Hiển thị kết quả tìm kiếm */}
                {isSearching && !isLoadingSearch && searchResults.length > 0 && (
                    <div className={cx('users-wrap')}>
                        {searchResults.map((user) => renderUserCard(user))}
                    </div>
                )}

                {/* CASE 4: Không search -> Hiển thị gợi ý */}
                {!isSearching && isLoadingSuggestions && (
                    <div className={cx('loading-state')}>
                        <LoadingSpin size={32} />
                        <p>Đang tải gợi ý kết bạn...</p>
                    </div>
                )}

                {!isSearching && !isLoadingSuggestions && safeSuggested.length === 0 && (
                    <div className={cx('empty-state')}>
                        <div className={cx('empty-icon-wrap')}>
                            <Sparkles size={32} />
                        </div>
                        <h4 className={cx('empty-title')}>Chưa có gợi ý mới</h4>
                        <p className={cx('empty-desc')}>
                            Hiện tại chưa có người dùng gợi ý mới. Bạn có thể tìm bạn bè bằng cách nhập username vào thanh tìm kiếm ở trên.
                        </p>
                    </div>
                )}

                {!isSearching && !isLoadingSuggestions && safeSuggested.length > 0 && (
                    <div className={cx('users-wrap')}>
                        {safeSuggested.map((user) => renderUserCard(user))}
                    </div>
                )}
            </div>

            <TreeQRCodeModal 
                isOpen={showQRModal}
                onClose={() => setShowQRModal(false)}
                type="user"
                title="Mã QR kết bạn của tôi"
                dataValue={`${window.location.origin}/feed/profile/${currentUser?._id}?action=add_friend`}
                name={currentUser?.displayName || currentUser?.username}
                subText={currentUser?.username ? `@${currentUser.username}` : "Quét để kết bạn"}
                avatarUrl={currentUser?.avatarURL}
            />
        </Motion.div>
    );

    function renderUserCard(user) {
        if (!user || !user._id) return null;
        const isFriend = safeFriends.some((f) => f && f._id === user._id);
        const isSent = sentRequests[user._id];
        const isPending = pendingRequests[user._id];

        const displayName = user.displayName || user.username || 'Người dùng';
        const username = user.username ? `@${user.username}` : '';
        const avatar = user.avatarURL || default_avt;

        return (
            <div key={user._id} className={cx('user-card')}>
                <div className={cx('user-info')}>
                    <img 
                        src={avatar} 
                        alt={displayName} 
                        className={cx('avatar')} 
                        onError={(e) => { e.currentTarget.src = default_avt; }}
                    />
                    <div className={cx('details')}>
                        <span className={cx('name')} title={displayName}>
                            {displayName}
                        </span>
                        {username && (
                            <span className={cx('username')}>
                                {username}
                            </span>
                        )}
                        {user.bio && (
                            <p className={cx('bio')}>{user.bio}</p>
                        )}
                    </div>
                </div>

                <div className={cx('action-col')}>
                    <button
                        className={cx('x-pill-btn', {
                            sent: isSent,
                            friend: isFriend,
                            pending: isPending
                        })}
                        onClick={() => !isSent && !isFriend && !isPending && handleAddFriend(user._id)}
                        disabled={isSent || isFriend || isPending}
                    >
                        {isPending ? (
                            <Loader2 className={cx('btn-spinner')} size={16} />
                        ) : isFriend ? (
                            <>
                                <UserCheck size={16} />
                                <span>Bạn bè</span>
                            </>
                        ) : isSent ? (
                            <>
                                <Check size={16} />
                                <span>Đã gửi</span>
                            </>
                        ) : (
                            <>
                                <UserPlus size={16} />
                                <span>Thêm bạn</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    }
};

export default AddFriendPopUp;