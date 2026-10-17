import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { User, LogOut, Feather, MoreHorizontal } from 'lucide-react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/XNavRail.module.scss';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import { motion as Motion } from 'motion/react';
import defaultAvatar from '../../../public/favicon.png';
import { ASSET_BASE_URL } from '../../config/env';
import { getNavigationItems, hasUnreadMessages as checkUnreadMessages, isNavigationActive, openPostComposer } from '../../config/navigation.js';

const cx = classNames.bind(styles);

export default function XNavRail({ onOpenPostModal }) {
    const { t } = useTranslation();
    const { user, signOut } = useAuthStore();
    const conversations = useChatStore(state => state.conversations || []);
    const friendRequests = useChatStore(state => state.friendRequests || []);
    const navigate = useNavigate();
    const location = useLocation();
    const [showUserMenu, setShowUserMenu] = useState(false);

    const hasUnreadMessages = checkUnreadMessages(conversations, user?._id);

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

    const navItems = getNavigationItems(user?._id);

    const handlePostClick = () => {
        if (onOpenPostModal) {
            onOpenPostModal();
        } else {
            openPostComposer(navigate);
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
                    const isActive = isNavigationActive(item, location.pathname);
                    const Icon = item.icon;
                    const label = t(item.labelKey);
                    return (
                        <NavLink
                            key={item.id}
                            to={item.path}
                            end={item.id === 'feed'}
                            className={cx('nav-item', { active: isActive })}
                            title={label}
                            aria-label={label}
                        >
                            <div className={cx('icon-wrapper')}>
                                <Icon size={24} strokeWidth={2} />
                                {item.path === '/chat' && hasUnreadMessages && (
                                    <span className={cx('unread-red-dot')} />
                                )}
                                {item.path === '/feed/friends' && (friendRequests || []).length > 0 && (
                                    <span className={cx('unread-red-dot')} />
                                )}
                            </div>
                            <span className={cx('nav-label')}>{label}</span>
                        </NavLink>
                    );
                })}

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
