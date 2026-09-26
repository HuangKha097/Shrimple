import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/SettingContainer.module.scss';
import { 
    User, 
    Globe, 
    Bell, 
    EyeOff, 
    UserX, 
    Info, 
    ChevronRight, 
    ArrowLeft, 
    LogOut 
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';

// Tab Components
import AccountSettings from './AccountSettings';
import LanguageSettings from './LanguageSettings';
import Notifications from './Notifications';
import AntiPeepSettings from './AntiPeepSettings';
import BlockedUsers from './BlockedUsers';
import Application from './Application';

const cx = classNames.bind(styles);

const SettingContainer = () => {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { signOut } = useAuthStore();

    const tabs = useMemo(() => [
        {
            id: 'account',
            label: t('settings.accountTab'),
            sublabel: t('settings.accountSublabel'),
            icon: <User size={20} />
        },
        {
            id: 'language',
            label: t('settings.languageTab'),
            sublabel: t('settings.languageSublabel'),
            icon: <Globe size={20} />
        },
        {
            id: 'notifications',
            label: t('settings.notificationsTab'),
            sublabel: t('settings.notificationsSublabel'),
            icon: <Bell size={20} />
        },
        {
            id: 'anti-peep',
            label: t('settings.antiPeepTab'),
            sublabel: t('settings.antiPeepSublabel'),
            icon: <EyeOff size={20} />
        },
        {
            id: 'blocked',
            label: t('settings.blockedTab'),
            sublabel: t('settings.blockedSublabel'),
            icon: <UserX size={20} />
        },
        {
            id: 'application',
            label: t('settings.applicationTab'),
            sublabel: t('settings.applicationSublabel'),
            icon: <Info size={20} />
        },
    ], [t]);

    const initialTab = searchParams.get('tab') || 'account';
    const [activeTab, setActiveTab] = useState(
        tabs.some(t => t.id === initialTab) ? initialTab : 'account'
    );
    const [mobileView, setMobileView] = useState('menu'); // 'menu' | 'detail'

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam && tabs.some(t => t.id === tabParam)) {
            setActiveTab(tabParam);
            setMobileView('detail');
        }
    }, [searchParams, tabs]);

    const handleSelectTab = (tabId) => {
        setActiveTab(tabId);
        setSearchParams({ tab: tabId });
        setMobileView('detail');
    };

    const handleBackToMenu = () => {
        setMobileView('menu');
    };

    const handleLogout = async () => {
        if (confirm(t('settings.signOutConfirm'))) {
            await signOut();
        }
    };

    const currentTabInfo = tabs.find(t => t.id === activeTab) || tabs[0];

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'account':
                return <AccountSettings handleLogout={handleLogout} />;
            case 'language':
                return <LanguageSettings />;
            case 'notifications':
                return <Notifications />;
            case 'anti-peep':
                return <AntiPeepSettings />;
            case 'blocked':
                return <BlockedUsers />;
            case 'application':
                return <Application />;
            default:
                return <AccountSettings handleLogout={handleLogout} />;
        }
    };

    return (
        <div className={cx('settings-page', { 'show-detail-mobile': mobileView === 'detail' })}>
            {/* Column 1: Settings Navigation Menu */}
            <div className={cx('settings-nav-col')}>
                <div className={cx('settings-nav-header')}>
                    <button 
                        type="button" 
                        className={cx('mobile-home-btn')}
                        onClick={() => navigate(-1)}
                        title="Quay lại"
                        aria-label="Quay lại"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h2>{t('settings.title')}</h2>
                </div>

                <div className={cx('settings-nav-list')}>
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                className={cx('nav-item', { active: isActive })}
                                onClick={() => handleSelectTab(tab.id)}
                            >
                                <div className={cx('nav-icon-wrapper', { active: isActive })}>
                                    {tab.icon}
                                </div>
                                <div className={cx('nav-text-group')}>
                                    <span className={cx('nav-item-title')}>{tab.label}</span>
                                    <span className={cx('nav-item-sub')}>{tab.sublabel}</span>
                                </div>
                                <ChevronRight size={18} className={cx('nav-arrow')} />
                            </button>
                        );
                    })}

                    <div className={cx('nav-divider')} />

                    <button
                        type="button"
                        className={cx('nav-item', 'logout-btn')}
                        onClick={handleLogout}
                    >
                        <div className={cx('nav-icon-wrapper', 'logout-icon')}>
                            <LogOut size={20} />
                        </div>
                        <div className={cx('nav-text-group')}>
                            <span className={cx('nav-item-title', 'logout-text')}>{t('settings.signOut')}</span>
                            <span className={cx('nav-item-sub')}>{t('settings.signOutConfirm')}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Column 2: Selected Tab Content */}
            <div className={cx('settings-content-col')}>
                <div className={cx('settings-content-header')}>
                    <button
                        type="button"
                        className={cx('content-back-btn')}
                        onClick={handleBackToMenu}
                        title="Quay lại danh mục"
                        aria-label="Quay lại danh mục"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className={cx('header-title-wrapper')}>
                        <span className={cx('content-header-title')}>{currentTabInfo.label}</span>
                    </div>
                </div>

                <div className={cx('settings-content-body')}>
                    {renderActiveTabContent()}
                </div>
            </div>
        </div>
    );
};

export default SettingContainer;