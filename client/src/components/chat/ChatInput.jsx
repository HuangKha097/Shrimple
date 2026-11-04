import { useState, useMemo, useRef, useEffect } from 'react';
import classNames from 'classnames/bind';
import { AnimatePresence, motion as Motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/ChatInput.module.scss';
import {
    Image as ImageIcon,
    Smile,
    Mic,
    Plus,
    Send,
    X,
    File,
    MapPin,
    BarChart2,
    AtSign,
    Languages,
    Volume2,
    Check,
    ChevronDown,
    Search,
} from '../icons';
import { useChatStore } from "../../stores/useChatStore.js";
import { useAuthStore } from "../../stores/useAuthStore.js";
import EmojiPicker from 'emoji-picker-react';
import CreatePollModal from './CreatePollModal.jsx';
import MentionAutocomplete from '../common/MentionAutocomplete.jsx';
import { insertAtTrigger } from '../../utils/mention.js';
import {
    VOICE_TRANSLATION_MODES,
    normalizeAppLanguage,
    getLanguageMeta,
    serializeVoiceMessageContent,
} from '../../utils/voiceTranslation.js';
import { toast } from 'sonner';
import api from '../../lib/axios.js';

const cx = classNames.bind(styles);

// 12-bar frequency keyframes modeled after the VoiceInput component
const FREQUENCY_BAR_KEYFRAMES = [
    [2, 11, 5, 2],
    [2, 8, 13, 2],
    [2, 14, 6, 2],
    [2, 7, 10, 2],
    [2, 13, 8, 2],
    [2, 9, 14, 2],
    [2, 15, 7, 2],
    [2, 8, 12, 2],
    [2, 12, 6, 2],
    [2, 10, 13, 2],
    [2, 9, 5, 2],
    [2, 11, 7, 2],
];

const VOICE_PICKER_RAILS = [
    {
        id: 'v2v',
        name: 'Lồng tiếng (Voice-to-Voice)',
        options: [
            {
                id: 'v2v-en',
                mode: VOICE_TRANSLATION_MODES.VOICE_TO_VOICE,
                targetLang: 'en',
                code: 'EN',
                name: 'English',
                description: 'Tắt âm gốc, phát giọng dịch Tiếng Anh',
            },
            {
                id: 'v2v-vi',
                mode: VOICE_TRANSLATION_MODES.VOICE_TO_VOICE,
                targetLang: 'vi',
                code: 'VI',
                name: 'Tiếng Việt',
                description: 'Tắt âm gốc, phát giọng dịch Tiếng Việt',
            },
            {
                id: 'v2v-zh',
                mode: VOICE_TRANSLATION_MODES.VOICE_TO_VOICE,
                targetLang: 'zh',
                code: 'ZH',
                name: '中文 (Chinese)',
                description: 'Tắt âm gốc, phát giọng dịch Tiếng Trung',
            },
        ],
    },
    {
        id: 'auto',
        name: 'Phụ đề tự động',
        options: [
            {
                id: 'auto-default',
                mode: VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
                targetLang: null,
                code: 'AUTO',
                name: 'Theo ngôn ngữ người nhận',
                description: 'Giữ âm gốc, tự dịch văn bản bên dưới',
            },
        ],
    },
];

const AUDIO_BEHAVIOR_LEVELS = [
    { id: 'keep_original', label: 'Phụ đề' },
    { id: 'mute_original', label: 'Lồng tiếng' },
];

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
    const { i18n } = useTranslation();
    const currentAppLang = normalizeAppLanguage(i18n.resolvedLanguage || i18n.language || 'vi');

    const [text, setText] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [image, setImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    const fileInputRef = useRef(null);
    const fileAttachmentInputRef = useRef(null);
    const textInputRef = useRef(null);
    const pickerSearchRef = useRef(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [showVoiceOptions, setShowVoiceOptions] = useState(false);
    const [activeRailId, setActiveRailId] = useState('v2v');
    const [pickerQuery, setPickerQuery] = useState('');
    const [voiceSendMode, setVoiceSendMode] = useState(VOICE_TRANSLATION_MODES.AUTO_SUBTITLE);
    const [voiceTargetLang, setVoiceTargetLang] = useState(() => (currentAppLang === 'en' ? 'vi' : 'en'));

    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const voiceSendOptionsRef = useRef({
        mode: VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
        sourceLang: currentAppLang,
        targetLang: currentAppLang === 'en' ? 'vi' : 'en',
    });

    useEffect(() => {
        voiceSendOptionsRef.current = {
            mode: voiceSendMode,
            sourceLang: currentAppLang,
            targetLang: voiceTargetLang,
        };
    }, [voiceSendMode, currentAppLang, voiceTargetLang]);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                audioChunksRef.current = [];
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
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

                const activeVoiceOpts = voiceSendOptionsRef.current || {
                    mode: VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
                    sourceLang: currentAppLang,
                    targetLang: null,
                };
                const isVoiceToVoice = activeVoiceOpts.mode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE;
                const targetMeta = isVoiceToVoice ? getLanguageMeta(activeVoiceOpts.targetLang) : null;

                const loadingText = isVoiceToVoice
                    ? `Đang gửi voice (${targetMeta.nativeName})...`
                    : "Đang gửi tin nhắn thoại...";
                const toastId = toast.loading(loadingText);
                const formData = new FormData();
                formData.append("file", audioBlob, `voice-note-${Date.now()}.${ext}`);

                try {
                    const response = await api.post("/api/messages/upload", formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    const cloudUrl = response.data.url;

                    const voicePayload = serializeVoiceMessageContent({
                        mode: activeVoiceOpts.mode,
                        sourceLang: activeVoiceOpts.sourceLang || currentAppLang,
                        targetLang: isVoiceToVoice ? activeVoiceOpts.targetLang : null,
                    });

                    const safeConvos = Array.isArray(conversations) ? conversations : [];
                    const currentConvo = safeConvos.find(c => c && c._id === activeConversationId);
                    const isGroup = currentConvo?.isGroup;

                    if (isGroup) {
                        await sendGroupMessage(activeConversationId, voicePayload, null, cloudUrl, 'audio');
                    } else {
                        const recipientId = resolveRecipientId(currentConvo, currentUser);

                        if (recipientId) {
                            await sendDirectMessage(recipientId, voicePayload, activeConversationId, null, cloudUrl, 'audio');
                        }
                    }

                    const successText = isVoiceToVoice
                        ? `Đã gửi tin nhắn thoại (${targetMeta.short})!`
                        : "Đã gửi tin nhắn thoại!";
                    toast.success(successText, { id: toastId });
                } catch (err) {
                    console.error("Failed to send voice message:", err);
                    toast.error("Không thể gửi tin nhắn thoại", { id: toastId });
                }
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setMediaRecorder(recorder);
            setIsRecording(true);
            setRecordingTime(0);
            setShowVoiceOptions(false);
            setShowEmojiPicker(false);
            setShowActionsMenu(false);

            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            toast.error("Không thể truy cập micro");
        }
    };

    const stopAndSendRecording = (overrideOptions = null) => {
        if (overrideOptions && typeof overrideOptions === 'object') {
            const nextMode = overrideOptions.mode || voiceSendMode;
            const nextTarget = overrideOptions.targetLang || voiceTargetLang;
            voiceSendOptionsRef.current = {
                mode: nextMode,
                sourceLang: currentAppLang,
                targetLang: nextTarget,
            };
            setVoiceSendMode(nextMode);
            if (overrideOptions.targetLang) {
                setVoiceTargetLang(overrideOptions.targetLang);
            }
        }
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
        setShowVoiceOptions(false);
        setPickerQuery('');
        mediaRecorderRef.current = null;
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
    };

    const selectStandardVoiceMode = () => {
        setVoiceSendMode(VOICE_TRANSLATION_MODES.AUTO_SUBTITLE);
        setActiveRailId('auto');
        voiceSendOptionsRef.current = {
            mode: VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
            sourceLang: currentAppLang,
            targetLang: voiceTargetLang,
        };
    };

    const selectVoiceToVoiceLanguage = (langCode) => {
        setVoiceSendMode(VOICE_TRANSLATION_MODES.VOICE_TO_VOICE);
        setVoiceTargetLang(langCode);
        setActiveRailId('v2v');
        voiceSendOptionsRef.current = {
            mode: VOICE_TRANSLATION_MODES.VOICE_TO_VOICE,
            sourceLang: currentAppLang,
            targetLang: langCode,
        };
    };

    const toggleVoicePickerPopover = () => {
        setShowVoiceOptions((prev) => {
            const next = !prev;
            if (next) {
                setPickerQuery('');
                setActiveRailId(
                    voiceSendMode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE ? 'v2v' : 'auto'
                );
                requestAnimationFrame(() => {
                    pickerSearchRef.current?.focus();
                });
            }
            return next;
        });
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
        if (isRecording) {
            stopAndSendRecording();
            return;
        }
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

    const currentConvo = useMemo(() => {
        const safeConvos = Array.isArray(conversations) ? conversations : [];
        return safeConvos.find(c => c && c._id === activeConversationId);
    }, [conversations, activeConversationId]);

    const mentionCandidates = useMemo(() => {
        const parts = currentConvo?.participants || [];
        const friendList = Array.isArray(friends) ? friends : [];
        return [...parts, ...friendList];
    }, [currentConvo, friends]);

    const isVoiceToVoiceSelected = voiceSendMode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE;
    const selectedTargetMeta = getLanguageMeta(voiceTargetLang);
    const selectedOptionId = isVoiceToVoiceSelected ? `v2v-${voiceTargetLang}` : 'auto-default';

    const activeRail = useMemo(
        () => VOICE_PICKER_RAILS.find((r) => r.id === activeRailId) || VOICE_PICKER_RAILS[0],
        [activeRailId]
    );

    const trimmedQuery = pickerQuery.trim().toLowerCase();
    const isSearching = trimmedQuery.length > 0;

    const visiblePickerRows = useMemo(() => {
        if (isSearching) {
            return VOICE_PICKER_RAILS.flatMap((rail) =>
                rail.options
                    .filter((opt) =>
                        [opt.name, opt.code, opt.description, rail.name].some((field) =>
                            field.toLowerCase().includes(trimmedQuery)
                        )
                    )
                    .map((option) => ({ rail, option }))
            );
        }
        return activeRail.options.map((option) => ({ rail: activeRail, option }));
    }, [activeRail, isSearching, trimmedQuery]);

    if (!chatStatus.allowed) {
        return (
            <div className={cx('container')}>
                <div className={cx('disabled-banner')}>
                    <span className={cx('disabled-text')}>{chatStatus.reason}</span>
                </div>
            </div>
        );
    }

    const hasContent = text.trim().length > 0 || Boolean(image) || isRecording;
    const filledEffortSteps = isVoiceToVoiceSelected ? 3 : 1;

    return (
        <div className={cx('container')}>
            <MentionAutocomplete
                value={text}
                onChange={setText}
                inputRef={textInputRef}
                candidates={mentionCandidates}
                includeEveryone={true}
                everyoneDesc={currentConvo?.isGroup ? "Nhắc tất cả thành viên trong nhóm" : "Nhắc mọi người trong cuộc trò chuyện"}
                placement="top"
            />

            {showEmojiPicker && (
                <div className={cx('emoji-picker-container')}>
                    <EmojiPicker 
                        onEmojiClick={onEmojiClick} 
                        theme="dark"
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

            {/* Clean Monochromatic ModelPicker Popover */}
            <AnimatePresence>
                {isRecording && showVoiceOptions && (
                    <Motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className={cx('model-picker-popover')}
                        role="dialog"
                        aria-label="Chế độ dịch tin nhắn thoại"
                    >
                        <div className={cx('mp-body')}>
                            {/* Left Icon-Only Rail */}
                            <div
                                className={cx('mp-rail')}
                                role="tablist"
                                aria-label="Chế độ dịch"
                                aria-orientation="vertical"
                            >
                                {VOICE_PICKER_RAILS.map((rail) => {
                                    const isSelectedRail = rail.id === activeRail.id && !isSearching;
                                    return (
                                        <button
                                            key={rail.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={isSelectedRail}
                                            title={rail.name}
                                            className={cx('mp-rail-btn', { active: isSelectedRail })}
                                            onClick={() => {
                                                setPickerQuery('');
                                                setActiveRailId(rail.id);
                                            }}
                                        >
                                            {rail.id === 'v2v' ? (
                                                <Volume2 size={16} />
                                            ) : (
                                                <Languages size={16} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Right Main Column */}
                            <div className={cx('mp-main')}>
                                <div className={cx('mp-search-bar')}>
                                    <Search size={13} className={cx('mp-search-icon')} />
                                    <input
                                        ref={pickerSearchRef}
                                        type="text"
                                        value={pickerQuery}
                                        onChange={(e) => setPickerQuery(e.target.value)}
                                        placeholder="Tìm ngôn ngữ..."
                                        className={cx('mp-search-input')}
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                    {pickerQuery && (
                                        <button
                                            type="button"
                                            className={cx('mp-search-clear')}
                                            onClick={() => {
                                                setPickerQuery('');
                                                pickerSearchRef.current?.focus();
                                            }}
                                            title="Xóa"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className={cx('mp-list-surface')}>
                                    <p className={cx('mp-section-heading')}>
                                        {isSearching
                                            ? `${visiblePickerRows.length} kết quả`
                                            : activeRail.name}
                                    </p>

                                    <div className={cx('mp-listbox')} role="listbox">
                                        {visiblePickerRows.length === 0 ? (
                                            <p className={cx('mp-empty')}>
                                                {`Không có kết quả cho "${pickerQuery.trim()}"`}
                                            </p>
                                        ) : (
                                            visiblePickerRows.map(({ option }) => {
                                                const isSelected = option.id === selectedOptionId;
                                                return (
                                                    <div
                                                        key={option.id}
                                                        role="option"
                                                        aria-selected={isSelected}
                                                        tabIndex={0}
                                                        className={cx('mp-row', { selected: isSelected })}
                                                        onClick={() => {
                                                            if (option.mode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE) {
                                                                selectVoiceToVoiceLanguage(option.targetLang);
                                                            } else {
                                                                selectStandardVoiceMode();
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                if (option.mode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE) {
                                                                    selectVoiceToVoiceLanguage(option.targetLang);
                                                                } else {
                                                                    selectStandardVoiceMode();
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <span className={cx('mp-row-text')}>
                                                            <span className={cx('mp-row-title-line')}>
                                                                <span className={cx('mp-row-name')}>{option.name}</span>
                                                                {isSelected && (
                                                                    <Check size={13} className={cx('mp-row-check')} />
                                                                )}
                                                            </span>
                                                            <span className={cx('mp-row-desc')}>{option.description}</span>
                                                        </span>

                                                        <span className={cx('mp-code-chip')}>
                                                            {option.code}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Bottom Segmented Track Footer */}
                                <div className={cx('mp-footer')}>
                                    <span className={cx('mp-footer-label')}>
                                        <span className={cx('mp-effort-meter')} aria-hidden="true">
                                            {[0, 1, 2].map((idx) => (
                                                <span
                                                    key={idx}
                                                    style={{ height: `${5 + idx * 2.5}px` }}
                                                    className={cx('meter-bar', {
                                                        filled: idx < filledEffortSteps,
                                                    })}
                                                />
                                            ))}
                                        </span>
                                        <span className={cx('mp-footer-mono')}>Chế độ</span>
                                    </span>

                                    <div
                                        role="radiogroup"
                                        aria-label="Chế độ âm thanh"
                                        className={cx('mp-segmented-track')}
                                    >
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                width: `calc((100% - 6px) / ${AUDIO_BEHAVIOR_LEVELS.length})`,
                                                transform: `translateX(${(isVoiceToVoiceSelected ? 1 : 0) * 100}%)`,
                                            }}
                                            className={cx('mp-track-thumb')}
                                        />
                                        {AUDIO_BEHAVIOR_LEVELS.map((level, idx) => {
                                            const active =
                                                (idx === 0 && !isVoiceToVoiceSelected) ||
                                                (idx === 1 && isVoiceToVoiceSelected);
                                            return (
                                                <button
                                                    key={level.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={active}
                                                    className={cx('mp-track-btn', { active })}
                                                    onClick={() => {
                                                        if (level.id === 'keep_original') {
                                                            selectStandardVoiceMode();
                                                        } else {
                                                            selectVoiceToVoiceLanguage(voiceTargetLang);
                                                        }
                                                    }}
                                                >
                                                    {level.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* X-Style Unified Capsule Dock */}
            <div className={cx('capsule-dock')}>
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

                    {!isRecording && (
                        <>
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
                                onClick={() => insertAtTrigger(text, setText, textInputRef)}
                                title="Nhắc đến bạn bè (@mention / @everyone)"
                            >
                                <AtSign size={19} />
                            </button>
                        </>
                    )}

                    {/* Morphing VoiceInput Pill Component */}
                    <Motion.div
                        className={cx('voice-input-pill', {
                            listening: isRecording,
                        })}
                        layout
                        transition={{
                            layout: {
                                duration: 0.35,
                            },
                        }}
                        onClick={() => {
                            if (!isRecording) {
                                startRecording();
                            }
                        }}
                        title={!isRecording ? "Ghi âm giọng nói" : undefined}
                    >
                        <button
                            type="button"
                            className={cx('voice-pill-icon-box')}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isRecording) {
                                    cancelRecording();
                                } else {
                                    startRecording();
                                }
                            }}
                            title={isRecording ? "Dừng & hủy ghi âm" : "Ghi âm giọng nói"}
                        >
                            {isRecording ? (
                                <Motion.div
                                    className={cx('listening-stop-square')}
                                    animate={{
                                        rotate: [0, 180, 360],
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Number.POSITIVE_INFINITY,
                                        ease: "easeInOut",
                                    }}
                                />
                            ) : (
                                <Mic size={19} />
                            )}
                        </button>

                        <AnimatePresence mode="wait">
                            {isRecording && (
                                <Motion.div
                                    initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                                    animate={{ opacity: 1, width: "auto", marginLeft: 6 }}
                                    exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                                    transition={{
                                        duration: 0.35,
                                    }}
                                    className={cx('voice-pill-expanded')}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* 12-Bar Frequency Animation */}
                                    <div className={cx('frequency-bars')}>
                                        {FREQUENCY_BAR_KEYFRAMES.map((keyframes, i) => (
                                            <Motion.div
                                                key={i}
                                                className={cx('freq-bar')}
                                                initial={{ height: 2 }}
                                                animate={{
                                                    height: isRecording ? keyframes : 2,
                                                }}
                                                transition={{
                                                    duration: isRecording ? 1 : 0.3,
                                                    repeat: isRecording ? Infinity : 0,
                                                    delay: isRecording ? i * 0.05 : 0,
                                                    ease: "easeInOut",
                                                }}
                                            />
                                        ))}
                                    </div>

                                    {/* Timer */}
                                    <div className={cx('voice-pill-timer')}>
                                        {formatTime(recordingTime)}
                                    </div>

                                    <span className={cx('voice-pill-sep')} aria-hidden="true" />

                                    {/* Clean Minimal Mode Trigger */}
                                    <button
                                        type="button"
                                        aria-haspopup="listbox"
                                        aria-expanded={showVoiceOptions}
                                        className={cx('voice-picker-trigger', {
                                            open: showVoiceOptions,
                                        })}
                                        onClick={toggleVoicePickerPopover}
                                        title="Chọn chế độ dịch"
                                    >
                                        <span className={cx('trigger-label')}>
                                            {isVoiceToVoiceSelected
                                                ? selectedTargetMeta.nativeName
                                                : 'Phụ đề'}
                                        </span>
                                        <ChevronDown
                                            size={12}
                                            className={cx('trigger-chevron', { rotated: showVoiceOptions })}
                                        />
                                    </button>
                                </Motion.div>
                            )}
                        </AnimatePresence>
                    </Motion.div>

                    {!isRecording && (
                        <button
                            type="button"
                            className={cx('tool-btn')}
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            title="Thêm công cụ"
                        >
                            <Plus size={19} style={{ transform: showActionsMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                    )}

                    {/* Actions Popup Menu */}
                    {showActionsMenu && !isRecording && (
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
                            {Boolean(currentConvo?.isGroup) && (
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
                    ref={textInputRef}
                    type="text"
                    placeholder={
                        isRecording
                            ? isVoiceToVoiceSelected
                                ? `Lồng tiếng ${selectedTargetMeta.nativeName} (Tắt âm gốc)`
                                : "Đang ghi âm..."
                            : "Bắt đầu tin nhắn mới... (Gõ @ để nhắc tên)"
                    }
                    className={cx('input-field')}
                    value={text}
                    disabled={isRecording}
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
                    title={isRecording ? "Gửi tin nhắn thoại" : "Gửi"}
                >
                    <Send size={16} />
                </Motion.button>
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
