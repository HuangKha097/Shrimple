import React, { useState, useMemo } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion, AnimatePresence } from 'motion/react';
import styles from '../../assets/css/AddMemberModal.module.scss';
import defaultAvatar from "../../../public/favicon.png";
import { UserPlus, X, Search, Check } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { toast } from 'sonner';
import { ASSET_BASE_URL } from '../../config/env.js';

const cx = classNames.bind(styles);

const AddMemberModal = ({ conversationId, existingParticipantIds = [], onClose }) => {
    const { friends, addMembersAction } = useChatStore();
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const getSafeAvatar = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    const existingSet = useMemo(() => {
        return new Set(existingParticipantIds.map(id => id?.toString()));
    }, [existingParticipantIds]);

    const candidateFriends = useMemo(() => {
        const query = search.trim().toLowerCase();
        return (friends || [])
            .filter(f => f && !existingSet.has(f._id?.toString()))
            .filter(f => {
                if (!query) return true;
                const name = (f.displayName || '').toLowerCase();
                const username = (f.username || '').toLowerCase();
                return name.includes(query) || username.includes(query);
            });
    }, [friends, existingSet, search]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        if (selectedIds.length === 0) return;
        try {
            setIsSubmitting(true);
            await addMembersAction(conversationId, selectedIds);
            toast.success(`Đã thêm ${selectedIds.length} thành viên vào nhóm`);
            onClose();
        } catch (error) {
            console.error("Failed to add members:", error);
            toast.error(error.response?.data?.message || "Không thể thêm thành viên");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className={cx('overlay')} onClick={onClose}>
                <Motion.div 
                    className={cx('modal')}
                    initial={{ opacity: 0, scale: 0.94, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 15 }}
                    transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={cx('header')}>
                        <div className={cx('title-group')}>
                            <div className={cx('icon-box')}>
                                <UserPlus size={18} />
                            </div>
                            <h3 className={cx('title')}>Thêm thành viên</h3>
                        </div>
                        <button className={cx('close-btn')} onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>

                    <div className={cx('search-bar')}>
                        <Search size={16} className={cx('search-icon')} />
                        <input
                            type="text"
                            className={cx('search-input')}
                            placeholder="Tìm kiếm bạn bè..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className={cx('friends-list')}>
                        {candidateFriends.length > 0 ? (
                            candidateFriends.map((friend) => {
                                const isSelected = selectedIds.includes(friend._id);
                                return (
                                    <div
                                        key={friend._id}
                                        className={cx('friend-row', { selected: isSelected })}
                                        onClick={() => toggleSelect(friend._id)}
                                    >
                                        <div className={cx('friend-info')}>
                                            <img
                                                src={getSafeAvatar(friend.avatarURL)}
                                                alt={friend.displayName}
                                                className={cx('avatar')}
                                                onError={(e) => { e.target.src = defaultAvatar; }}
                                            />
                                            <div className={cx('text-box')}>
                                                <span className={cx('name')}>{friend.displayName || friend.username}</span>
                                                {friend.username && <span className={cx('username')}>@{friend.username}</span>}
                                            </div>
                                        </div>

                                        <div className={cx('checkbox', { checked: isSelected })}>
                                            {isSelected && <Check size={13} strokeWidth={3} />}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className={cx('empty-note')}>
                                {friends?.length === 0 
                                    ? "Bạn chưa có bạn bè nào để thêm" 
                                    : "Tất cả bạn bè đã ở trong nhóm"}
                            </div>
                        )}
                    </div>

                    <div className={cx('footer')}>
                        <button
                            type="button"
                            className={cx('btn-cancel')}
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            className={cx('btn-submit')}
                            onClick={handleSubmit}
                            disabled={isSubmitting || selectedIds.length === 0}
                        >
                            {isSubmitting ? "Đang thêm..." : `Thêm (${selectedIds.length})`}
                        </button>
                    </div>
                </Motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AddMemberModal;
