import { useState, useRef } from 'react';
import { X, UploadCloud, Film, Loader2, Globe, Users, Lock, Sparkles } from 'lucide-react';
import { usePostStore } from '../../stores/usePostStore';
import { useAuthStore } from '../../stores/useAuthStore';
import styles from '../../assets/css/VideoUploadModal.module.scss';
import classNames from 'classnames/bind';
import { toast } from 'sonner';
import { motion as Motion, AnimatePresence } from 'motion/react';

const cx = classNames.bind(styles);

const POPULAR_TAGS = ['Shrimple', 'Viral', 'Video', 'HaiHuoc', 'CongNghe', 'Chill', 'KhamPha', 'AmThuc'];

const VideoUploadModal = ({ isOpen, onClose }) => {
    const { createPost, isLoading } = usePostStore();
    const { user } = useAuthStore();
    
    const [content, setContent] = useState('');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [privacy, setPrivacy] = useState('public');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const validateAndSetFile = (selectedFile) => {
        if (!selectedFile) return;

        if (!selectedFile.type.startsWith('video/')) {
            toast.error("Vui lòng chọn tệp video hợp lệ (MP4, WebM, MOV)!");
            return;
        }

        // Limit size: e.g. 100MB
        const maxBytes = 100 * 1024 * 1024;
        if (selectedFile.size > maxBytes) {
            toast.error("Dung lượng video không được vượt quá 100MB!");
            return;
        }

        setFile(selectedFile);
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreview(objectUrl);
    };

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0];
        validateAndSetFile(selected);
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleAddTag = (tag) => {
        const tagText = `#${tag} `;
        if (!content.includes(tagText.trim())) {
            setContent(prev => (prev ? `${prev.trim()} ${tagText}` : tagText));
        }
    };

    const handleSubmit = async () => {
        if (!file || isLoading) return;

        try {
            await createPost({
                content: content.trim() || "Video mới trên Shrimple 🎥",
                video: file,
                privacy: privacy
            });

            onClose();
            setContent('');
            setFile(null);
            if (preview) URL.revokeObjectURL(preview);
            setPreview(null);
        } catch {
            toast.error("Không thể tải lên video");
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <Motion.div 
                    className={cx('modalOverlay')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <Motion.div 
                        className={cx('modalContent')}
                        initial={{ scale: 0.92, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 16 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className={cx('modalHeader')}>
                            <h2 className={cx('modalTitle')}>Đăng video mới</h2>
                            <button 
                                type="button" 
                                className={cx('closeBtn')} 
                                onClick={onClose} 
                                aria-label="Đóng"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className={cx('modalBody')}>
                            {/* Drag & Drop or Video Preview */}
                            {!preview ? (
                                <div 
                                    className={cx('dragDropZone', { active: dragActive })}
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className={cx('uploadIconCircle')}>
                                        <UploadCloud size={32} />
                                    </div>
                                    <span className={cx('dropTitle')}>Kéo thả video vào đây</span>
                                    <span className={cx('dropSubtitle')}>hoặc nhấp để chọn tệp từ máy tính của bạn</span>
                                    
                                    <button type="button" className={cx('browseBtn')}>
                                        Chọn tệp video
                                    </button>

                                    <span className={cx('formatsInfo')}>
                                        MP4, WebM hoặc MOV • Tối đa 100MB
                                    </span>

                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                        accept="video/mp4,video/webm,video/quicktime" 
                                        hidden 
                                    />
                                </div>
                            ) : (
                                <div className={cx('previewZone')}>
                                    <div className={cx('previewPlayerWrapper')}>
                                        <video 
                                            src={preview} 
                                            controls 
                                            autoPlay 
                                            muted 
                                            className={cx('videoPreviewPlayer')} 
                                        />
                                    </div>

                                    <div className={cx('previewMetaRow')}>
                                        <div className={cx('fileDetails')}>
                                            <Film size={16} />
                                            <span className={cx('fileName')}>{file?.name}</span>
                                            <span>• {formatFileSize(file?.size)}</span>
                                        </div>

                                        <button 
                                            type="button" 
                                            className={cx('changeVideoBtn')}
                                            onClick={() => {
                                                setFile(null);
                                                if (preview) URL.revokeObjectURL(preview);
                                                setPreview(null);
                                            }}
                                        >
                                            Đổi video
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Caption Section */}
                            <div className={cx('captionSection')}>
                                <div className={cx('captionLabelRow')}>
                                    <label>Mô tả video</label>
                                    <span className={cx('charCount')}>{content.length}/500</span>
                                </div>

                                <textarea 
                                    className={cx('captionTextarea')}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value.slice(0, 500))}
                                    placeholder={`Chia sẻ điều gì đó về video của bạn, ${user?.displayName || ''}...`}
                                    rows={3}
                                />

                                {/* Quick Hashtag Suggestions */}
                                <div className={cx('hashtagSuggestions')}>
                                    <span style={{ fontSize: '1.2rem', color: '#71767b', marginRight: 4 }}>
                                        Gợi ý hashtag:
                                    </span>
                                    {POPULAR_TAGS.map(tag => (
                                        <button 
                                            key={tag}
                                            type="button"
                                            className={cx('suggestionChip')}
                                            onClick={() => handleAddTag(tag)}
                                        >
                                            #{tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Privacy Option */}
                            <div className={cx('privacySection')}>
                                <div className={cx('privacyLabel')}>
                                    {privacy === 'public' && <Globe size={18} color="#f97316" />}
                                    {privacy === 'friends' && <Users size={18} color="#f97316" />}
                                    {privacy === 'private' && <Lock size={18} color="#f97316" />}
                                    <span>Quyền riêng tư</span>
                                </div>

                                <select 
                                    value={privacy} 
                                    onChange={(e) => setPrivacy(e.target.value)}
                                    className={cx('privacySelect')}
                                >
                                    <option value="public">Công khai</option>
                                    <option value="friends">Bạn bè</option>
                                    <option value="private">Chỉ mình tôi</option>
                                </select>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className={cx('modalFooter')}>
                            <button 
                                type="button" 
                                className={cx('cancelBtn')} 
                                onClick={onClose} 
                                disabled={isLoading}
                            >
                                Hủy
                            </button>
                            <button 
                                type="button" 
                                className={cx('postBtn')} 
                                onClick={handleSubmit}
                                disabled={!file || isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Đang đăng video...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={16} />
                                        <span>Đăng video</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </Motion.div>
                </Motion.div>
            )}
        </AnimatePresence>
    );
};

export default VideoUploadModal;
