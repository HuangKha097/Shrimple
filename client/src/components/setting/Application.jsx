
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/SettingContainer.module.scss';

const cx = classNames.bind(styles);

const Application = () => {
    const { t } = useTranslation();

    return (
        <>
            <h3>{t('settings.applicationTab')}</h3>
            <div className={cx('section')}>
                <h4>{t('settings.applicationSublabel')}</h4>
                <div className={cx('form-group')}>
                    <label>{t('settings.appVersion')}</label>
                    <p style={{fontSize: '1.4rem', color: 'var(--text-muted)'}}>Shrimple 2.4.0 (Official)</p>
                </div>
                <div className={cx('form-group')}>
                    <label>Developer</label>
                    <p style={{fontSize: '1.4rem', color: 'var(--text-muted)'}}>Quach Hoang Kha</p>
                </div>
            </div>
            
             <div className={cx('section')}>
                <h4>Support</h4>
                <div className={cx('form-group')}>
                     <p style={{fontSize: '1.4rem', color: 'var(--text-muted)'}}>Contact support: quachhoangkha097@gmail.com</p>
                </div>
            </div>
        </>
    );
};

export default Application;
