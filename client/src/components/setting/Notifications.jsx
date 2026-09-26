import React, { useState, useEffect } from 'react';
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/SettingContainer.module.scss';
import { useAuthStore } from "../../stores/useAuthStore.js";
import { userSettingsService } from "../../services/userSettingsService.js";

const cx = classNames.bind(styles);

const Notifications = () => {
    const { t } = useTranslation();
    const { user, checkAuth } = useAuthStore();
    
    // Initialize from user settings or defaults
    const [soundEnabled, setSoundEnabled] = useState(user?.settings?.soundEnabled ?? true);
    const [desktopNotifications, setDesktopNotifications] = useState(user?.settings?.desktopNotifications ?? false);

    useEffect(() => {
        if (user?.settings) {
            setSoundEnabled(user.settings.soundEnabled ?? true);
            setDesktopNotifications(user.settings.desktopNotifications ?? false);
        }
    }, [user]);

    const handleSoundChange = async (e) => {
        const newVal = e.target.checked;
        setSoundEnabled(newVal);
        try {
            await userSettingsService.updateSettings({ soundEnabled: newVal });
            // Optionally refresh user to sync store (though local state is updated)
            checkAuth(); // To be safe
        } catch (error) {
            console.error("Failed to update sound settings", error);
            setSoundEnabled(!newVal); // Revert
        }
    };

    const handleDesktopChange = async (e) => {
        const newVal = e.target.checked;
        setDesktopNotifications(newVal);
        try {
             await userSettingsService.updateSettings({ desktopNotifications: newVal });
             checkAuth();
        } catch (error) {
            console.error("Failed to update desktop settings", error);
            setDesktopNotifications(!newVal);
        }
    };

    return (
        <>
            <h3>{t('settings.notificationsTab')}</h3>
            
            <div className={cx('section')}>
                <h4>Alerts</h4>
                <div className={cx('form-group', 'row-layout')}>
                    <label>{t('settings.sound')}</label>
                    <label className={cx('switch')}>
                        <input 
                            type="checkbox" 
                            checked={soundEnabled} 
                            onChange={handleSoundChange}
                        />
                        <span className={cx('slider')}></span>
                    </label>
                </div>

                 <div className={cx('form-group', 'row-layout')}>
                    <label>{t('settings.desktopNotifications')}</label>
                    <label className={cx('switch')}>
                        <input 
                            type="checkbox" 
                            checked={desktopNotifications} 
                            onChange={handleDesktopChange}
                        />
                        <span className={cx('slider')}></span>
                    </label>
                </div>
            </div>
        </>
    );
};

export default Notifications;
