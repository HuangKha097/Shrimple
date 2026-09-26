import React, { useEffect, useRef, useState, useMemo } from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/GroupCall.module.scss';
import { useGroupCallStore } from '../../stores/useGroupCallStore';
import { useAuthStore } from '../../stores/useAuthStore';
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    ScreenShare,
    Phone,
    PhoneOff,
    Minus,
    Maximize2,
    Users,
    Tv,
    Radio
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
    displayName = 'Người dùng',
    avatar = defaultAvatar
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
        <div className={cx('participant-card', { speaking: isSpeaking && !isMuted })}>
            {/* Hidden audio element for remote audio */}
            {!isLocal && (
                <audio ref={audioRef} autoPlay playsInline />
            )}

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
                            onError={(e) => { e.target.src = defaultAvatar; }}
                        />
                    </div>
                </div>
            )}

            {/* Top Right Status Badges */}
            <div className={cx('status-badges')}>
                {isScreenSharing && (
                    <div className={cx('badge-icon', 'live')} title="Đang chia sẻ màn hình">
                        <Tv size={14} />
                    </div>
                )}
                {/* Camera Status Badge */}
                <div
                    className={cx('badge-icon', isCameraOn ? 'cam-on' : 'cam-off')}
                    title={isCameraOn ? 'Camera: Bật' : 'Camera: Tắt'}
                >
                    {isCameraOn ? <Video size={14} /> : <VideoOff size={14} />}
                </div>
                {/* Microphone Status Badge */}
                <div
                    className={cx('badge-icon', isMuted ? 'muted' : 'unmuted', { speaking: isSpeaking && !isMuted })}
                    title={isMuted ? 'Micro: Tắt' : (isSpeaking ? 'Đang nói...' : 'Micro: Bật')}
                >
                    {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                </div>
            </div>

            {/* Bottom Left Name Tag */}
            <div className={cx('participant-tag')}>
                <span className={cx('tag-name')}>{displayName}</span>
                {isLocal && <span className={cx('you-pill')}>Bạn</span>}
            </div>
        </div>
    );
};

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
    const [callDuration, setCallDuration] = useState(0);
    const screenVideoRef = useRef(null);
    const translationSources = useMemo(() => [
        { id: currentUser?._id, stream: localStream, muted: isMuted },
        ...Object.values(peers).map(peer => ({
            id: peer.user?._id || peer.user?.userId,
            stream: peer.stream,
            muted: peer.isMuted,
        })),
    ], [currentUser?._id, localStream, isMuted, peers]);

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

    // Attach screen stream to theater view (local or remote)
    useEffect(() => {
        if (screenVideoRef.current) {
            const streamToDisplay = isScreenSharing ? screenStream : remoteScreenSharer?.stream;
            if (streamToDisplay) {
                screenVideoRef.current.srcObject = streamToDisplay;
            }
        }
    }, [screenStream, isScreenSharing, remoteScreenSharer?.stream]);

    // Render Incoming Group Call Dialog if receiver is invited
    if (incomingCall && !isInCall) {
        const callerName = incomingCall.caller?.name || 'Thành viên';
        const groupName = incomingCall.groupInfo?.name || 'Cuộc gọi nhóm';
        const callerAvatar = incomingCall.caller?.avatar || defaultAvatar;
        const avatarSrc = callerAvatar.startsWith('http') || callerAvatar.startsWith('data:')
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
                            onError={(e) => { e.currentTarget.src = defaultAvatar; }}
                        />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px 0', color: '#ffffff' }}>
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

    return (
        <div className={cx('group-call-backdrop')}>
            <div className={cx('group-call-container')}>
                {/* 1. Header Bar */}
                <div className={cx('call-header')}>
                    <div className={cx('header-left')}>
                        <div className={cx('group-meta')}>
                            <h3 className={cx('group-name')}>
                                {groupInfo?.name || 'Phòng trò chuyện nhóm'}
                            </h3>
                            <span className={cx('participant-count')}>
                                {totalCount} người tham gia · {formatTimer(callDuration)}
                            </span>
                        </div>
                    </div>

                    <div className={cx('header-right')}>
                        <button
                            type="button"
                            className={cx('icon-btn')}
                            onClick={toggleMinimize}
                            title="Thu nhỏ cửa sổ"
                        >
                            <Minus size={18} />
                        </button>
                    </div>
                </div>

                {/* 2. Main Stage */}
                <div className={cx('call-stage')}>
                    {hasScreenShareActive ? (
                        /* Theater Mode with Large Screen Share */
                        <div className={cx('theater-layout')}>
                            <div className={cx('theater-screen-box')}>
                                <video
                                    ref={screenVideoRef}
                                    autoPlay
                                    playsInline
                                    muted={isScreenSharing}
                                    srcObject={
                                        isScreenSharing
                                            ? screenStream
                                            : remoteScreenSharer?.stream
                                    }
                                />
                                <div className={cx('theater-screen-badge')}>
                                    <Tv size={16} />
                                    <span>
                                        Màn hình của{' '}
                                        {isScreenSharing
                                            ? 'Bạn'
                                            : remoteScreenSharer?.user?.name || 'Thành viên'}
                                    </span>
                                </div>
                            </div>

                            {/* Participant Strip below screen */}
                            <div className={cx('theater-strip')}>
                                <ParticipantTile
                                    isLocal
                                    stream={localStream}
                                    isMuted={isMuted}
                                    isCameraOn={isCameraOn}
                                    isScreenSharing={isScreenSharing}
                                    isSpeaking={speakingSockets.has('local')}
                                    displayName={
                                        currentUser?.displayName || currentUser?.username || 'Bạn'
                                    }
                                    avatar={currentUser?.avatarURL}
                                />
                                {peerList.map((p) => (
                                    <ParticipantTile
                                        key={p.socketId}
                                        stream={p.stream}
                                        isMuted={p.isMuted}
                                        isCameraOn={p.isCameraOn}
                                        isScreenSharing={p.isScreenSharing}
                                        isSpeaking={speakingSockets.has(p.socketId)}
                                        displayName={
                                            p.user?.displayName ||
                                            p.user?.name ||
                                            p.user?.username ||
                                            'Người dùng'
                                        }
                                        avatar={p.user?.avatar || p.user?.avatarURL}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Standard Dynamic Participant Grid */
                        <div className={cx('participants-grid', getGridClass())}>
                            {/* Local User Tile */}
                            <ParticipantTile
                                isLocal
                                stream={localStream}
                                isMuted={isMuted}
                                isCameraOn={isCameraOn}
                                isScreenSharing={isScreenSharing}
                                isSpeaking={speakingSockets.has('local')}
                                displayName={
                                    currentUser?.displayName || currentUser?.username || 'Bạn'
                                }
                                avatar={currentUser?.avatarURL}
                            />

                            {/* Remote Peers Tiles */}
                            {peerList.map((p) => (
                                <ParticipantTile
                                    key={p.socketId}
                                    stream={p.stream}
                                    isMuted={p.isMuted}
                                    isCameraOn={p.isCameraOn}
                                    isScreenSharing={p.isScreenSharing}
                                    isSpeaking={speakingSockets.has(p.socketId)}
                                    displayName={
                                        p.user?.displayName ||
                                        p.user?.name ||
                                        p.user?.username ||
                                        'Người dùng'
                                    }
                                    avatar={p.user?.avatar || p.user?.avatarURL}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Discord Bottom Control Dock */}
                <div className={cx('call-dock')}>
                    {/* Mic Toggle Button */}
                    <button
                        type="button"
                        className={cx('dock-btn', { muted: isMuted })}
                        onClick={toggleMic}
                        title={isMuted ? 'Bật Micro (Unmute)' : 'Tắt Micro (Mute)'}
                    >
                        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                    </button>

                    {/* Camera Toggle Button */}
                    <button
                        type="button"
                        className={cx('dock-btn', { active: isCameraOn })}
                        onClick={toggleCamera}
                        title={isCameraOn ? 'Tắt Camera' : 'Bật Camera'}
                    >
                        {isCameraOn ? <Video size={22} /> : <VideoOff size={22} />}
                    </button>

                    {/* Screen Share / Livestream Button */}
                    <button
                        type="button"
                        className={cx('dock-btn', { active: isScreenSharing })}
                        onClick={toggleScreenShare}
                        title={isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
                    >
                        <ScreenShare size={22} />
                    </button>

                    <TranslationNotes active={isInCall} kind="group"
                        sessionId={currentConversationId} sources={translationSources} />

                    {/* Leave / Disconnect Button */}
                    <button
                        type="button"
                        className={cx('dock-btn', 'disconnect')}
                        onClick={leaveGroupCall}
                        title="Rời phòng thoại"
                    >
                        <PhoneOff size={22} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroupCallModal;
