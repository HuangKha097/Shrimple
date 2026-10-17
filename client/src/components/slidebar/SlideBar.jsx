
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/SlideBar.module.scss';
import SlidebarBody from './SlidebarBody.jsx';
import NotificationDropdown from '../common/NotificationDropdown.jsx';
import { SquarePen, Users, ArrowLeft, QrCode, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const cx = classNames.bind(styles);

const SlideBar = ({ onCloseAddFriendPopup, onCloseCreateGroupPopup, onOpenQRModal, onOpenNavigation }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className={cx('messages-column-wrapper')}>
            {/* X-Style Top Header: 53px, back button + title on left, compose on right */}
            <div className={cx('messages-header')}>
                <div className={cx('header-title-row')}>
                    <div className={cx('header-title-group')}>
                        <button type="button" className={cx('header-back-btn', 'header-menu-btn')}
                            onClick={onOpenNavigation} title="Mở menu" aria-label="Mở menu">
                            <Menu size={20} />
                        </button>
                        <button 
                            type="button" 
                            className={cx('header-back-btn', 'header-feed-btn')}
                            onClick={() => navigate('/feed')}
                            title={t('chat.backToFeed')}
                            aria-label={t('chat.backToFeed')}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className={cx('header-title')}>{t('chat.messages')}</h1>
                    </div>

                    <div className={cx('header-actions')}>
                        <NotificationDropdown align="right" />
                        <button 
                            type="button" 
                            className={cx('header-action-btn')} 
                            onClick={onOpenQRModal}
                            title="Mã QR cá nhân & Quét mã"
                            aria-label="Mã QR cá nhân & Quét mã"
                        >
                            <QrCode size={20} />
                        </button>
                        <button 
                            type="button" 
                            className={cx('header-action-btn')} 
                            onClick={onCloseAddFriendPopup}
                            title={t('chat.addFriend')}
                            aria-label={t('chat.addFriend')}
                        >
                            <SquarePen size={20} />
                        </button>
                        <button 
                            type="button" 
                            className={cx('header-action-btn')} 
                            onClick={onCloseCreateGroupPopup}
                            title={t('chat.createGroup')}
                            aria-label={t('chat.createGroup')}
                        >
                            <Users size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Messages Body (Search + Tabs + Conversations) */}
            <div className={cx('messages-body')}>
                <SlidebarBody onOpenNewChat={onCloseAddFriendPopup} />
            </div>
        </div>
    );
};

export default SlideBar;
