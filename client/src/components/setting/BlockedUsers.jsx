import { useState, useEffect } from 'react';
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/SettingContainer.module.scss';
import { userSettingsService } from "../../services/userSettingsService.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import { toast } from 'sonner';


const cx = classNames.bind(styles);

const BlockedUsers = () => {
    const { t } = useTranslation();
    const [blockedList, setBlockedList] = useState([]);
    const { checkAuth } = useAuthStore(); // Unblocking might change user object (blockedUsers array)

    useEffect(() => {
        fetchBlockedUsers();
    }, []);

    const fetchBlockedUsers = async () => {
        try {
            const users = await userSettingsService.getBlockedUsers();
            setBlockedList(users);
        } catch (error) {
            console.error("Failed to fetch blocked users", error);
        }
    };

    const handleUnblock = async (userId) => {
        if (!window.confirm("Bạn có chắc chắn muốn bỏ chặn người dùng này?")) return;

        try {
            await userSettingsService.unblockUser(userId);
            setBlockedList(prev => prev.filter(u => u._id !== userId));
            checkAuth();
            toast.success("Đã bỏ chặn");
        } catch (error) {
            console.error("Failed to unblock user", error);
            toast.error("Không thể bỏ chặn người dùng");
        }
    };

    return (
        <>
            <h3>{t('settings.blockedTab')}</h3>
            <div className={cx('section')}>
                <h4>{t('settings.blockedSublabel')}</h4>
                {blockedList.length === 0 ? (
                    <p style={{ fontSize: '1.4rem', color: 'var(--text-muted)' }}>{t('settings.noBlockedUsers')}</p>
                ) : (
                    <ul className={cx('blocked-list')}>
                        {blockedList.map(u => (
                            <li key={u._id} className={cx('blocked-item')}>
                                <div className={cx('info')}>
                                    <img src={u.avatarURL || "/favicon.png"} alt="avatar" />
                                    <span>{u.displayName || u.username}</span>
                                </div>
                                <button onClick={() => handleUnblock(u._id)} className={cx('unblock-btn')}>{t('settings.unblock')}</button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
};

export default BlockedUsers;
