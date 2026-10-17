import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Feather, LogOut, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import AppNavigation from '../common/AppNavigation';
import { ASSET_BASE_URL } from '../../config/env.js';
import { openPostComposer } from '../../config/navigation.js';
import styles from '../../assets/css/PostsSidebar.module.scss';

export default function PostsSidebar({ onNavigate, onClose }) {
    const { t } = useTranslation();
    const { user, signOut } = useAuthStore();
    const { suggestedFriends, fetchSuggestedFriends } = useChatStore();
    const navigate = useNavigate();
    const avatarSrc = (url) => !url ? '/favicon.png'
        : /^(https?:|data:)/i.test(url) ? url : `${ASSET_BASE_URL}/${url.replace(/^\/+/, '')}`;
    const handleLogout = async () => {
        if (confirm(t('nav.signOutConfirm'))) {
            await signOut();
            onNavigate?.();
        }
    };
    useEffect(() => { fetchSuggestedFriends(); }, [fetchSuggestedFriends]);
    const openProfile = (id) => { 
        if (!id) return;
        navigate('/feed/profile/' + id); 
        if (onNavigate) onNavigate(); 
    };
    return (
        <aside className={styles.sidebar} aria-label="Social navigation">
            <div className={styles.brandRow}>
                <NavLink to="/feed" onClick={onNavigate} className={styles.brand}>Shrimple<span>Stay connected.</span></NavLink>
                <button type="button" className={styles.closeMenu} onClick={onClose} aria-label="Close navigation"><X size={22} /></button>
            </div>
            <button type="button" className={styles.profile} onClick={() => user?._id && openProfile(user._id)}>
                <img src={avatarSrc(user?.avatarURL)} alt="" onError={e => { e.currentTarget.src = '/favicon.png'; }} />
                <span><strong>{user?.displayName}</strong><small>@{user?.username}</small></span>
            </button>
            <div className={styles.body}>
                <AppNavigation onNavigate={onNavigate} />
                <button type="button" className={styles.post} aria-label={t('nav.post')} title={t('nav.postNew')}
                    onClick={() => { onNavigate?.(); openPostComposer(navigate); }}>
                    <Feather size={20} /><span>{t('nav.post')}</span>
                </button>
                <div className={styles.suggestions}>
                    <p className={styles.sectionTitle}>{t('feed.whoToFollow')}</p>
                    {(!suggestedFriends || suggestedFriends.length === 0) ? (
                        <p className={styles.empty}>{t('friends.emptySuggestions')}</p>
                    ) : (
                        (suggestedFriends || []).filter(f => f && f._id).slice(0, 5).map(friend => (
                            <button type="button" key={friend._id} className={styles.friend} onClick={() => openProfile(friend._id)}>
                                <img src={avatarSrc(friend.avatarURL)} alt="" onError={e => { e.currentTarget.src = '/favicon.png'; }} /><span>{friend.displayName}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
            <div className={styles.footer}>
                <button type="button" className={styles.logout} onClick={handleLogout}><LogOut size={19} />{t('nav.signOut')}</button>
            </div>
        </aside>
    );
}
