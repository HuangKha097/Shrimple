import { NavLink } from 'react-router-dom';
import { MessageSquare, Newspaper, Video, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../stores/useThemeStore';
import styles from '../../assets/css/AppNavigation.module.scss';

export default function AppNavigation({ onNavigate }) {
    return (
        <nav className={styles.navigation} aria-label="Main navigation">
            {[[ '/chat', <MessageSquare size={19} />, 'Chat' ], [ '/feed', <Newspaper size={19} />, 'Feeds' ], [ '/video', <Video size={19} />, 'Videos' ]].map(([path, icon, label]) => (
                <NavLink key={path} to={path} onClick={onNavigate}
                    className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
                    {icon}<span>{label}</span>
                </NavLink>
            ))}
        </nav>
    );
}

export function ThemeToggle() {
    const { isLight, toggleTheme } = useThemeStore();
    return (
        <button type="button" className={styles.themeToggle} onClick={toggleTheme}
            aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
            title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}>
            {isLight ? <Moon size={18} /> : <Sun size={18} />}
        </button>
    );
}
