import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePostStore } from '../stores/usePostStore';
import { useAuthStore } from '../stores/useAuthStore';
import classNames from 'classnames/bind';
import styles from '../assets/css/PostsContainer.module.scss';
import { ArrowLeft } from 'lucide-react';
import PostItem from '../components/posts/PostItem';
import TrendsWidget from '../components/posts/TrendsWidget';
import WhoToFollowWidget from '../components/posts/WhoToFollowWidget';
import LoadingSpin from '../components/common/loading/LoadingSpin';

const cx = classNames.bind(styles);

const SinglePostPage = () => {
    const { postId } = useParams();
    const navigate = useNavigate();
    const { getPostById, likePost, addComment, deletePost } = usePostStore();
    const { user } = useAuthStore();

    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPost = async () => {
            if (!postId) return;
            setLoading(true);
            setError(null);
            try {
                const data = await getPostById(postId);
                if (!data) {
                    setError("Không tìm thấy bài viết");
                } else {
                    setPost(data);
                }
            } catch (err) {
                setError(err.response?.data?.message || "Không thể tải bài viết này");
            } finally {
                setLoading(false);
            }
        };
        fetchPost();
    }, [postId, getPostById]);

    return (
        <div className={cx('feed-page-layout')}>
            {/* Center Main Column */}
            <main className={cx('main-timeline-col')}>
                {/* Sticky Header with Back Button */}
                <header 
                    className={cx('x-feed-header')} 
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        padding: '10px 16px', 
                        minHeight: '53px' 
                    }}
                >
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#eff3f4',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Quay lại"
                        aria-label="Quay lại"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: '#e7e9ea', lineHeight: 1.2 }}>
                            Bài viết
                        </h2>
                        {post?.author && (
                            <span style={{ fontSize: '1.25rem', color: '#71767b' }}>
                                Đăng bởi {post.author.displayName || post.author.username}
                            </span>
                        )}
                    </div>
                </header>

                {/* Main Content Area */}
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '350px' }}>
                        <LoadingSpin size={34} />
                    </div>
                ) : error || !post ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#71767b' }}>
                        <h3 style={{ fontSize: '1.8rem', color: '#e7e9ea', marginBottom: '8px' }}>
                            {error || "Không tìm thấy bài viết"}
                        </h3>
                        <p style={{ fontSize: '1.4rem', marginBottom: '20px' }}>
                            Bài viết này có thể đã bị gỡ hoặc bạn không có quyền xem do thiết lập quyền riêng tư.
                        </p>
                        <button
                            onClick={() => navigate('/feed')}
                            style={{
                                background: '#f97316',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '9999px',
                                padding: '10px 24px',
                                fontWeight: 700,
                                fontSize: '1.4rem',
                                cursor: 'pointer',
                                transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            Quay lại Bảng tin
                        </button>
                    </div>
                ) : (
                    <div className={cx('posts-stream')}>
                        <PostItem
                            post={post}
                            currentUser={user}
                            onLike={async (id) => {
                                await likePost(id);
                                const updated = await getPostById(id);
                                if (updated) setPost(updated);
                            }}
                            onComment={async (id, text) => {
                                await addComment(id, text);
                                const updated = await getPostById(id);
                                if (updated) setPost(updated);
                            }}
                            onDelete={async (id) => {
                                await deletePost(id);
                                navigate('/feed');
                            }}
                            defaultShowComments={true}
                        />
                    </div>
                )}
            </main>

            {/* Right Column: Sticky Widgets */}
            <aside className={cx('feed-widgets-col')}>
                <div className={cx('widgets-sticky-wrapper')}>
                    <TrendsWidget />
                    <WhoToFollowWidget />
                </div>
            </aside>
        </div>
    );
};

export default SinglePostPage;
