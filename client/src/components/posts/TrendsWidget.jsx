import React, { useEffect } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { MoreHorizontal, Hash } from 'lucide-react';
import { usePostStore } from '../../stores/usePostStore';
import { useNavigate } from 'react-router-dom';

const cx = classNames.bind(styles);

const DEFAULT_TRENDS = [
    { name: 'Shrimple2026', count: 1840 },
    { name: 'HocKyMoi', count: 1210 },
    { name: 'React19', count: 950 },
    { name: 'AI_Coding', count: 720 },
    { name: 'ChillShrimple', count: 410 }
];

const TrendsWidget = () => {
    const { trends, fetchTrends } = usePostStore();
    const navigate = useNavigate();

    useEffect(() => {
        fetchTrends();
    }, [fetchTrends]);

    const displayTrends = trends && trends.length > 0 ? trends : DEFAULT_TRENDS;

    const handleTrendClick = (tagName) => {
        const cleanTag = tagName.replace(/^#/, '');
        navigate(`/feed/search?q=${encodeURIComponent('#' + cleanTag)}`);
    };

    return (
        <div className={cx('x-widget-card')}>
            <h3 className={cx('widget-title')}>Xu hướng cho bạn</h3>

            <div className={cx('trends-list')}>
                {displayTrends.map((trend, index) => {
                    const tagName = trend.name || trend.topic || `Trend${index + 1}`;
                    const count = trend.count || 0;
                    return (
                        <div 
                            key={trend._id || index} 
                            className={cx('trend-item')}
                            onClick={() => handleTrendClick(tagName)}
                        >
                            <div className={cx('trend-meta')}>
                                <span className={cx('trend-category')}>Xu hướng tại Việt Nam</span>
                                <span className={cx('trend-topic')}>#{tagName.replace(/^#/, '')}</span>
                                <span className={cx('trend-posts-count')}>{count} bài viết</span>
                            </div>
                            <button 
                                type="button" 
                                className={cx('trend-more-btn')} 
                                title="Tùy chọn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleTrendClick(tagName);
                                }}
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className={cx('widget-footer-links')}>
                <span>Điều khoản dịch vụ</span>
                <span>Chính sách quyền riêng tư</span>
                <span>Trợ năng</span>
                <span>© 2026 Shrimple Corp.</span>
            </div>
        </div>
    );
};

export default TrendsWidget;
