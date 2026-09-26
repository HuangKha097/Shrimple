import React, { useEffect, useState } from 'react';
import { usePostStore } from '../../stores/usePostStore';
import { useAuthStore } from '../../stores/useAuthStore';
import classNames from 'classnames/bind';
import styles from '../../assets/css/PostsContainer.module.scss';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Image, Send, Heart, MessageCircle, Trash2, MoreHorizontal, Bookmark, EyeOff, Flag, Link as LinkIcon, Edit } from 'lucide-react';
import { toast } from 'sonner';
import PostItem from './PostItem';

const cx = classNames.bind(styles);

const SavedPostsContainer = () => {
    const { savedPosts, fetchSavedPosts, likePost, addComment, deletePost, toggleSavePost, isLoading } = usePostStore();
    const { user } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        fetchSavedPosts();
    }, [fetchSavedPosts]);

    return (
        <div className={cx('posts-container-wrapper')}>
            <div className={cx('header')}>
                 <button onClick={() => navigate('/feed')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
                    <ChevronLeft size={24} />
                </button>
                <h2>Saved Posts</h2>
            </div>
            
            <div className={cx('content-area')}>
                {isLoading && <p style={{textAlign: 'center', opacity: 0.7}}>Loading saved posts...</p>}
                
                {!isLoading && savedPosts.length === 0 && (
                    <div style={{textAlign: 'center', marginTop: '5rem', opacity: 0.6}}>
                        <Bookmark size={48} style={{marginBottom: '1rem'}}/>
                        <h3>No saved posts yet</h3>
                        <p>Save posts to watch them later!</p>
                    </div>
                )}
                
                {savedPosts.map(post => (
                    <PostItem 
                        key={post._id} 
                        post={post} 
                        currentUser={user}
                        onLike={async (id) => { await likePost(id); fetchSavedPosts(); }} // Refetch to update UI
                        onComment={async (id, text) => { await addComment(id, text); fetchSavedPosts(); }}
                        onDelete={async (id) => { await deletePost(id); fetchSavedPosts(); }}
                        toggleSavePost={async (id) => { await toggleSavePost(id); fetchSavedPosts(); }}
                    />
                ))}
            </div>
        </div>
    );
};

export default SavedPostsContainer;
