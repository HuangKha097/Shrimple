import React, { useState, useEffect, useRef, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/CreateGroupPopUp.module.scss';
import {
    X, Camera, Search, Check, Users,
    Loader2
} from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import default_avt from "../../../public/favicon.png";

import { useNavigate } from 'react-router-dom';
import { useChatStore } from "../../stores/useChatStore.js";
import { toast } from "sonner";

const cx = classNames.bind(styles);

const CreateGroupPopup = ({ onCloseCreateGroupPopup }) => {
    const navigate = useNavigate();
    const { friends, fetchFriends, isCreatingGroup, createConversation } = useChatStore();

    // --- State Form ---
    const [groupName, setGroupName] = useState('');
    const [groupDesc, setGroupDesc] = useState('');
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [groupAvatarFile, setGroupAvatarFile] = useState(null);

    // --- State Members ---
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [searchKeyword, setSearchKeyword] = useState('');

    const fileInputRef = useRef(null);

    useEffect(() => {
        if (fetchFriends) fetchFriends();
    }, [fetchFriends]);

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setGroupAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const toggleMember = (user) => {
        if (!user || !user._id) return;
        const isSelected = selectedMembers.some(m => m._id === user._id);
        if (isSelected) {
            setSelectedMembers(prev => prev.filter(m => m._id !== user._id));
        } else {
            setSelectedMembers(prev => [...prev, user]);
        }
    };

    const safeFriends = useMemo(() => {
        return Array.isArray(friends) ? friends.filter(f => f && f._id) : [];
    }, [friends]);

    const filteredFriends = useMemo(() => {
        const query = searchKeyword.toLowerCase().trim();
        if (!query) return safeFriends;
        return safeFriends.filter(f =>
            (f.displayName || '').toLowerCase().includes(query) ||
            (f.username || '').toLowerCase().includes(query)
        );
    }, [safeFriends, searchKeyword]);

    // --- Validation ---
    const isNameValid = groupName.trim().length > 0;
    // Cần tối thiểu 2 người được chọn (cộng người tạo nhóm nữa là 3)
    const isMembersValid = selectedMembers.length >= 2;
    const canCreate = isNameValid && isMembersValid;

    // Submit
    const handleCreateGroup = async () => {
        if (isCreatingGroup) return;

        if (!isNameValid) {
            toast.error("Vui lòng nhập tên nhóm!");
            return;
        }
        if (!isMembersValid) {
            toast.warning(`Vui lòng chọn tối thiểu 2 người bạn (Hiện tại: ${selectedMembers.length})`);
            return;
        }

        try {
            const memberIds = selectedMembers.map(user => user._id);
            const newConvo = await createConversation(true, groupName.trim(), memberIds);
            toast.success(`Nhóm "${groupName}" đã được tạo thành công!`);
            onCloseCreateGroupPopup();
            if (newConvo && newConvo._id) {
                navigate(`/chat?id=${newConvo._id}`);
            }
        } catch (error) {
            console.error("Error creating group:", error);
            const msg = error.response?.data?.message || "Không thể tạo nhóm. Vui lòng thử lại.";
            toast.error(msg);
        }
    };

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
                        onClick={onCloseCreateGroupPopup}
                        title="Đóng"
                        aria-label="Đóng"
                    >
                        <X size={20} />
                    </button>
                    <h3 className={cx('title')}>Tạo nhóm mới</h3>
                </div>

                <button
                    className={cx('x-create-btn', { disabled: !canCreate || isCreatingGroup })}
                    onClick={handleCreateGroup}
                    disabled={!canCreate || isCreatingGroup}
                >
                    {isCreatingGroup ? (
                        <Loader2 className={cx('btn-spinner')} size={16} />
                    ) : (
                        <span>Tạo nhóm</span>
                    )}
                </button>
            </div>

            <div className={cx('body-content')}>
                {/* SECTION 1: Group Meta (Avatar & Name) */}
                <div className={cx('group-meta-section')}>
                    <div
                        className={cx('avatar-upload')}
                        onClick={() => fileInputRef.current?.click()}
                        title="Tải lên ảnh nhóm"
                    >
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Group Avatar" className={cx('avatar-preview')} />
                        ) : (
                            <div className={cx('avatar-placeholder')}>
                                <Camera size={22} />
                            </div>
                        )}
                        <div className={cx('avatar-overlay')}>
                            <Camera size={18} />
                        </div>
                        <input
                            type="file"
                            hidden
                            ref={fileInputRef}
                            accept="image/*"
                            onChange={handleImageChange}
                        />
                    </div>

                    <div className={cx('meta-inputs')}>
                        <input
                            type="text"
                            className={cx('input-group-name')}
                            placeholder="Đặt tên nhóm (Bắt buộc)..."
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            maxLength={60}
                            autoFocus
                        />
                        <div className={cx('member-counter-bar')}>
                            <span className={cx('counter-text', { ready: isMembersValid })}>
                                {selectedMembers.length >= 2 ? (
                                    <>Đã chọn <b>{selectedMembers.length}</b> thành viên</>
                                ) : (
                                    <>Đã chọn <b>{selectedMembers.length}</b> / 2 (cần tối thiểu 2 người)</>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: Selected Members Chips Tray */}
                <AnimatePresence>
                    {selectedMembers.length > 0 && (
                        <Motion.div 
                            className={cx('selected-tray')}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className={cx('chips-scroll')}>
                                {selectedMembers.map(user => {
                                    const name = user.displayName || user.username || 'Người dùng';
                                    return (
                                        <Motion.div 
                                            key={user._id} 
                                            className={cx('chip')}
                                            layout
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.8, opacity: 0 }}
                                        >
                                            <img 
                                                src={user.avatarURL || default_avt} 
                                                alt={name} 
                                                onError={(e) => { e.currentTarget.src = default_avt; }}
                                            />
                                            <span className={cx('chip-name')}>{name}</span>
                                            <button 
                                                className={cx('chip-remove')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleMember(user);
                                                }}
                                                title="Gỡ"
                                            >
                                                <X size={13} />
                                            </button>
                                        </Motion.div>
                                    );
                                })}
                            </div>
                        </Motion.div>
                    )}
                </AnimatePresence>

                {/* SECTION 3: Search Bar */}
                <div className={cx('search-wrapper')}>
                    <Search size={18} className={cx('search-icon')} />
                    <input
                        type="text"
                        placeholder="Tìm kiếm bạn bè..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className={cx('search-input')}
                    />
                    {searchKeyword && (
                        <button
                            type="button"
                            className={cx('clear-btn')}
                            onClick={() => setSearchKeyword('')}
                        >
                            <X size={15} />
                        </button>
                    )}
                </div>

                {/* SECTION 4: Friend Selection List */}
                <div className={cx('list-header')}>
                    <span className={cx('list-title')}>Bạn bè</span>
                    <span className={cx('list-subtitle')}>({safeFriends.length})</span>
                </div>

                <div className={cx('results-list')}>
                    {filteredFriends.length === 0 ? (
                        <div className={cx('empty-state')}>
                            <div className={cx('empty-icon-wrap')}>
                                <Users size={28} />
                            </div>
                            <h4 className={cx('empty-title')}>
                                {searchKeyword ? "Không tìm thấy bạn bè phù hợp" : "Chưa có bạn bè nào"}
                            </h4>
                            <p className={cx('empty-desc')}>
                                {searchKeyword 
                                    ? `Không có bạn bè nào khớp với "${searchKeyword}".`
                                    : "Hãy kết bạn thêm để tạo nhóm trò chuyện."}
                            </p>
                        </div>
                    ) : (
                        filteredFriends.map((user) => {
                            const isSelected = selectedMembers.some(m => m._id === user._id);
                            const displayName = user.displayName || user.username || 'Người dùng';
                            const username = user.username ? `@${user.username}` : '';
                            const avatar = user.avatarURL || default_avt;

                            return (
                                <div
                                    key={user._id}
                                    className={cx('user-row', { selected: isSelected })}
                                    onClick={() => toggleMember(user)}
                                >
                                    <div className={cx('user-info')}>
                                        <img 
                                            src={avatar} 
                                            alt={displayName} 
                                            className={cx('avatar')} 
                                            onError={(e) => { e.currentTarget.src = default_avt; }}
                                        />
                                        <div className={cx('details')}>
                                            <span className={cx('name')}>{displayName}</span>
                                            {username && <span className={cx('username')}>{username}</span>}
                                        </div>
                                    </div>

                                    {/* X-style Circular Checkmark */}
                                    <div className={cx('checkbox-circle', { checked: isSelected })}>
                                        {isSelected && <Check size={14} className={cx('check-icon')} strokeWidth={3} />}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </Motion.div>
    );
};

export default CreateGroupPopup;