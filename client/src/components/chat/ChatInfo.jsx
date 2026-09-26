import React, { useMemo, useState, useEffect } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import styles from '../../assets/css/ChatInfo.module.scss';
import defaultAvatar from "../../../public/favicon.png";
import { useAuthStore } from "../../stores/useAuthStore.js";
import { useChatStore } from "../../stores/useChatStore.js";
import { chatService } from "../../services/chatService.js";
import { userSettingsService } from "../../services/userSettingsService.js";
import { ASSET_BASE_URL } from "../../config/env.js";
import AddMemberModal from "./AddMemberModal.jsx";
import TreeQRCodeModal from "../common/TreeQRCodeModal.jsx";
import { 
    X, 
    Image as ImageIcon, 
    FileText, 
    Users, 
    User, 
    Bell, 
    BellOff, 
    Ban, 
    Share2, 
    Download, 
    Crown,
    Check,
    Loader2,
    Shield,
    ShieldAlert,
    ShieldCheck,
    UserMinus,
    MoreVertical,
    UserPlus,
    LogOut,
    Trash2,
    Pin,
    PinOff,
    QrCode
} from "lucide-react";
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const ChatInfo = ({ chat, onClose }) => {
    const navigate = useNavigate();
    const { user: currentUser, onlineUsers } = useAuthStore();
    const { 
        friends, 
        pinnedMessages, 
        fetchPinnedMessages, 
        togglePinMessageAction,
        removeMemberAction,
        updateMemberRoleAction,
        leaveGroupAction,
        disbandGroupAction 
    } = useChatStore();

    const [activeTab, setActiveTab] = useState('media'); // 'media' | 'files' | 'members' | 'pins'
    const [media, setMedia] = useState({ images: [], files: [] });
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [groupInviteCode, setGroupInviteCode] = useState('');
    const [activeMemberMenu, setActiveMemberMenu] = useState(null);

    const isGroup = !!chat?.isGroup;
    const participants = chat?.participants || [];

    // Fetch media and pinned messages
    useEffect(() => {
        if (chat?._id) {
            setLoadingMedia(true);
            chatService.getSharedMedia(chat._id)
                .then(data => setMedia(data || { images: [], files: [] }))
                .catch(err => console.error("Failed to fetch media", err))
                .finally(() => setLoadingMedia(false));

            fetchPinnedMessages(chat._id);

            if (isGroup) {
                chatService.getGroupInvite(chat._id)
                    .then(data => {
                        if (data?.inviteCode) {
                            setGroupInviteCode(data.inviteCode);
                        }
                    })
                    .catch(err => console.error("Failed to fetch group invite", err));
            }
        }
    }, [chat?._id, isGroup]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setActiveMemberMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const sortedParticipants = useMemo(() => {
        return [...(chat?.participants || [])].sort((a, b) => {
            if (a._id === currentUser?._id) return -1;
            if (b._id === currentUser?._id) return 1;
            return 0;
        });
    }, [chat?.participants, currentUser]);

    if (!chat) return null;

    let partner = !isGroup 
        ? (participants.find(p => p && p._id && currentUser && p._id !== currentUser?._id) || participants[0]) 
        : null;

    if (partner && partner._id && Array.isArray(friends) && friends.length > 0) {
        const friend = friends.find(f => f && f._id && (f._id === partner._id || f._id === partner._id?.toString()));
        if (friend) {
            partner = { ...partner, ...friend };
        }
    }

    const partnerId = partner?._id;
    const isOnline = partnerId && Array.isArray(onlineUsers) && onlineUsers.includes(partnerId.toString());

    const displayName = isGroup 
        ? (chat.name || chat.group?.name || "Cuộc trò chuyện nhóm") 
        : (partner?.displayName || partner?.username || "Người dùng");

    const usernameTag = !isGroup && partner?.username ? `@${partner.username}` : null;
    const subInfo = isGroup 
        ? `${participants.length} thành viên` 
        : (isOnline ? "Đang hoạt động" : "Ngoại tuyến");

    const groupCreatorId = chat?.group?.createdBy?._id?.toString() || chat?.group?.createdBy?.toString();
    const currentMember = participants.find(p => (p?._id?.toString() || p?.toString()) === currentUser?._id?.toString());
    const isCurrentUserCreator = groupCreatorId === currentUser?._id?.toString();
    const isCurrentUserAdmin = isGroup && (isCurrentUserCreator || currentMember?.role === 'admin');

    const pins = pinnedMessages[chat._id] || [];

    const getPinPreviewText = (pin) => {
        if (!pin) return "";
        if (pin.isRecalled) return "Tin nhắn đã bị thu hồi";
        switch (pin.messageType) {
            case 'text':
                return pin.content;
            case 'image':
                return "[Hình ảnh]";
            case 'audio':
                return "[Tin nhắn thoại]";
            case 'file':
                return `[Tập tin] ${pin.content || ""}`;
            case 'location':
                return "[Vị trí chia sẻ]";
            case 'poll':
                return `[Bình chọn] ${pin.poll?.question || ""}`;
            case 'group_call':
                return "[Cuộc gọi nhóm]";
            default:
                return pin.content || "Tin nhắn đã ghim";
        }
    };

    const getAvatarSrc = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    const handleBlockUser = async () => {
        if (!partnerId) return;
        if (window.confirm(`Bạn có chắc chắn muốn chặn ${displayName}?`)) {
            try {
                await userSettingsService.blockUser(partnerId);
                await useAuthStore.getState().checkAuth();
                setIsBlocked(true);
                toast.success(`Đã chặn ${displayName}`);
            } catch (error) {
                console.error("Failed to block user", error);
                toast.error("Không thể chặn người dùng");
            }
        }
    };

    const handleToggleMute = () => {
        setIsMuted(prev => {
            const next = !prev;
            toast.info(next ? "Đã tắt thông báo cuộc trò chuyện" : "Đã bật thông báo cuộc trò chuyện");
            return next;
        });
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        toast.success("Đã sao chép liên kết vào bộ nhớ tạm");
    };

    const handleViewProfile = (uid) => {
        if (uid) {
            navigate(`/feed/profile/${uid}`);
        }
    };

    const handleScrollToMessage = (messageId) => {
        const element = document.getElementById(`msg-${messageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('glow-highlight');
            setTimeout(() => element.classList.remove('glow-highlight'), 2000);
        } else {
            toast.info("Tin nhắn chưa tải trong đoạn chat hiện tại");
        }
    };

    const handleUnpin = async (messageId) => {
        try {
            await togglePinMessageAction(messageId);
            toast.success("Đã bỏ ghim tin nhắn!");
        } catch (err) {
            console.error("Unpin failed:", err);
            toast.error("Không thể bỏ ghim");
        }
    };

    const handleUpdateRole = async (targetUserId, newRole) => {
        setActiveMemberMenu(null);
        try {
            await updateMemberRoleAction(chat._id, targetUserId, newRole);
            toast.success(newRole === 'admin' ? "Đã bổ nhiệm Quản trị viên!" : "Đã gỡ quyền Quản trị viên!");
        } catch (err) {
            console.error("Update role failed:", err);
            toast.error(err.response?.data?.message || "Không thể cập nhật quyền");
        }
    };

    const handleRemoveMember = async (targetUserId, memberName) => {
        setActiveMemberMenu(null);
        if (window.confirm(`Bạn có chắc chắn muốn xóa ${memberName || "thành viên này"} khỏi nhóm?`)) {
            try {
                await removeMemberAction(chat._id, targetUserId);
                toast.success("Đã xóa thành viên khỏi nhóm!");
            } catch (err) {
                console.error("Remove member failed:", err);
                toast.error(err.response?.data?.message || "Không thể xóa thành viên");
            }
        }
    };

    const handleLeaveGroup = async () => {
        if (window.confirm("Bạn có chắc chắn muốn rời khỏi nhóm này không?")) {
            try {
                await leaveGroupAction(chat._id);
                toast.success("Đã rời nhóm thành công");
                if (onClose) onClose();
                navigate('/chat', { replace: true });
            } catch (err) {
                console.error("Leave group failed:", err);
                toast.error(err.response?.data?.message || "Không thể rời nhóm");
            }
        }
    };

    const handleDisbandGroup = async () => {
        if (window.confirm("CẢNH BÁO: Bạn có chắc chắn muốn giải tán nhóm này không? Toàn bộ tin nhắn và nhóm sẽ bị giải tán vĩnh viễn!")) {
            try {
                await disbandGroupAction(chat._id);
                toast.success("Đã giải tán nhóm thành công!");
                if (onClose) onClose();
                navigate('/chat', { replace: true });
            } catch (err) {
                console.error("Disband group failed:", err);
                toast.error(err.response?.data?.message || "Không thể giải tán nhóm");
            }
        }
    };

    return (
        <Motion.div 
            className={cx('chat-info-container')}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
            {/* 1. Header (X Style Sticky Top) */}
            <header className={cx('header-nav')}>
                <button 
                    className={cx('back-btn')} 
                    onClick={onClose} 
                    aria-label="Đóng chi tiết"
                    title="Đóng"
                >
                    <X size={20} strokeWidth={2.2} />
                </button>
                <div className={cx('nav-title-box')}>
                    <span className={cx('nav-title')}>Thông tin cuộc trò chuyện</span>
                </div>
            </header>

            {/* 2. Hero Profile */}
            <section className={cx('profile-hero')}>
                <div className={cx('hero-content')}>
                    <div className={cx('avatar-wrapper')}>
                        {isGroup ? (
                            chat.avatarURL || chat.group?.avatarURL ? (
                                <img
                                    src={getAvatarSrc(chat.avatarURL || chat.group?.avatarURL)}
                                    alt="Group Avatar"
                                    className={cx('single-avatar')}
                                    onError={(e) => { e.target.src = defaultAvatar; }}
                                />
                            ) : (
                                <div className={cx('group-avatar-stack')}>
                                    <img 
                                        src={getAvatarSrc(participants[0]?.avatarURL)} 
                                        className={cx('stack-img', 'first')} 
                                        alt="" 
                                        onError={(e) => { e.target.src = defaultAvatar; }}
                                    />
                                    {participants.length > 1 && (
                                        <img 
                                            src={getAvatarSrc(participants[1]?.avatarURL)} 
                                            className={cx('stack-img', 'second')} 
                                            alt="" 
                                            onError={(e) => { e.target.src = defaultAvatar; }}
                                        />
                                    )}
                                </div>
                            )
                        ) : (
                            <div className={cx('single-avatar-box')}>
                                <img
                                    src={getAvatarSrc(partner?.avatarURL)}
                                    alt={displayName}
                                    className={cx('single-avatar')}
                                    onError={(e) => { e.target.src = defaultAvatar; }}
                                />
                                <span className={cx('online-status-dot', { online: isOnline })} />
                            </div>
                        )}
                    </div>

                    <h2 className={cx('hero-name')}>{displayName}</h2>
                    
                    <div className={cx('hero-meta')}>
                        {usernameTag && <span className={cx('hero-username')}>{usernameTag}</span>}
                        <span className={cx('hero-sub', { online: isOnline })}>{subInfo}</span>
                    </div>

                    {/* Quick Action Pills (X Style) */}
                    <div className={cx('quick-actions')}>
                        {!isGroup && partnerId && (
                            <Motion.button 
                                className={cx('action-pill')}
                                whileTap={{ scale: 0.94 }}
                                onClick={() => handleViewProfile(partnerId)}
                                title="Xem hồ sơ"
                            >
                                <User size={18} />
                                <span>Hồ sơ</span>
                            </Motion.button>
                        )}

                        <Motion.button 
                            className={cx('action-pill', { active: isMuted })}
                            whileTap={{ scale: 0.94 }}
                            onClick={handleToggleMute}
                            title={isMuted ? "Bật thông báo" : "Tắt thông báo"}
                        >
                            {isMuted ? <BellOff size={18} /> : <Bell size={18} />}
                            <span>{isMuted ? "Đã tắt" : "Tắt báo"}</span>
                        </Motion.button>

                        {/* Tree QR Code Action Pill */}
                        <Motion.button 
                            className={cx('action-pill')}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => setShowQRModal(true)}
                            title={isGroup ? "Mã QR nhóm" : "Mã QR kết bạn"}
                        >
                            <QrCode size={18} />
                            <span>Mã QR</span>
                        </Motion.button>

                        {isGroup ? (
                            <Motion.button 
                                className={cx('action-pill')}
                                whileTap={{ scale: 0.94 }}
                                onClick={handleCopyLink}
                                title="Chia sẻ liên kết"
                            >
                                <Share2 size={18} />
                                <span>Chia sẻ</span>
                            </Motion.button>
                        ) : (
                            <Motion.button 
                                className={cx('action-pill', 'danger-pill', { blocked: isBlocked })}
                                whileTap={{ scale: 0.94 }}
                                onClick={handleBlockUser}
                                title={isBlocked ? "Đã chặn" : "Chặn người dùng"}
                            >
                                <Ban size={18} />
                                <span>{isBlocked ? "Đã chặn" : "Chặn"}</span>
                            </Motion.button>
                        )}
                    </div>
                </div>
            </section>

            {/* 3. Segmented Navigation Tabs (X Style) */}
            <div className={cx('tabs-container')}>
                <button 
                    className={cx('tab-btn', { active: activeTab === 'media' })}
                    onClick={() => setActiveTab('media')}
                    title="Ảnh đã chia sẻ"
                >
                    <ImageIcon size={15} />
                    <span className={cx('tab-label')}>Ảnh</span>
                    {media.images.length > 0 && <span className={cx('tab-count')}>{media.images.length}</span>}
                    {activeTab === 'media' && (
                        <Motion.div 
                            className={cx('tab-indicator')} 
                            layoutId="activeChatInfoTab" 
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                    )}
                </button>

                <button 
                    className={cx('tab-btn', { active: activeTab === 'files' })}
                    onClick={() => setActiveTab('files')}
                    title="Tệp đã chia sẻ"
                >
                    <FileText size={15} />
                    <span className={cx('tab-label')}>Tệp</span>
                    {media.files.length > 0 && <span className={cx('tab-count')}>{media.files.length}</span>}
                    {activeTab === 'files' && (
                        <Motion.div 
                            className={cx('tab-indicator')} 
                            layoutId="activeChatInfoTab" 
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                    )}
                </button>

                <button 
                    className={cx('tab-btn', { active: activeTab === 'pins' })}
                    onClick={() => setActiveTab('pins')}
                    title="Tin nhắn đã ghim"
                >
                    <Pin size={15} />
                    <span className={cx('tab-label')}>Ghim</span>
                    {pins.length > 0 && <span className={cx('tab-count')}>{pins.length}</span>}
                    {activeTab === 'pins' && (
                        <Motion.div 
                            className={cx('tab-indicator')} 
                            layoutId="activeChatInfoTab" 
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                    )}
                </button>

                {isGroup && (
                    <button 
                        className={cx('tab-btn', { active: activeTab === 'members' })}
                        onClick={() => setActiveTab('members')}
                        title="Thành viên nhóm"
                    >
                        <Users size={15} />
                        <span className={cx('tab-label')}>T.viên</span>
                        <span className={cx('tab-count')}>{participants.length}</span>
                        {activeTab === 'members' && (
                            <Motion.div 
                                className={cx('tab-indicator')} 
                                layoutId="activeChatInfoTab" 
                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            />
                        )}
                    </button>
                )}
            </div>

            {/* 4. Tab Content Area */}
            <div className={cx('scroll-content')}>
                <AnimatePresence mode="wait">
                    {activeTab === 'media' && (
                        <Motion.div 
                            key="tab-media"
                            className={cx('tab-pane')}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            {loadingMedia ? (
                                <div className={cx('loading-box')}>
                                    <Loader2 size={24} className={cx('spinner')} />
                                </div>
                            ) : media.images.length > 0 ? (
                                <div className={cx('media-grid')}>
                                    {media.images.map((img) => (
                                        <Motion.div 
                                            key={img._id} 
                                            className={cx('media-item')}
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setSelectedImage(img.url)}
                                        >
                                            <img src={img.url} alt="Shared" loading="lazy" />
                                        </Motion.div>
                                    ))}
                                </div>
                            ) : (
                                <div className={cx('empty-state')}>
                                    <ImageIcon size={36} className={cx('empty-icon')} />
                                    <p className={cx('empty-text')}>Chưa có ảnh nào được chia sẻ</p>
                                </div>
                            )}
                        </Motion.div>
                    )}

                    {activeTab === 'files' && (
                        <Motion.div 
                            key="tab-files"
                            className={cx('tab-pane')}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            {loadingMedia ? (
                                <div className={cx('loading-box')}>
                                    <Loader2 size={24} className={cx('spinner')} />
                                </div>
                            ) : media.files.length > 0 ? (
                                <div className={cx('files-list')}>
                                    {media.files.map((file) => (
                                        <a 
                                            key={file._id} 
                                            href={file.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className={cx('file-card')}
                                        >
                                            <div className={cx('file-icon-box')}>
                                                <FileText size={20} />
                                            </div>
                                            <div className={cx('file-details')}>
                                                <span className={cx('file-name')}>{file.fileName || "Tệp đính kèm"}</span>
                                                <span className={cx('file-meta')}>Nhấn để mở / tải xuống</span>
                                            </div>
                                            <div className={cx('file-download-btn')}>
                                                <Download size={16} />
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <div className={cx('empty-state')}>
                                    <FileText size={36} className={cx('empty-icon')} />
                                    <p className={cx('empty-text')}>Chưa có tệp nào được gửi</p>
                                </div>
                            )}
                        </Motion.div>
                    )}

                    {activeTab === 'pins' && (
                        <Motion.div 
                            key="tab-pins"
                            className={cx('tab-pane')}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            {pins.length > 0 ? (
                                <div className={cx('pins-list')}>
                                    {pins.map((pin) => (
                                        <div key={pin._id} className={cx('pin-card')}>
                                            <div className={cx('pin-card-top')}>
                                                <div className={cx('pin-sender-box')}>
                                                    <img 
                                                        src={getAvatarSrc(pin.senderId?.avatarURL)} 
                                                        alt="" 
                                                        className={cx('pin-sender-avatar')}
                                                        onError={(e) => { e.target.src = defaultAvatar; }}
                                                    />
                                                    <div className={cx('pin-sender-info')}>
                                                        <span className={cx('pin-sender-name')}>
                                                            {pin.senderId?.displayName || pin.senderId?.username || "Người gửi"}
                                                        </span>
                                                        <span className={cx('pin-date')}>
                                                            {pin.createdAt ? new Date(pin.createdAt).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button 
                                                    className={cx('pin-unpin-action-btn')}
                                                    onClick={() => handleUnpin(pin._id)}
                                                    title="Bỏ ghim tin nhắn"
                                                >
                                                    <PinOff size={15} />
                                                </button>
                                            </div>
                                            <div 
                                                className={cx('pin-card-body')} 
                                                onClick={() => handleScrollToMessage(pin._id)}
                                                title="Nhấn để cuộn đến tin nhắn"
                                            >
                                                <p className={cx('pin-text')}>{getPinPreviewText(pin)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={cx('empty-state')}>
                                    <Pin size={36} className={cx('empty-icon')} />
                                    <p className={cx('empty-text')}>Chưa có tin nhắn nào được ghim</p>
                                </div>
                            )}
                        </Motion.div>
                    )}

                    {activeTab === 'members' && isGroup && (
                        <Motion.div 
                            key="tab-members"
                            className={cx('tab-pane')}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                        >
                            {isCurrentUserAdmin && (
                                <div className={cx('members-actions-bar')}>
                                    <button 
                                        type="button"
                                        className={cx('add-member-header-btn')}
                                        onClick={() => setShowAddMemberModal(true)}
                                    >
                                        <UserPlus size={16} />
                                        <span>Thêm thành viên</span>
                                    </button>
                                </div>
                            )}

                            <div className={cx('members-list')}>
                                {sortedParticipants.map((member) => {
                                    const memberIdStr = member._id?.toString();
                                    const isMe = memberIdStr === currentUser?._id?.toString();
                                    const isThisCreator = groupCreatorId && memberIdStr === groupCreatorId;
                                    const isThisAdmin = isThisCreator || member.role === 'admin';
                                    const memberOnline = Array.isArray(onlineUsers) && onlineUsers.includes(memberIdStr);
                                    const canManageThisMember = isCurrentUserAdmin && !isMe && !isThisCreator;

                                    return (
                                        <div 
                                            key={member._id} 
                                            className={cx('member-row')}
                                        >
                                            <div 
                                                className={cx('member-main-click')}
                                                onClick={() => !isMe && handleViewProfile(member._id)}
                                            >
                                                <div className={cx('member-avatar-box')}>
                                                    <img 
                                                        src={getAvatarSrc(member.avatarURL)} 
                                                        className={cx('member-avatar')} 
                                                        alt="" 
                                                        onError={(e) => { e.target.src = defaultAvatar; }}
                                                    />
                                                    {memberOnline && <span className={cx('member-online-dot')} />}
                                                </div>
                                                
                                                <div className={cx('member-info')}>
                                                    <div className={cx('name-line')}>
                                                        <span className={cx('member-name')}>
                                                            {isMe ? `${member.displayName || "Bạn"} (Bạn)` : (member.displayName || member.username || "Thành viên")}
                                                        </span>
                                                        {isThisCreator ? (
                                                            <span className={cx('creator-badge')} title="Trưởng nhóm">
                                                                <Crown size={12} />
                                                                <span>Trưởng nhóm</span>
                                                            </span>
                                                        ) : isThisAdmin ? (
                                                            <span className={cx('admin-badge')} title="Quản trị viên">
                                                                <Shield size={12} />
                                                                <span>Quản trị viên</span>
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {member.username && (
                                                        <span className={cx('member-username')}>@{member.username}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {canManageThisMember && (
                                                <div className={cx('member-row-menu-container')} onClick={(e) => e.stopPropagation()}>
                                                    <button 
                                                        className={cx('member-menu-trigger')}
                                                        onClick={() => setActiveMemberMenu(activeMemberMenu === memberIdStr ? null : memberIdStr)}
                                                        title="Tùy chọn thành viên"
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>

                                                    {activeMemberMenu === memberIdStr && (
                                                        <div className={cx('member-menu-popover')}>
                                                            {member.role === 'admin' ? (
                                                                <button 
                                                                    className={cx('menu-opt')}
                                                                    onClick={() => handleUpdateRole(member._id, 'member')}
                                                                >
                                                                    <ShieldAlert size={15} />
                                                                    <span>Gỡ quyền Quản trị viên</span>
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    className={cx('menu-opt')}
                                                                    onClick={() => handleUpdateRole(member._id, 'admin')}
                                                                >
                                                                    <ShieldCheck size={15} />
                                                                    <span>Bổ nhiệm Quản trị viên</span>
                                                                </button>
                                                            )}
                                                            <button 
                                                                className={cx('menu-opt', 'danger')}
                                                                onClick={() => handleRemoveMember(member._id, member.displayName || member.username)}
                                                            >
                                                                <UserMinus size={15} />
                                                                <span>Xóa khỏi nhóm</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Group Danger Actions */}
                            <div className={cx('group-danger-section')}>
                                <button 
                                    type="button" 
                                    className={cx('group-action-btn', 'leave')}
                                    onClick={handleLeaveGroup}
                                >
                                    <LogOut size={16} />
                                    <span>Rời khỏi nhóm</span>
                                </button>
                                {isCurrentUserAdmin && (
                                    <button 
                                        type="button" 
                                        className={cx('group-action-btn', 'disband')}
                                        onClick={handleDisbandGroup}
                                    >
                                        <Trash2 size={16} />
                                        <span>Giải tán nhóm</span>
                                    </button>
                                )}
                            </div>
                        </Motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Lightbox Modal */}
            <AnimatePresence>
                {selectedImage && (
                    <Motion.div 
                        className={cx('overlay')}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedImage(null)}
                    >
                        <Motion.img 
                            src={selectedImage} 
                            className={cx('full-img')}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button 
                            className={cx('overlay-close')}
                            onClick={() => setSelectedImage(null)}
                            title="Đóng xem trước"
                        >
                            <X size={24} />
                        </button>
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* Add Member Modal */}
            {showAddMemberModal && (
                <AddMemberModal 
                    conversationId={chat._id}
                    existingParticipantIds={participants.map(p => p._id)}
                    onClose={() => setShowAddMemberModal(false)}
                />
            )}

            {/* Tree QR Code Modal */}
            <TreeQRCodeModal 
                isOpen={showQRModal}
                onClose={() => setShowQRModal(false)}
                type={isGroup ? 'group' : 'user'}
                title={isGroup ? `Mã QR nhóm ${displayName}` : `Mã QR của ${displayName}`}
                dataValue={
                    isGroup 
                        ? `${window.location.origin}/chat?joinGroup=true&invite=${groupInviteCode}` 
                        : `${window.location.origin}/feed/profile/${partnerId}?action=add_friend`
                }
                name={displayName}
                subText={isGroup ? `${participants.length} thành viên` : (partner?.username ? `@${partner.username}` : "Quét để kết nối")}
                avatarUrl={isGroup ? (chat.avatarURL || chat.group?.avatarURL) : partner?.avatarURL}
            />
        </Motion.div>
    );
};

export default ChatInfo;
