import React from 'react';
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import { toast } from 'sonner';
import styles from '../../assets/css/SettingContainer.module.scss';

const cx = classNames.bind(styles);

const LANGUAGES = [
    {
        code: 'vi',
        name: 'Tiếng Việt',
        nativeName: 'Tiếng Việt',
        flag: '🇻🇳',
        desc: 'Tiếng Việt (Mặc định)'
    },
    {
        code: 'en',
        name: 'English',
        nativeName: 'English (US)',
        flag: '🇬🇧',
        desc: 'English - Global'
    },
    {
        code: 'zh',
        name: '中文',
        nativeName: '简体中文',
        flag: '🇨🇳',
        desc: 'Simplified Chinese'
    }
];

const LanguageSettings = () => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language || localStorage.getItem('app_language') || 'vi';

    const handleSelectLanguage = (langCode) => {
        if (currentLang === langCode) return;
        i18n.changeLanguage(langCode);
        localStorage.setItem('app_language', langCode);
        const selected = LANGUAGES.find(l => l.code === langCode);
        toast.success(`Đã chuyển sang ${selected?.name || langCode}`);
    };

    return (
        <div className={cx('language-settings-container')}>
            <div className={cx('language-header')}>
                <div className={cx('language-icon-badge')}>
                    <Globe size={24} />
                </div>
                <div>
                    <h3>{t('settings.languageHeader')}</h3>
                    <p className={cx('language-subtitle')}>{t('settings.languageDesc')}</p>
                </div>
            </div>

            <div className={cx('language-list')}>
                {LANGUAGES.map((lang) => {
                    const isSelected = currentLang === lang.code;
                    return (
                        <div
                            key={lang.code}
                            className={cx('language-item', { active: isSelected })}
                            onClick={() => handleSelectLanguage(lang.code)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleSelectLanguage(lang.code);
                                }
                            }}
                        >
                            <div className={cx('language-info-row')}>
                                <span className={cx('language-flag')}>{lang.flag}</span>
                                <div className={cx('language-labels')}>
                                    <div className={cx('language-main-name')}>
                                        <span>{lang.name}</span>
                                        <span className={cx('language-native')}>({lang.nativeName})</span>
                                    </div>
                                    <span className={cx('language-desc')}>{lang.desc}</span>
                                </div>
                            </div>
                            <div className={cx('language-radio', { checked: isSelected })}>
                                {isSelected && <Check size={16} />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LanguageSettings;
