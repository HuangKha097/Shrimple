import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { usePostStore } from '../../stores/usePostStore';
import { useAuthStore } from '../../stores/useAuthStore';
import PostItem from './PostItem';
import TrendsWidget from './TrendsWidget';
import LoadingSpin from '../common/loading/LoadingSpin';
import { ArrowLeft, Search, Hash, Users, FileText, X } from 'lucide-react';
import default_avt from '../../../public/favicon.png';

const cx = classNames.bind(styles);

const SearchResultsContainer = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const navigate = useNavigate();

    const { 
        searchResults, 
        isSearching, 
        searchPosts, 
        likePost, 
        addComment, 
        deletePost 
    } = usePostStore();
    const { user: currentUser } = useAuthStore();

    const [inputVal, setInputVal] = useState(query);
    const [activeTab, setActiveTab] = useState('posts'); // 'posts' | 'users'

    useEffect(() => {
        setInputVal(query);
        if (query.trim()) {
            searchPosts(query.trim());
        }
    }, [query, searchPosts]);

    const handleSearchSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const trimmed = inputVal.trim();
        if (trimmed) {
            setSearchParams({ q: trimmed });
        }
    };

    const isHashtagQuery = query.startsWith('#') || !!searchResults.hashtag;
    const cleanHashtag = query.replace(/^#/, '');

    const postsCount = searchResults.posts?.length || 0;
    const usersCount = searchResults.users?.length || 0;

    return (
        <div className={cx('feed-page-layout')}>
            {/* Center Timeline Column */}
            <main className={cx('main-timeline-col')}>
                {/* Search Header Bar */}
                <div className={cx('search-page-header')} style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 100,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <button
                        type="button"
                        onClick={() => navigate('/feed')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#eff3f4',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px',
                            borderRadius: '50%',
                            transition: 'background 0.15s ease'
                        }}
                        title="Quay lại bảng tin"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: '#16181c',
                            border: '1.5px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '9999px',
                            padding: '8px 14px',
                            gap: '8px',
                            boxSizing: 'border-box'
                        }}>
                            <Search size={18} color="#71767b" style={{ flexShrink: 0 }} />
                            <input
                                type="text"
                                value={inputVal}
                                onChange={(e) => setInputVal(e.target.value)}
                                placeholder="Tìm kiếm bài viết, #hashtag, người dùng..."
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    width: '100%',
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#eff3f4',
                                    fontSize: '1.4rem',
                                    padding: 0
                                }}
                            />
                            {inputVal && (
                                <button
                                    type="button"
                                    onClick={() => setInputVal('')}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.12)',
                                        border: 'none',
                                        color: '#e7e9ea',
                                        cursor: 'pointer',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0,
                                        flexShrink: 0,
                                        marginLeft: 'auto'
                                    }}
                                    title="Xóa tìm kiếm"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* Hashtag Header Banner (If searching a hashtag) */}
                {isHashtagQuery && (
                    <div style={{
                        padding: '20px 16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        background: 'linear-gradient(180deg, rgba(249, 115, 22, 0.08) 0%, transparent 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                    }}>
                        <div style={{
                            width: '52px',
                            height: '52px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(249, 115, 22, 0.15)',
                            border: '1px solid rgba(249, 115, 22, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#f97316',
                            flexShrink: 0
                        }}>
                            <Hash size={28} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#eff3f4', margin: '0 0 4px 0' }}>
                                #{cleanHashtag}
                            </h2>
                            <p style={{ fontSize: '1.3rem', color: '#71767b', margin: 0 }}>
                                {searchResults.hashtag?.count || postsCount} bài viết với hashtag này
                            </p>
                        </div>
                    </div>
                )}

                {/* Tabs: Posts vs People */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)'
                }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('posts')}
                        style={{
                            flex: 1,
                            padding: '14px 0',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'posts' ? '3px solid #f97316' : '3px solid transparent',
                            color: activeTab === 'posts' ? '#eff3f4' : '#71767b',
                            fontWeight: activeTab === 'posts' ? 700 : 500,
                            fontSize: '1.45rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FileText size={16} />
                        <span>Bài viết ({postsCount})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('users')}
                        style={{
                            flex: 1,
                            padding: '14px 0',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'users' ? '3px solid #f97316' : '3px solid transparent',
                            color: activeTab === 'users' ? '#eff3f4' : '#71767b',
                            fontWeight: activeTab === 'users' ? 700 : 500,
                            fontSize: '1.45rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Users size={16} />
                        <span>Mọi người ({usersCount})</span>
                    </button>
                </div>

                {/* Main Content Area */}
                {isSearching ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                        <LoadingSpin />
                    </div>
                ) : (
                    <div>
                        {activeTab === 'posts' ? (
                            postsCount > 0 ? (
                                searchResults.posts.map(post => (
                                    <PostItem
                                        key={post._id}
                                        post={post}
                                        currentUser={currentUser}
                                        onLike={likePost}
                                        onComment={addComment}
                                        onDelete={deletePost}
                                    />
                                ))
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '60px 20px',
                                    color: '#71767b'
                                }}>
                                    <div style={{
                                        width: '60px',
                                        height: '60px',
                                        borderRadius: '50%',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        margin: '0 auto 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#71767b'
                                    }}>
                                        <Search size={28} />
                                    </div>
                                    <h3 style={{ fontSize: '1.8rem', color: '#eff3f4', marginBottom: '8px' }}>
                                        Không tìm thấy bài viết nào
                                    </h3>
                                    <p style={{ fontSize: '1.4rem' }}>
                                        Không có kết quả nào phù hợp với từ khóa "{query}". Hãy thử tìm kiếm từ khóa khác!
                                    </p>
                                </div>
                            )
                        ) : (
                            usersCount > 0 ? (
                                <div style={{ padding: '8px 0' }}>
                                    {searchResults.users.map(u => (
                                        <div
                                            key={u._id}
                                            onClick={() => navigate(`/feed/profile/${u._id}`)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '12px 16px',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <img
                                                src={u.avatarURL ? (u.avatarURL.startsWith('http') ? u.avatarURL : `http://localhost:5001${u.avatarURL}`) : default_avt}
                                                alt={u.displayName}
                                                style={{
                                                    width: '44px',
                                                    height: '44px',
                                                    borderRadius: '50%',
                                                    objectFit: 'cover'
                                                }}
                                                onError={(e) => { e.currentTarget.src = default_avt; }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#eff3f4' }}>
                                                    {u.displayName || u.username}
                                                </div>
                                                <div style={{ fontSize: '1.25rem', color: '#71767b' }}>
                                                    @{u.username}
                                                </div>
                                                {u.bio && (
                                                    <div style={{ fontSize: '1.3rem', color: '#d7dbdc', marginTop: '4px' }}>
                                                        {u.bio}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '60px 20px',
                                    color: '#71767b'
                                }}>
                                    <h3 style={{ fontSize: '1.8rem', color: '#eff3f4', marginBottom: '8px' }}>
                                        Không tìm thấy người dùng nào
                                    </h3>
                                    <p style={{ fontSize: '1.4rem' }}>
                                        Không có người dùng nào khớp với "{query}".
                                    </p>
                                </div>
                            )
                        )}
                    </div>
                )}
            </main>

            {/* Right Sidebar Column */}
            <aside className={cx('feed-widgets-col')}>
                <div className={cx('widgets-sticky-wrapper')}>
                    <TrendsWidget />
                </div>
            </aside>
        </div>
    );
};

export default SearchResultsContainer;
