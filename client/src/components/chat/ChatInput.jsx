import React, { useState, useMemo, useRef, useEffect } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion } from 'motion/react';
import styles from '../../assets/css/ChatInput.module.scss';
import { Image as ImageIcon, Smile, Mic, Plus, Send, X, File, MapPin, BarChart2 } from 'lucide-react';
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import EmojiPicker from 'emoji-picker-react';
import { useThemeStore } from '../../stores/useThemeStore';
import CreatePollModal from './CreatePollModal.jsx';
import { toast } from 'sonner';
import api from '../../lib/axios.js';

const cx = classNames.bind(styles);

const resolveRecipientId = (currentConvo, currentUser) => {
    if (currentConvo?.participants && currentUser) {
        const currentUserIdStr = (currentUser._id || currentUser.id)?.toString();
        const partner = currentConvo.participants.find(p => {
            if (!p) return false;
            const pId = (p._id || p.userId?._id || p.userId)?.toString();
            return pId && pId !== currentUserIdStr;
        });
        if (partner) {
            return (partner._id || partner.userId?._id || partner.userId)?.toString();
        }
    }
    return null;
};

const ChatInput = () => {
    const isLight = useThemeStore(state => state.isLight);
    const [text, setText] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [image, setImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    const fileInputRef = useRef(null);
    const fileAttachmentInputRef = useRef(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    const { sendDirectMessage, sendGroupMessage, activeConversationId, conversations, friends } = useChatStore();
    const { user: currentUser } = useAuthStore();

    const chatStatus = useMemo(() => {
        const safeConvos = Array.isArray(conversations) ? conversations : [];
        const currentConvo = safeConvos.find(c => c && c._id === activeConversationId);
        if (!activeConversationId || !currentConvo) return { allowed: false, reason: "Chưa chọn cuộc trò chuyện" };

        if (currentConvo.isGroup) return { allowed: true, reason: "" };

        const partnerId = resolveRecipientId(currentConvo, currentUser);

        if (!partnerId) return { allowed: false, reason: "Không tìm thấy người dùng" };

        if (currentUser?.blockedUsers && currentUser.blockedUsers.includes(partnerId)) {
            return { allowed: false, reason: "Bạn đã chặn người dùng này" };
        }

        const isFriend = Array.isArray(friends) && friends.some(f => f && f._id && f._id.toString() === partnerId.toString());
        if (!isFriend) {
            return { allowed: false, reason: "Bạn chưa kết bạn với người này" };
        }

        return { allowed: true, reason: "" };
    }, [activeConversationId, conversations, friends, currentUser]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error("Vui lòng chọn tệp hình ảnh");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setPreviewUrl(reader.result);
            setImage(file);
        };
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setImage(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleFileAttachmentChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const toastId = toast.loading("Đang tải tệp lên...");
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await api.post("/api/messages/upload", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const cloudUrl = response.data.url;
            const originalName = response.data.originalName || file.name;

            const safeConvos = Array.isArray(conversations) ? conversations : [];
            const currentConvo = safeConvos.find(c => c && c._id === activeConversationId);
            const isGroup = currentConvo?.isGroup;

            if (isGroup) {
                await sendGroupMessage(activeConversationId, originalName, null, cloudUrl, 'file');
            } else {
                const recipientId = resolveRecipientId(currentConvo, currentUser);

                if (recipientId) {
                    await sendDirectMessage(recipientId, originalName, activeConversationId, null, cloudUrl, 'file');
                }
            }
            toast.success("Đã gửi tệp thành công!", { id: toastId });
        } catch (error) {
            console.error("Failed to upload/send file:", error);
            toast.error(error.response?.data?.message || "Không thể tải tệp lên", { id: toastId });
        } finally {
            if (fileAttachmentInputRef.current) {
                fileAttachmentInputRef.current.value = "";
            }
            setShowActionsMenu(false);
        }
    };

    const handleShareLocation = () => {
        if (!navigator.geolocation) {
            toast.error("Trình duyệt không hỗ trợ chia sẻ vị trí");
            return;
        }

        const toastId = toast.loading("Đang lấy tọa độ vị trí...");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const coords = JSON.stringify({
                    lat: latitude,
                    lng: longitude,
                    address: "Vị trí đã chia sẻ"
                });

                try {
                    const safeConvos = Array.isArray(conversations) ? conversations : [];
                    const currentConvo = safeConvos.find(c => c && c._id === activeConversationId);
                    const isGroup = currentConvo?.isGroup;

                    if (isGroup) {
                        await sendGroupMessage(activeConversationId, coords, null, null, 'location');
                    } else {
                        const recipientId = resolveRecipientId(currentConvo, currentUser);

                        if (recipientId) {
                            await sendDirectMessage(recipientId, coords, activeConversationId, null, null, 'location');
                        }
                    }
                    toast.success("Đã chia sẻ vị trí thành công!", { id: toastId });
                } catch (err) {
                    console.error("Failed to share location:", err);
                    toast.error("Không thể chia sẻ vị trí", { id: toastId });
                } finally {
                    setShowActionsMenu(false);
                }
            },
            (error) => {
                console.error("Error getting geolocation:", error);
                toast.error("Không thể lấy vị trí hiện tại của bạn", { id: toastId });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];

            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm')) {
                options = { mimeType: 'audio/webm' };
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                options = { mimeType: 'audio/ogg' };
            } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                options = { mimeType: 'audio/wav' };
            }

            const recorder = new MediaRecorder(stream, options);

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                if (audioChunksRef.current.length === 0) return;

                const mimeType = recorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                audioChunksRef.current = [];
                
                stream.getTracks().forEach(track => track.stop());

                if (audioBlob.size < 500) {
                    toast.error("Bản ghi âm quá ngắn.");
                    return;
                }

                let ext = 'webm';
                if (mimeType.includes('mp4')) ext = 'mp4';
                else if (mimeType.includes('ogg')) ext = 'ogg';
                else if (mimeType.includes('wav')) ext = 'wav';

                const toastId = toast.loading("Đang gửi tin nhắn thoại...");
                const formData = new FormData();
                formData.append("file", audioBlob, `voice-note-${Date.now()}.${ext}`);

                try {
                    const response = await api.post("/api/messages/upload", formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    const cloudUrl = response.data.url;

                    const safeConvos = Array.isArray(conversations) ? conversations : [];
                    const currentConvo = safeConvos.find(c => c && c._id === activeConversationId);
                    const isGroup = currentConvo?.isGroup;

                    if (isGroup) {
                        await sendGroupMessage(activeConversationId, "Tin nhắn thoại", null, cloudUrl, 'audio');
                    } else {
                        const recipientId = resolveRecipientId(currentConvo, currentUser);

                        if (recipientId) {
                            await sendDirectMessage(recipientId, "Tin nhắn thoại", activeConversationId, null, cloudUrl, 'audio');
                        }
                    }
                    toast.success("Đã gửi tin nhắn thoại!", { id: toastId });
                } catch (err) {
                    console.error("Failed to send voice message:", err);
                    toast.error("Không thể gửi tin nhắn thoại", { id: toastId });
                }
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
            setRecordingTime(0);

            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            toast.error("Không thể truy cập micro");
        }
    };

    const stopAndSendRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        cleanupRecordingState();
    };

    const cancelRecording = () => {
        audioChunksRef.current = [];
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        cleanupRecordingState();
        toast.info("Đã hủy bản ghi âm");
    };

    const cleanupRecordingState = () => {
        setIsRecording(false);
        setRecordingTime(0);
        setMediaRecorder(null);
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const onEmojiClick = (emojiObject) => {
        setText((prev) => prev + emojiObject.emoji);
    };

    const [isSending, setIsSending] = useState(false);

    const handleSendMessage = async () => {
        if ((!text.trim() && !image) || !chatStatus.allowed || isSending) return;

        setIsSending(true);
        const safeConvos = Array.isArray(conversations) ? conversations : [];
        const currentConvo = safeConvos.find(c => c && c._id === activeConversationId);
        const isGroup = currentConvo?.isGroup;
        const imageToSend = previewUrl;

        try {
            if (isGroup) {
                await sendGroupMessage(activeConversationId, text, imageToSend, null, 'text');
            } else {
                const recipientId = resolveRecipientId(currentConvo, currentUser);

                if (recipientId) {
                    await sendDirectMessage(recipientId, text, activeConversationId, imageToSend, null, 'text');
                }
            }
            setText("");
            removeImage();
            setShowEmojiPicker(false);
        } catch (error) {
            console.error("Failed to send message:", error);
            toast.error(error.response?.data?.message || "Không thể gửi tin nhắn");
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !isSending) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    if (!chatStatus.allowed) {
        return (
            <div className={cx('container')}>
                <div className={cx('disabled-banner')}>
                    <span className={cx('disabled-text')}>{chatStatus.reason}</span>
                </div>
            </div>
        );
    }

    const hasContent = text.trim().length > 0 || Boolean(image);

    return (
        <div className={cx('container')}>
            {showEmojiPicker && (
                <div className={cx('emoji-picker-container')}>
                    <EmojiPicker 
                        onEmojiClick={onEmojiClick} 
                        theme={isLight ? "light" : "dark"} 
                        width={320} 
                        height={400} 
                    />
                </div>
            )}

            {previewUrl && (
                <div className={cx('preview-area')}>
                    <div className={cx('preview-img-wrapper')}>
                        <img src={previewUrl} alt="Preview" />
                        <button className={cx('close-btn')} onClick={removeImage}>
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            {/* X-Style Unified Capsule Dock */}
            <div className={cx('capsule-dock')}>
                {isRecording ? (
                    <div className={cx('recording-hud')}>
                        <div className={cx('recording-indicator')}>
                            <span className={cx('pulse-dot')}></span>
                            <span className={cx('recording-text')}>Đang ghi âm... {formatTime(recordingTime)}</span>
                        </div>
                        <div className={cx('recording-actions')}>
                            <button className={cx('rec-btn', 'cancel-btn')} onClick={cancelRecording} title="Hủy">
                                <X size={16} />
                            </button>
                            <button className={cx('rec-btn', 'confirm-btn')} onClick={stopAndSendRecording} title="Gửi">
                                <Send size={15} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Tools on Left of Capsule */}
                        <div className={cx('left-tools')}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            <input
                                type="file"
                                ref={fileAttachmentInputRef}
                                style={{ display: 'none' }}
                                accept="*"
                                onChange={handleFileAttachmentChange}
                            />

                            <button
                                type="button"
                                className={cx('tool-btn')}
                                onClick={() => fileInputRef.current?.click()}
                                title="Đính kèm ảnh"
                            >
                                <ImageIcon size={19} />
                            </button>

                            <button
                                type="button"
                                className={cx('tool-btn')}
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                title="Biểu tượng cảm xúc"
                            >
                                <Smile size={19} />
                            </button>

                            <button
                                type="button"
                                className={cx('tool-btn')}
                                onClick={startRecording}
                                title="Ghi âm giọng nói"
                            >
                                <Mic size={19} />
                            </button>

                            <button
                                type="button"
                                className={cx('tool-btn')}
                                onClick={() => setShowActionsMenu(!showActionsMenu)}
                                title="Thêm công cụ"
                            >
                                <Plus size={19} style={{ transform: showActionsMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
                            </button>

                            {/* Actions Popup Menu */}
                            {showActionsMenu && (
                                <div className={cx('actions-menu')}>
                                    <button
                                        type="button"
                                        className={cx('action-menu-btn')}
                                        onClick={() => { fileAttachmentInputRef.current?.click(); setShowActionsMenu(false); }}
                                        title="Gửi tệp đính kèm"
                                    >
                                        <File size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        className={cx('action-menu-btn')}
                                        onClick={handleShareLocation}
                                        title="Chia sẻ vị trí"
                                    >
                                        <MapPin size={18} />
                                    </button>
                                    {Boolean((conversations || []).find(c => c && c._id === activeConversationId)?.isGroup) && (
                                        <button
                                            type="button"
                                            className={cx('action-menu-btn')}
                                            onClick={() => { setShowPollModal(true); setShowActionsMenu(false); }}
                                            title="Tạo cuộc bình chọn"
                                        >
                                            <BarChart2 size={18} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Borderless Input Field */}
                        <input
                            type="text"
                            placeholder="Bắt đầu tin nhắn mới..."
                            className={cx('input-field')}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => { setShowEmojiPicker(false); setShowActionsMenu(false); }}
                        />

                        {/* Send Button on Right of Capsule */}
                        <Motion.button
                            whileTap={hasContent ? { scale: 0.9 } : undefined}
                            whileHover={hasContent ? { scale: 1.06 } : undefined}
                            type="button"
                            className={cx('send-btn', { active: hasContent })}
                            onClick={handleSendMessage}
                            disabled={!hasContent || isSending}
                            title="Gửi"
                        >
                            <Send size={16} />
                        </Motion.button>
                    </>
                )}
            </div>

            {showPollModal && (
                <CreatePollModal 
                    conversationId={activeConversationId} 
                    onClose={() => setShowPollModal(false)} 
                />
            )}
        </div>
    );
};

export default ChatInput;