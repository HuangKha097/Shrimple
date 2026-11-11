import { useCallback, useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import Peer from 'simple-peer';
import { useCallStore } from '../../stores/useCallStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from '../icons';
import { toast } from 'sonner';
import TranslationNotes from './TranslationNotes.jsx';
import { createDirectCallSession } from './directCallSession.js';
import { useTranslation } from 'react-i18next';
import './DirectCall.css';

const defaultAvatar = '/favicon.png';

const CallModal = () => {
    const {
        isCallIncoming, isCallActive, isCallEnded,
        callId, callType, callerInfo,
        callerSignal,
        setCallAccepted, setCallEnded
    } = useCallStore();

    const { user, socket } = useAuthStore();
    const { t } = useTranslation();

    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callAcceptedState, setCallAcceptedState] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);
    const [remoteMuted, setRemoteMuted] = useState(false);
    const [answering, setAnswering] = useState(false);

    const myVideo = useRef(null);
    const userVideo = useRef(null);
    const sessionRef = useRef(null);
    const translationSources = useMemo(() => [
        { id: user?._id, stream, muted: !micOn },
        { id: callerInfo?.id, stream: remoteStream, muted: remoteMuted },
    ], [user?._id, stream, micOn, callerInfo?.id, remoteStream, remoteMuted]);

    const callerId = callerInfo?.id;
    const viewerId = user?._id;
    // Snapshot signaling data once for this local call identity. Accepting it only
    // changes the store's UI flags; it must not recreate media or the peer.
    const callSetup = useRef(null);
    callSetup.current = { incoming: isCallIncoming, signal: callerSignal, user, t };

    useLayoutEffect(() => {
        setStream(null);
        setRemoteStream(null);
        setCallAcceptedState(false);
        setMicOn(true);
        setCameraOn(true);
        setRemoteMuted(false);
        setAnswering(false);
        if (!callId || !callerId) return;
        if (!socket?.connected || !viewerId) { setCallEnded(); return; }
        const setup = callSetup.current;
        const session = createDirectCallSession({
            socket, peerId: callerId, incoming: setup.incoming,
            signal: setup.signal, isVideo: callType === 'video', user: setup.user,
            createPeer: options => new Peer(options),
            getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
            onLocalStream: setStream,
            onRemoteStream: setRemoteStream,
            onRemoteMute: setRemoteMuted,
            onAccepted: () => {
                setCallAcceptedState(true);
                setAnswering(false);
                setCallAccepted();
            },
            onEnded: setCallEnded,
            onError: reason => toast.error(setup.t(`directCall.${reason}Error`)),
        });
        sessionRef.current = session;
        void session.start();
        return () => {
            sessionRef.current = null;
            session.stop();
        };
    }, [callId, callerId, callType, socket, viewerId, setCallAccepted, setCallEnded]);

    // Attach playback independently of signaling and microphone ownership.
    useEffect(() => {
        if (myVideo.current) myVideo.current.srcObject = stream;
    }, [stream]);
    useEffect(() => {
        if (userVideo.current) userVideo.current.srcObject = remoteStream;
    }, [remoteStream, callAcceptedState]);

    const leaveCall = useCallback(() => {
        sessionRef.current?.end();
    }, []);
    const answerCall = () => {
        if (!sessionRef.current || answering) return;
        setAnswering(true);
        void sessionRef.current.answer();
    };
    const toggleMic = () => {
        const enabled = !micOn;
        sessionRef.current?.setMicEnabled(enabled);
        setMicOn(enabled);
    };
    const toggleCamera = () => {
        const enabled = !cameraOn;
        sessionRef.current?.setCameraEnabled(enabled);
        setCameraOn(enabled);
    };

    if (!isCallIncoming && !isCallActive) return null;

    return (
        <div className={`direct-call-modal ${callAcceptedState ? 'direct-call-connected' : ''}`} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            backdropFilter: 'blur(8px)'
        }}>

            <div className="direct-call-media" style={{display: 'flex', gap: '2rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center'}}>
                {/* My Video / Preview */}
                {stream && callType === 'video' && (
                    <div style={{textAlign: 'center'}}>
                        <video playsInline muted ref={myVideo} autoPlay style={{ width: '300px', height: '225px', objectFit: 'cover', borderRadius: '1rem', border: '2px solid #444', backgroundColor: '#111' }} />
                        <p style={{ marginTop: '0.5rem', opacity: 0.8 }}>Bạn</p>
                    </div>
                )}

                {/* Other User Video */}
                {callAcceptedState && !isCallEnded && (
                    <div style={{textAlign: 'center'}}>
                        {callType === 'video' ? (
                            <video playsInline ref={userVideo} autoPlay style={{ width: '300px', height: '225px', objectFit: 'cover', borderRadius: '1rem', border: '2px solid #444', backgroundColor: '#111' }} />
                        ) : (
                            <div style={{ width: '150px', height: '150px', borderRadius: '50%', backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '3px solid #2ecc71' }}>
                                <audio ref={userVideo} autoPlay playsInline />
                                <img src={callerInfo?.avatar || defaultAvatar} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = defaultAvatar; }} />
                            </div>
                        )}
                        <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>{callerInfo?.name || 'Người dùng'}</p>
                    </div>
                )}
            </div>

            {/* Outgoing Call Prompt */}
            {!isCallIncoming && !callAcceptedState && (
                <div style={{textAlign: 'center', marginBottom: '2rem'}}>
                    <div style={{ width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 1.5rem auto', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.2)' }}>
                        <img src={callerInfo?.avatar || defaultAvatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = defaultAvatar; }} />
                    </div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 600 }}>Đang gọi cho {callerInfo?.name}...</h2>
                    <p style={{ opacity: 0.7, marginTop: '0.5rem' }}>{callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}</p>
                    <div style={{ marginTop: '2rem' }}>
                        <button onClick={leaveCall} aria-label={t('directCall.end')} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
                            <PhoneOff size={24} />
                        </button>
                    </div>
                </div>
            )}

            {/* Incoming Call Prompt */}
            {isCallIncoming && !callAcceptedState && (
                <div style={{textAlign: 'center', marginBottom: '2rem'}}>
                    <div style={{ width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 1.5rem auto', overflow: 'hidden', border: '3px solid #2ecc71' }}>
                        <img src={callerInfo?.avatar || defaultAvatar} alt="caller avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} onError={(e) => { e.currentTarget.src = defaultAvatar; }} />
                    </div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 600 }}>{callerInfo?.name || 'Người dùng'} đang gọi...</h2>
                    <p style={{ opacity: 0.7, marginTop: '0.5rem' }}>{callType === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến'}</p>
                    <div style={{display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '2rem'}}>
                        <button
                            onClick={answerCall}
                            disabled={answering}
                            style={{padding: '0.9rem 2rem', borderRadius: '2rem', border: 'none', background: '#2ecc71', color: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem'}}
                        >
                            <Phone size={20} /> {t(answering ? 'directCall.answering' : 'directCall.answer')}
                        </button>
                        <button
                            onClick={leaveCall}
                            style={{padding: '0.9rem 2rem', borderRadius: '2rem', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem'}}
                        >
                            <PhoneOff size={20} /> Từ chối
                        </button>
                    </div>
                </div>
            )}

            {/* Call Controls */}
            {callAcceptedState && !isCallEnded && (
                <div className="direct-call-controls" style={{display: 'flex', gap: '1.5rem', alignItems: 'center'}}>
                    <button onClick={toggleMic} aria-label={t(micOn ? 'directCall.mute' : 'directCall.unmute')} aria-pressed={!micOn} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: micOn ? '#34495e' : '#e74c3c', color: 'white', cursor: 'pointer'}}>
                        {micOn ? <Mic size={22} /> : <MicOff size={22} />}
                    </button>
                    <button onClick={leaveCall} aria-label={t('directCall.end')} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer'}}>
                        <PhoneOff size={24} />
                    </button>
                    {callType === 'video' && (
                        <button onClick={toggleCamera} aria-label={t(cameraOn ? 'directCall.cameraOff' : 'directCall.cameraOn')} aria-pressed={!cameraOn} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: cameraOn ? '#34495e' : '#e74c3c', color: 'white', cursor: 'pointer'}}>
                            {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
                        </button>
                    )}
                    <TranslationNotes active={callAcceptedState && !!remoteStream} kind="direct"
                        sessionId={callerInfo?.id} sources={translationSources} />
                </div>
            )}
        </div>
    );
};

export default CallModal;
