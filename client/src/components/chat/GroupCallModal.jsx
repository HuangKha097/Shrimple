import { useEffect, useRef, useState, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/GroupCall.module.scss';
import { useGroupCallStore } from '../../stores/useGroupCallStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useChatStore } from '../../stores/useChatStore';
import { chatService } from '../../services/chatService';
import AddMemberModal from './AddMemberModal.jsx';
import { toast } from 'sonner';
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    Monitor,
    Phone,
    PhoneOff,
    Users,
    UserPlus,
    MoreVertical,
    ChevronDown,
    ExternalLink,
    X,
    LayoutGrid,
} from 'lucide-react';

const defaultAvatar = '/favicon.png';
import { ASSET_BASE_URL } from '../../config/env';
import TranslationNotes from './TranslationNotes.jsx';

const cx = classNames.bind(styles);

// Sub-component for individual participant tile
const ParticipantTile = ({
    stream,
    isLocal = false,
    isMuted = false,
    isCameraOn = false,
    isScreenSharing = false,
    isSpeaking = false,
    isSelected = false,
    onClick,
    displayName = 'Người dùng',
    avatar = defaultAvatar,
}) => {
    const videoRef = useRef(null);
    const audioRef = useRef(null);

    const avatarSrc = useMemo(() => {
        if (!avatar) return defaultAvatar;
        if (avatar.startsWith('http') || avatar.startsWith('data:')) return avatar;
        return `${ASSET_BASE_URL}${avatar}`;
    }, [avatar]);

    const hasVideoTrack = Boolean(
        stream &&
            typeof stream.getVideoTracks === 'function' &&
            stream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled)
    );
    const hasActiveVideo = (isCameraOn || isScreenSharing) && hasVideoTrack;

    // Attach stream to video tag if camera or screen sharing is active
    useEffect(() => {
        if (videoRef.current && stream && hasActiveVideo) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, hasActiveVideo]);

    // Attach remote stream to audio element (unmuted for remote, muted for local)
    useEffect(() => {
        if (!isLocal && audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream, isLocal]);

    return (
        <div
            className={cx('participant-card', {
                speaking: isSpeaking && !isMuted,
                active: isSelected,
            })}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={(e) => {
                if (onClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            {/* Hidden audio element for remote audio */}
            {!isLocal && <audio ref={audioRef} autoPlay playsInline />}

            {hasActiveVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    className={cx('camera-video')}
                />
            ) : (
                <div className={cx('avatar-view')}>
                    <div className={cx('avatar-wrapper')}>
                        <img
                            src={avatarSrc}
                            alt={displayName}
                            onError={(e) => {
                                e.target.src = defaultAvatar;
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Top Right Status Badge */}
            <div className={cx('status-badges')}>
                <div
                    className={cx('badge-icon', isMuted ? 'muted' : 'unmuted', {
                        speaking: isSpeaking && !isMuted,
                    })}
                    title={isMuted ? 'Micro: Tắt' : isSpeaking ? 'Đang nói...' : 'Micro: Bật'}
                >
                    {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                </div>
            </div>

            {/* Bottom Name & Menu Tag */}
            <div className={cx('participant-tag')}>
                <span className={cx('tag-name')}>{displayName}</span>
                <span className={cx('tile-more-icon')} aria-hidden="true">
                    <MoreVertical size={14} />
                </span>
            </div>
        </div>
    );
};

const ZOOM_LEVELS = [100, 125, 150];

const GroupCallModal = () => {
    const {
        isInCall,
        isModalOpen,
        groupInfo,
        currentConversationId,
        localStream,
        screenStream,
        isMuted,
        isCameraOn,
        isScreenSharing,
        peers,
        speakingSockets,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
        leaveGroupCall,
        toggleMinimize,
        incomingCall,
        acceptIncomingCall,
        declineIncomingCall,
    } = useGroupCallStore();

    const { user: currentUser } = useAuthStore();
    const { conversations } = useChatStore();

    const [callDuration, setCallDuration] = useState(0);
    const [viewMode, setViewMode] = useState('speaker'); // 'speaker' | 'grid'
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const [selectedParticipantId, setSelectedParticipantId] = useState('local');
    const [zoomLevel, setZoomLevel] = useState(100);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);

    const screenVideoRef = useRef(null);
    const featuredVideoRef = useRef(null);
    const stageCardRef = useRef(null);

    const activeConversation = useMemo(
        () => (conversations || []).find((c) => c._id === currentConversationId),
        [conversations, currentConversationId]
    );

    const canManageMembers = useMemo(() => {
        if (!activeConversation || !currentUser?._id) return false;
        const userIdStr = currentUser._id.toString();
        const creatorIdStr = (
            activeConversation.group?.createdBy?._id || activeConversation.group?.createdBy
        )?.toString();
        if (creatorIdStr && creatorIdStr === userIdStr) return true;
        const me = (activeConversation.participants || []).find(
            (p) => (p._id || p.userId)?.toString() === userIdStr
        );
        return me?.role === 'leader' || me?.role === 'admin';
    }, [activeConversation, currentUser?._id]);

    const translationSources = useMemo(
        () => [
            { id: currentUser?._id, stream: localStream, muted: isMuted },
            ...Object.values(peers).map((peer) => ({
                id: peer.user?._id || peer.user?.userId,
                stream: peer.stream,
                muted: peer.isMuted,
            })),
        ],
        [currentUser?._id, localStream, isMuted, peers]
    );

    // Call duration timer
    useEffect(() => {
        let interval;
        if (isInCall) {
            setCallDuration(0);
            interval = setInterval(() => {
                setCallDuration((prev) => prev + 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isInCall]);

    const peerList = Object.values(peers);
    const totalCount = peerList.length + 1;
    const remoteScreenSharer = peerList.find((p) => p.isScreenSharing && p.stream);
    const hasScreenShareActive = isScreenSharing || Boolean(remoteScreenSharer);

    const allParticipants = useMemo(() => {
        const localEntry = {
            id: 'local',
            isLocal: true,
            stream: localStream,
            isMuted,
            isCameraOn,
            isScreenSharing,
            isSpeaking: speakingSockets.has('local'),
            displayName: currentUser?.displayName || currentUser?.username || 'Bạn',
            avatar: currentUser?.avatarURL,
        };
        const remoteEntries = peerList.map((p) => ({
            id: p.socketId,
            isLocal: false,
            stream: p.stream,
            isMuted: p.isMuted,
            isCameraOn: p.isCameraOn,
            isScreenSharing: p.isScreenSharing,
            isSpeaking: speakingSockets.has(p.socketId),
            displayName:
                p.user?.displayName || p.user?.name || p.user?.username || 'Người dùng',
            avatar: p.user?.avatar || p.user?.avatarURL,
        }));
        return [localEntry, ...remoteEntries];
    }, [
        localStream,
        isMuted,
        isCameraOn,
        isScreenSharing,
        speakingSockets,
        currentUser?.displayName,
        currentUser?.username,
        currentUser?.avatarURL,
        peerList,
    ]);

    const featuredParticipant = useMemo(() => {
        const explicit = allParticipants.find((p) => p.id === selectedParticipantId);
        if (explicit) return explicit;
        const activeSpeaker = allParticipants.find((p) => p.isSpeaking && !p.isMuted);
        return activeSpeaker || allParticipants[0];
    }, [allParticipants, selectedParticipantId]);

    const featuredHasVideo = useMemo(() => {
        const s = featuredParticipant?.stream;
        const hasTrack = Boolean(
            s &&
                typeof s.getVideoTracks === 'function' &&
                s.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
        );
        return Boolean(
            (featuredParticipant?.isCameraOn || featuredParticipant?.isScreenSharing) && hasTrack
        );
    }, [featuredParticipant]);

    // Attach screen stream to stage video (local or remote)
    useEffect(() => {
        if (screenVideoRef.current && hasScreenShareActive) {
            const streamToDisplay = isScreenSharing ? screenStream : remoteScreenSharer?.stream;
            if (streamToDisplay) {
                screenVideoRef.current.srcObject = streamToDisplay;
            }
        }
    }, [screenStream, isScreenSharing, remoteScreenSharer?.stream, hasScreenShareActive, viewMode]);

    // Attach featured participant camera video when no screen share is active
    useEffect(() => {
        if (featuredVideoRef.current && !hasScreenShareActive && featuredHasVideo) {
            featuredVideoRef.current.srcObject = featuredParticipant.stream;
        }
    }, [hasScreenShareActive, featuredHasVideo, featuredParticipant?.stream, viewMode]);

    const handleInviteClick = async () => {
        if (!currentConversationId) return;
        if (canManageMembers) {
            setShowAddMemberModal(true);
            return;
        }
        try {
            const data = await chatService.getGroupInvite(currentConversationId);
            if (data?.token) {
                const inviteUrl = `${window.location.origin}/groups/join/${data.token}`;
                await navigator.clipboard.writeText(inviteUrl);
                toast.success('Đã sao chép liên kết mời tham gia nhóm');
            }
        } catch {
            toast.error('Không thể lấy liên kết mời lúc này');
        }
    };

    const handleCycleZoom = () => {
        setZoomLevel((prev) => {
            const idx = ZOOM_LEVELS.indexOf(prev);
            return ZOOM_LEVELS[(idx + 1) % ZOOM_LEVELS.length];
        });
    };

    const handleToggleStageFullscreen = () => {
        const el = stageCardRef.current;
        if (!el) return;
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        } else {
            el.requestFullscreen?.().catch(() => {});
        }
    };

    // Render Incoming Group Call Dialog if receiver is invited
    if (incomingCall && !isInCall) {
        const callerName = incomingCall.caller?.name || 'Thành viên';
        const groupName = incomingCall.groupInfo?.name || 'Cuộc gọi nhóm';
        const callerAvatar = incomingCall.caller?.avatar || defaultAvatar;
        const avatarSrc =
            callerAvatar.startsWith('http') || callerAvatar.startsWith('data:')
                ? callerAvatar
                : `${ASSET_BASE_URL}${callerAvatar}`;

        return (
            <div className={cx('group-call-backdrop')}>
                <div
                    style={{
                        background: '#18191c',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '20px',
                        padding: '32px 40px',
                        textAlign: 'center',
                        maxWidth: '420px',
                        width: '90%',
                        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
                        color: '#ffffff',
                        animation: 'fadeIn 0.25s ease-out',
                    }}
                >
                    <div
                        style={{
                            width: '88px',
                            height: '88px',
                            borderRadius: '50%',
                            margin: '0 auto 16px auto',
                            overflow: 'hidden',
                            border: '3px solid #22c55e',
                            boxShadow: '0 0 20px rgba(34, 197, 94, 0.35)',
                        }}
                    >
                        <img
                            src={avatarSrc}
                            alt={callerName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                                e.currentTarget.src = defaultAvatar;
                            }}
                        />
                    </div>
                    <h3
                        style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            margin: '0 0 6px 0',
                            color: '#ffffff',
                        }}
                    >
                        {groupName}
                    </h3>
                    <p style={{ fontSize: '0.95rem', color: '#949ba4', margin: '0 0 28px 0' }}>
                        <strong>{callerName}</strong> đang bắt đầu cuộc gọi nhóm...
                    </p>
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                        <button
                            type="button"
                            onClick={acceptIncomingCall}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '12px',
                                border: 'none',
                                background: '#22c55e',
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                                transition: 'background 0.2s',
                            }}
                        >
                            <Phone size={18} />
                            Tham gia
                        </button>
                        <button
                            type="button"
                            onClick={declineIncomingCall}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '12px',
                                border: 'none',
                                background: '#ef4444',
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                                transition: 'background 0.2s',
                            }}
                        >
                            <PhoneOff size={18} />
                            Từ chối
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!isInCall || !isModalOpen) return null;

    const formatTimer = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getGridClass = () => {
        if (totalCount === 1) return 'grid-1';
        if (totalCount === 2) return 'grid-2';
        if (totalCount <= 4) return 'grid-4';
        return 'grid-many';
    };

    const sharerName = isScreenSharing
        ? currentUser?.displayName || currentUser?.username || 'Bạn'
        : remoteScreenSharer?.user?.displayName ||
          remoteScreenSharer?.user?.name ||
          remoteScreenSharer?.user?.username ||
          'Thành viên';

    const featuredAvatarSrc = (() => {
        const av = featuredParticipant?.avatar;
        if (!av) return defaultAvatar;
        if (av.startsWith('http') || av.startsWith('data:')) return av;
        return `${ASSET_BASE_URL}${av}`;
    })();

    return (
        <div className={cx('group-call-backdrop')} onClick={() => setViewMenuOpen(false)}>
            <div className={cx('group-call-container')} onClick={(e) => e.stopPropagation()}>
                {/* 1. Header Bar */}
                <div className={cx('call-header')}>
                    <div className={cx('header-left')}>
                        <div className={cx('group-icon-box')}>
                            <Users size={18} />
                        </div>
                        <div className={cx('group-meta')}>
                            <h3 className={cx('group-name')}>
                                {groupInfo?.name ||
                                    activeConversation?.name ||
                                    activeConversation?.group?.name ||
                                    'Phòng trò chuyện nhóm'}
                            </h3>
                            <span className={cx('participant-count')}>
                                {totalCount} {totalCount === 1 ? 'person' : 'people'} in the call
                                <span className={cx('meta-dot')}>·</span>
                                {formatTimer(callDuration)}
                            </span>
                        </div>
                    </div>

                    <div className={cx('header-right')}>
                        <div className={cx('view-mode-wrapper')}>
                            <button
                                type="button"
                                className={cx('view-mode-btn')}
                                onClick={() => setViewMenuOpen((prev) => !prev)}
                                title="Chế độ hiển thị"
                            >
                                {viewMode === 'speaker' ? (
                                    <Monitor size={15} />
                                ) : (
                                    <LayoutGrid size={15} />
                                )}
                                <span>
                                    {viewMode === 'speaker' ? 'Speaker view' : 'Grid view'}
                                </span>
                                <ChevronDown size={14} />
                            </button>

                            {viewMenuOpen && (
                                <div className={cx('view-mode-menu')}>
                                    <button
                                        type="button"
                                        className={cx('view-mode-option', {
                                            selected: viewMode === 'speaker',
                                        })}
                                        onClick={() => {
                                            setViewMode('speaker');
                                            setViewMenuOpen(false);
                                        }}
                                    >
                                        <Monitor size={14} />
                                        <span>Speaker view</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={cx('view-mode-option', {
                                            selected: viewMode === 'grid',
                                        })}
                                        onClick={() => {
                                            setViewMode('grid');
                                            setViewMenuOpen(false);
                                        }}
                                    >
                                        <LayoutGrid size={14} />
                                        <span>Grid view</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className={cx('icon-btn', 'ghost')}
                            onClick={() => setViewMode((m) => (m === 'speaker' ? 'grid' : 'speaker'))}
                            title="Tùy chọn hiển thị"
                        >
                            <MoreVertical size={18} />
                        </button>

                        <button
                            type="button"
                            className={cx('icon-btn', 'ghost')}
                            onClick={toggleMinimize}
                            title="Thu nhỏ cửa sổ"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* 2. Main Workspace Stage */}
                <div className={cx('call-stage')}>
                    {viewMode === 'speaker' ? (
                        <div className={cx('speaker-workspace')}>
                            {/* Left Column: Participants Sidebar + Invite Card */}
                            <div className={cx('participants-sidebar')}>
                                {allParticipants.map((p) => (
                                    <ParticipantTile
                                        key={p.id}
                                        isLocal={p.isLocal}
                                        stream={p.stream}
                                        isMuted={p.isMuted}
                                        isCameraOn={p.isCameraOn}
                                        isScreenSharing={p.isScreenSharing}
                                        isSpeaking={p.isSpeaking}
                                        isSelected={featuredParticipant?.id === p.id}
                                        onClick={() => setSelectedParticipantId(p.id)}
                                        displayName={p.displayName}
                                        avatar={p.avatar}
                                    />
                                ))}

                                <button
                                    type="button"
                                    className={cx('invite-card')}
                                    onClick={handleInviteClick}
                                    title="Mời thêm thành viên"
                                >
                                    <div className={cx('invite-icon-circle')}>
                                        <UserPlus size={18} />
                                    </div>
                                    <span className={cx('invite-label')}>Invite people</span>
                                </button>
                            </div>

                            {/* Center Column: Main Stage Card */}
                            <div ref={stageCardRef} className={cx('main-stage-card')}>
                                <div className={cx('stage-topbar')}>
                                    <div className={cx('stage-title')}>
                                        <Monitor size={16} className={cx('stage-title-icon')} />
                                        <span>
                                            {hasScreenShareActive
                                                ? `${sharerName} is sharing their screen`
                                                : `${featuredParticipant?.displayName || 'Speaker'} is on stage`}
                                        </span>
                                    </div>

                                    <div className={cx('stage-controls')}>
                                        <button
                                            type="button"
                                            className={cx('zoom-btn')}
                                            onClick={handleCycleZoom}
                                            title="Phóng to khung hình"
                                        >
                                            <span>{zoomLevel}%</span>
                                            <ChevronDown size={13} />
                                        </button>

                                        <button
                                            type="button"
                                            className={cx('expand-stage-btn')}
                                            onClick={handleToggleStageFullscreen}
                                            title="Toàn màn hình"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className={cx('stage-viewport')}>
                                    {hasScreenShareActive ? (
                                        <video
                                            ref={screenVideoRef}
                                            autoPlay
                                            playsInline
                                            muted={isScreenSharing}
                                            className={cx('stage-video')}
                                            style={{ transform: `scale(${zoomLevel / 100})` }}
                                        />
                                    ) : featuredHasVideo ? (
                                        <video
                                            ref={featuredVideoRef}
                                            autoPlay
                                            playsInline
                                            muted={featuredParticipant?.isLocal}
                                            className={cx('stage-video', 'camera-cover')}
                                            style={{ transform: `scale(${zoomLevel / 100})` }}
                                        />
                                    ) : (
                                        <div
                                            className={cx('stage-spotlight', {
                                                speaking:
                                                    featuredParticipant?.isSpeaking &&
                                                    !featuredParticipant?.isMuted,
                                            })}
                                        >
                                            <div className={cx('spotlight-avatar-ring')}>
                                                <img
                                                    src={featuredAvatarSrc}
                                                    alt={featuredParticipant?.displayName}
                                                    onError={(e) => {
                                                        e.currentTarget.src = defaultAvatar;
                                                    }}
                                                />
                                            </div>
                                            <h4 className={cx('spotlight-name')}>
                                                {featuredParticipant?.displayName}
                                            </h4>
                                            <span className={cx('spotlight-status')}>
                                                {featuredParticipant?.isMuted
                                                    ? 'Microphone muted'
                                                    : featuredParticipant?.isSpeaking
                                                    ? 'Speaking now...'
                                                    : 'Connected to voice'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Grid View Mode */
                        <div className={cx('participants-grid', getGridClass())}>
                            {allParticipants.map((p) => (
                                <ParticipantTile
                                    key={p.id}
                                    isLocal={p.isLocal}
                                    stream={p.stream}
                                    isMuted={p.isMuted}
                                    isCameraOn={p.isCameraOn}
                                    isScreenSharing={p.isScreenSharing}
                                    isSpeaking={p.isSpeaking}
                                    isSelected={featuredParticipant?.id === p.id}
                                    onClick={() => {
                                        setSelectedParticipantId(p.id);
                                        setViewMode('speaker');
                                    }}
                                    displayName={p.displayName}
                                    avatar={p.avatar}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Bottom Floating Control Dock */}
                <div className={cx('call-dock')}>
                    {/* Mic Toggle Button */}
                    <button
                        type="button"
                        className={cx('dock-control', { muted: isMuted })}
                        onClick={toggleMic}
                        title={isMuted ? 'Bật Micro (Unmute)' : 'Tắt Micro (Mute)'}
                    >
                        <span className={cx('dock-pill')}>
                            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </span>
                        <span className={cx('dock-label')}>Mic</span>
                    </button>

                    {/* Camera Toggle Button */}
                    <button
                        type="button"
                        className={cx('dock-control', { active: isCameraOn })}
                        onClick={toggleCamera}
                        title={isCameraOn ? 'Tắt Camera' : 'Bật Camera'}
                    >
                        <span className={cx('dock-pill')}>
                            {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                        </span>
                        <span className={cx('dock-label')}>Camera</span>
                    </button>

                    {/* Screen Share Button */}
                    <button
                        type="button"
                        className={cx('dock-control', { active: isScreenSharing })}
                        onClick={toggleScreenShare}
                        title={isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
                    >
                        <span className={cx('dock-pill')}>
                            <Monitor size={20} />
                        </span>
                        <span className={cx('dock-label')}>Share</span>
                    </button>

                    {/* Translate Toggle + Right Panel */}
                    <TranslationNotes
                        active={isInCall}
                        kind="group"
                        sessionId={currentConversationId}
                        sources={translationSources}
                    />

                    <div className={cx('dock-divider')} aria-hidden="true" />

                    {/* End Call Button */}
                    <button
                        type="button"
                        className={cx('dock-control', 'disconnect')}
                        onClick={leaveGroupCall}
                        title="Rời phòng thoại"
                    >
                        <span className={cx('dock-pill')}>
                            <PhoneOff size={20} />
                        </span>
                        <span className={cx('dock-label')}>End call</span>
                    </button>
                </div>

                {showAddMemberModal && currentConversationId && (
                    <AddMemberModal
                        conversationId={currentConversationId}
                        existingParticipantIds={(activeConversation?.participants || []).map(
                            (p) => p._id || p.userId
                        )}
                        onClose={() => setShowAddMemberModal(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default GroupCallModal;
