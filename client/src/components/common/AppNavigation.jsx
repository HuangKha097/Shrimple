import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import { getNavigationItems, hasUnreadMessages, isNavigationActive } from '../../config/navigation.js';
import styles from '../../assets/css/AppNavigation.module.scss';

export default function AppNavigation({ onNavigate }) {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const { conversations, friendRequests } = useChatStore();
    const { pathname } = useLocation();
    const unread = hasUnreadMessages(conversations, user?._id);
    return (
        <nav className={styles.navigation} aria-label="Main navigation">
            {getNavigationItems(user?._id).map(item => {
                const Icon = item.icon;
                const showBadge = (item.id === 'chat' && unread)
                    || (item.id === 'friends' && (friendRequests || []).length > 0);
                return (
                    <NavLink key={item.id} to={item.path} end={item.id === 'feed'} onClick={onNavigate}
                        aria-label={t(item.labelKey)}
                        className={`${styles.link} ${isNavigationActive(item, pathname) ? styles.active : ''}`}>
                        <span className={styles.icon}><Icon size={20} />{showBadge && <span className={styles.badge} />}</span>
                        <span>{t(item.labelKey)}</span>
                    </NavLink>
                );
            })}
        </nav>
    );
}
