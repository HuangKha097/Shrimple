import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames/bind';
import styles from '../../assets/css/ForwardModal.module.scss';
import defaultAvatar from "../../../public/favicon.png";
import { Search, X, Check } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from 'sonner';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);

const ForwardModal = ({ messageId, onClose }) => {
    const { conversations, friends, forwardMessageAction } = useChatStore();
    const { user: currentUser } = useAuthStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const getSafeAvatar = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    // Preprocess conversations to resolve display names and avatars
    const resolvedConversations = useMemo(() => {
        return conversations
            .map(convo => {
                const isGroup = convo.isGroup;
                let name = "Cuộc trò chuyện";
                let avatar = defaultAvatar;
                let subText = "";
                let isValidTarget = true;

                if (isGroup) {
                    name = convo.name || convo.group?.name || "Nhóm chưa đặt tên";
                    avatar = getSafeAvatar(convo.avatarURL || convo.group?.avatarURL);
                    subText = `${convo.participants?.length || 0} thành viên`;
                } else {
                    // 1-1 chat
                    let partner = convo.participants?.find(p => {
                        const id = p._id || (typeof p.userId === 'object' ? p.userId?._id : p.userId);
                        return id?.toString() !== currentUser?._id?.toString();
                    });
                    if (!partner && convo.participants?.length > 0) {
                        partner = convo.participants[0];
                    }

                    const partnerIdStr = (partner?._id || (typeof partner?.userId === 'object' ? partner?.userId?._id : partner?.userId))?.toString();
                    const friend = friends.find(f => f._id?.toString() === partnerIdStr);

                    if (friend) {
                        partner = { ...partner, ...friend };
                    } else {
                        isValidTarget = false;
                    }

                    name = partner?.displayName || partner?.username || "Người dùng";
                    avatar = getSafeAvatar(partner?.avatarURL);
                    subText = partner?.username ? `@${partner.username}` : "Trò chuyện trực tiếp";
                }

                return {
                    id: convo._id,
                    name,
                    avatar,
                    subText,
                    isGroup,
                    isValidTarget
                };
            })
            .filter(c => c.isValidTarget);
    }, [conversations, currentUser, friends]);

    // Filter by search query
    const filteredConversations = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return resolvedConversations;

        return resolvedConversations.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.subText.toLowerCase().includes(query)
        );
    }, [resolvedConversations, searchQuery]);

    const handleToggleSelect = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) 
                ? prev.filter(item => item !== id) 
                : [...prev, id]
        );
    };

    const handleForward = async () => {
        if (selectedIds.length === 0) {
            toast.warning("Vui lòng chọn ít nhất một cuộc trò chuyện để chuyển tiếp!");
            return;
        }

        setIsSubmitting(true);
        try {
            await forwardMessageAction(messageId, selectedIds);
            toast.success("Chuyển tiếp tin nhắn thành công!");
            onClose();
        } catch (error) {
            console.error("Error forwarding message:", error);
            toast.error(error.response?.data?.message || "Lỗi chuyển tiếp tin nhắn");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className={cx('overlay')} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={cx('modal-card')}>
                <div className={cx('header')}>
                    <h3 className={cx('title')}>Chuyển tiếp tin nhắn</h3>
                    <button className={cx('close-btn')} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={cx('search-bar')}>
                    <Search className={cx('search-icon')} size={18} />
                    <input 
                        type="text" 
                        placeholder="Tìm kiếm bạn bè hoặc nhóm..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cx('search-input')}
                    />
                </div>

                <div className={cx('content-list')}>
                    {filteredConversations.length > 0 ? (
                        filteredConversations.map((convo) => {
                            const isChecked = selectedIds.includes(convo.id);
                            return (
                                <div 
                                    key={convo.id} 
                                    className={cx('convo-item', { selected: isChecked })}
                                    onClick={() => handleToggleSelect(convo.id)}
                                >
                                    <div className={cx('item-left')}>
                                        <img 
                                            src={convo.avatar} 
                                            alt={convo.name} 
                                            className={cx('avatar')}
                                            onError={(e) => { e.target.src = defaultAvatar }}
                                        />
                                        <div className={cx('details')}>
                                            <p className={cx('name')}>{convo.name}</p>
                                            <p className={cx('subtext')}>{convo.subText}</p>
                                        </div>
                                    </div>
                                    <div className={cx('checkbox-wrapper')}>
                                        <div className={cx('custom-checkbox', { checked: isChecked })}>
                                            {isChecked && <Check size={12} className={cx('check-icon')} />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className={cx('empty-state')}>
                            Không tìm thấy cuộc trò chuyện nào
                        </div>
                    )}
                </div>

                <div className={cx('footer')}>
                    <button 
                        className={cx('cancel-btn')} 
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Hủy
                    </button>
                    <button 
                        className={cx('forward-btn', { active: selectedIds.length > 0 })}
                        onClick={handleForward}
                        disabled={isSubmitting || selectedIds.length === 0}
                    >
                        {isSubmitting ? "Đang gửi..." : `Gửi (${selectedIds.length})`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ForwardModal;
