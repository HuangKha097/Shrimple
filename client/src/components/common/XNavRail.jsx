import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
    MessageSquare, 
    Newspaper, 
    Video, 
    Bookmark, 
    Users, 
    User, 
    Settings, 
    LogOut,
    SquarePen,
    Feather,
    MoreHorizontal
} from 'lucide-react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/XNavRail.module.scss';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import { motion as Motion } from 'motion/react';
import defaultAvatar from '../../../public/favicon.png';
import { ASSET_BASE_URL } from '../../config/env';

const cx = classNames.bind(styles);

export default function XNavRail({ onCloseSetting, onOpenNewChat, onOpenPostModal }) {
    const { t } = useTranslation();
    const { user, signOut } = useAuthStore();
    const conversations = useChatStore(state => state.conversations || []);
    const friendRequests = useChatStore(state => state.friendRequests || []);
    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);

    const hasUnreadMessages = conversations.some(c => {
        if (!c || !c.unreadCounts) return false;
        let count = 0;
        if (c.unreadCounts instanceof Map) {
            count = c.unreadCounts.get(user?._id) || 0;
        } else if (typeof c.unreadCounts === 'object') {
            count = c.unreadCounts[user?._id] || 0;
        } else if (typeof c.unreadCounts === 'number') {
            count = c.unreadCounts;
        }
        return count > 0;
    });

    const getAvatarSrc = (url) => {
        if (!url) return defaultAvatar;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${ASSET_BASE_URL}${url}`;
    };

    const handleLogout = async () => {
        if (confirm(t('nav.signOutConfirm'))) {
            await signOut();
        }
    };

    const navItems = [
        { path: '/feed', icon: <Newspaper size={24} strokeWidth={2} />, label: t('nav.feed') },
        { path: '/chat', icon: <MessageSquare size={24} strokeWidth={2} />, label: t('nav.chat') },
        { path: '/video', icon: <Video size={24} strokeWidth={2} />, label: t('nav.video') },
        { path: '/feed/friends', icon: <Users size={24} strokeWidth={2} />, label: t('nav.friends') },
        { path: user?._id ? `/feed/profile/${user._id}` : '/feed', icon: <User size={24} strokeWidth={2} />, label: t('nav.profile') },
    ];

    const handlePostClick = () => {
        if (onOpenPostModal) {
            onOpenPostModal();
        } else {
            navigate('/feed');
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                const textarea = document.querySelector('textarea[data-composer-input]');
                if (textarea) textarea.focus();
            }, 100);
        }
    };

    return (
        <aside className={cx('nav-rail')} aria-label="X Global Navigation">
            {/* Top: Logo Container (Always full text logo) */}
            <div className={cx('logo-container')}>
                <button 
                    type="button" 
                    className={cx('logo-btn', 'text-logo-btn')} 
                    onClick={() => navigate('/feed')}
                    title="Trang chủ Shrimple"
                    aria-label="Trang chủ"
                >
                    <div className={cx('text-logo-wrapper')}>
                        <img 
                            src="/logo_remove_bg.png" 
                            alt="Shrimple" 
                            className={cx('shrimple-text-logo')}
                        />
                    </div>
                </button>
            </div>

            {/* Middle: Navigation Links */}
            <nav className={cx('nav-links')}>
                {navItems.map((item) => {
                    const isActive = item.path === '/chat' 
                        ? location.pathname.startsWith('/chat') 
                        : (item.path === '/feed' ? location.pathname === '/feed' : location.pathname.startsWith(item.path));
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={cx('nav-item', { active: isActive })}
                            title={item.label}
                            aria-label={item.label}
                        >
                            <div className={cx('icon-wrapper')}>
                                {item.icon}
                                {item.path === '/chat' && hasUnreadMessages && (
                                    <span className={cx('unread-red-dot')} />
                                )}
                                {item.path === '/feed/friends' && (friendRequests || []).length > 0 && (
                                    <span className={cx('unread-red-dot')} />
                                )}
                            </div>
                            <span className={cx('nav-label')}>{item.label}</span>
                        </NavLink>
                    );
                })}

                {/* Settings Item */}
                <NavLink
                    to="/setting"
                    className={({ isActive }) => cx('nav-item', { active: isActive || location.pathname.startsWith('/setting') })}
                    title={t('nav.settings')}
                    aria-label={t('nav.settings')}
                >
                    <div className={cx('icon-wrapper')}>
                        <Settings size={24} strokeWidth={2} />
                    </div>
                    <span className={cx('nav-label')}>{t('nav.settings')}</span>
                </NavLink>

                {/* Post Action Button */}
                <Motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                    type="button"
                    className={cx('post-action-btn')}
                    onClick={handlePostClick}
                    title={t('nav.postNew')}
                    aria-label={t('nav.post')}
                >
                    <div className={cx('btn-shimmer')} aria-hidden="true" />
                    <span className={cx('post-btn-text')}>{t('nav.post')}</span>
                    <Feather size={20} className={cx('post-btn-icon')} />
                </Motion.button>
            </nav>

            {/* Bottom: User Profile Card */}
            <div className={cx('bottom-container')}>
                <div className={cx('user-menu-wrapper')}>
                    <button
                        type="button"
                        className={cx('avatar-btn')}
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        title={user?.displayName || "Tài khoản"}
                        aria-label="User menu"
                    >
                        <img 
                            src={getAvatarSrc(user?.avatarURL)} 
                            alt={user?.displayName || "User"} 
                            className={cx('avatar-img')}
                            onError={(e) => { e.target.src = defaultAvatar; }}
                        />
                        <div className={cx('user-pill-details')}>
                            <span className={cx('user-pill-name')}>{user?.displayName || 'User'}</span>
                            <span className={cx('user-pill-handle')}>@{user?.username || 'user'}</span>
                        </div>
                        <MoreHorizontal size={18} className={cx('user-pill-more')} />
                    </button>

                    {showUserMenu && (
                        <>
                            <div className={cx('menu-backdrop')} onClick={() => setShowUserMenu(false)} />
                            <div className={cx('user-popover')}>
                                <div className={cx('user-info-row')}>
                                    <img 
                                        src={getAvatarSrc(user?.avatarURL)} 
                                        alt="" 
                                        className={cx('popover-avatar')}
                                        onError={(e) => { e.target.src = defaultAvatar; }}
                                    />
                                    <div className={cx('popover-names')}>
                                        <p className={cx('display-name')}>{user?.displayName}</p>
                                        <p className={cx('username')}>@{user?.username}</p>
                                    </div>
                                </div>
                                <div className={cx('popover-divider')} />
                                <button
                                    type="button"
                                    className={cx('popover-item')}
                                    onClick={() => {
                                        setShowUserMenu(false);
                                        if (user?._id) {
                                            navigate(`/feed/profile/${user._id}`);
                                        }
                                    }}
                                >
                                    <User size={16} />
                                    <span>{t('nav.yourProfile')}</span>
                                </button>
                                <button
                                    type="button"
                                    className={cx('popover-item', 'logout-item')}
                                    onClick={() => {
                                        setShowUserMenu(false);
                                        handleLogout();
                                    }}
                                >
                                    <LogOut size={16} />
                                    <span>{t('nav.signOut')} @{user?.username}</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
