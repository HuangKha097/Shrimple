import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Users, Settings, X } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import AppNavigation, { ThemeToggle } from '../common/AppNavigation';
import styles from '../../assets/css/PostsSidebar.module.scss';

export default function PostsSidebar({ onCloseSetting, onNavigate, onClose }) {
    const { user } = useAuthStore();
    const { suggestedFriends, fetchSuggestedFriends } = useChatStore();
    const navigate = useNavigate();
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
                <button className={styles.closeMenu} onClick={onClose} aria-label="Close navigation"><X size={22} /></button>
            </div>
            <AppNavigation onNavigate={onNavigate} />
            <button className={styles.profile} onClick={() => user?._id && openProfile(user._id)}>
                <img src={user?.avatarURL || '/favicon.png'} alt="" />
                <span><strong>{user?.displayName}</strong><small>@{user?.username}</small></span>
            </button>
            <div className={styles.body}>
                <p className={styles.sectionTitle}>YOUR SPACE</p>
                <nav aria-label="Your space" className={styles.menu}>
                    {[[ '/feed/friends', <Users size={20} />, 'Bạn bè' ]].map(([path, icon, label]) => (
                        <NavLink key={path} to={path} onClick={onNavigate} className={({isActive}) => isActive ? styles.active : ''}>
                            {icon}<span>{label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className={styles.suggestions}>
                    <p className={styles.sectionTitle}>PEOPLE TO KNOW</p>
                    {(!suggestedFriends || suggestedFriends.length === 0) ? (
                        <p className={styles.empty}>Suggestions will appear here.</p>
                    ) : (
                        (suggestedFriends || []).filter(f => f && f._id).slice(0, 5).map(friend => (
                            <button key={friend._id} className={styles.friend} onClick={() => openProfile(friend._id)}>
                                <img src={friend.avatarURL || '/favicon.png'} alt="" /><span>{friend.displayName}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
            <div className={styles.footer}>
                <button className={styles.settings} onClick={() => { if (onNavigate) onNavigate(); navigate('/setting'); }}><Settings size={19} /> Settings</button>
                <ThemeToggle />
            </div>
        </aside>
    );
}
