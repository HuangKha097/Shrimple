import React, { useEffect, useState, useRef, useMemo } from 'react';
import Peer from 'simple-peer';
import { useCallStore } from '../../stores/useCallStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import TranslationNotes from './TranslationNotes.jsx';

const defaultAvatar = '/favicon.png';

const CallModal = () => {
    const { 
        isCallIncoming, isCallActive, isCallEnded, 
        callType, callerInfo, 
        callerSignal,
        setCallAccepted, setCallEnded, rejectCall 
    } = useCallStore();

    const { user, socket } = useAuthStore();
    
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callAcceptedState, setCallAcceptedState] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);

    const myVideo = useRef(null);
    const userVideo = useRef(null);
    const connectionRef = useRef(null);
    const translationSources = useMemo(() => [
        { id: user?._id, stream, muted: !micOn },
        { id: callerInfo?.id, stream: remoteStream, muted: false },
    ], [user?._id, stream, micOn, callerInfo?.id, remoteStream]);

    // 1. Handle user media (Camera/Mic)
    useEffect(() => {
        if (isCallIncoming || isCallActive) {
            const hasVideo = callType === 'video';
            navigator.mediaDevices.getUserMedia({ video: hasVideo, audio: true })
                .then((currentStream) => {
                    setStream(currentStream);
                })
                .catch(err => {
                    console.error("Failed to get media", err);
                    toast.error("Không thể truy cập camera hoặc micro");
                    leaveCall();
                });
        } else {
             // Stop stream if call ended
             if (stream) {
                 stream.getTracks().forEach(track => track.stop());
                 setStream(null);
             }
             setRemoteStream(null);
             setCallAcceptedState(false);
        }
    }, [isCallIncoming, isCallActive, callType]);

    // Attach local stream to myVideo
    useEffect(() => {
        if (myVideo.current && stream) {
            myVideo.current.srcObject = stream;
        }
    }, [stream]);

    // Attach remote stream to userVideo whenever userVideo mounts or remoteStream changes
    useEffect(() => {
        if (userVideo.current && remoteStream) {
            userVideo.current.srcObject = remoteStream;
        }
    }, [remoteStream, callAcceptedState]);

    // 2. Initiate Call (Caller Side)
    useEffect(() => {
        if (isCallActive && !isCallIncoming && stream && !connectionRef.current && socket && callerInfo?.id) {
             const peer = new Peer({ initiator: true, trickle: false, stream: stream });

             peer.on('signal', (data) => {
                 socket.emit('callUser', {
                     userToCall: callerInfo.id,
                     signalData: data,
                     from: user?._id, // Caller ID
                     name: user?.displayName || user?.username,
                     avatar: user?.avatarURL,
                     isVideo: callType === 'video'
                 });
             });

             peer.on('stream', (currentStream) => {
                 setRemoteStream(currentStream);
             });

             const handleCallAccepted = (signal) => {
                 setCallAcceptedState(true);
                 peer.signal(signal);
             };

             const handleCallUserOffline = () => {
                 toast.error("Người dùng hiện không trực tuyến");
                 leaveCall();
             };

             socket.off('callAccepted');
             socket.off('callUserOffline');
             socket.on('callAccepted', handleCallAccepted);
             socket.on('callUserOffline', handleCallUserOffline);

             connectionRef.current = peer;

             return () => {
                 socket.off('callAccepted', handleCallAccepted);
                 socket.off('callUserOffline', handleCallUserOffline);
             };
        }
    }, [isCallActive, isCallIncoming, stream, callerInfo, socket, user, callType]);

    // 3. Handle Incoming Call Answer
    const answerCall = async () => {
        try {
            let activeStream = stream;
            if (!activeStream) {
                const hasVideo = callType === 'video';
                activeStream = await navigator.mediaDevices.getUserMedia({ video: hasVideo, audio: true });
                setStream(activeStream);
            }

            setCallAcceptedState(true);
            setCallAccepted(); 

            const peer = new Peer({ initiator: false, trickle: false, stream: activeStream });

            peer.on('signal', (data) => {
                socket?.emit('answerCall', { signal: data, to: callerInfo?.id });
            });

            peer.on('stream', (currentStream) => {
                setRemoteStream(currentStream);
            });

            if (callerSignal) {
                peer.signal(callerSignal);
            }
            connectionRef.current = peer;
        } catch (err) {
            console.error("Failed to answer call:", err);
            toast.error("Không thể kết nối micro/camera để trả lời");
            leaveCall();
        }
    };

    // 4. Handle Leaving Call
    const leaveCall = () => {
        if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setRemoteStream(null);
        setCallAcceptedState(false);
        if (socket && callerInfo?.id) {
            socket.emit('endCall', { to: callerInfo.id });
        }
        setCallEnded();
    };

    // Toggle Mic
    const toggleMic = () => {
        if (stream) {
            const nextState = !micOn;
            stream.getAudioTracks().forEach(track => {
                track.enabled = nextState;
            });
            setMicOn(nextState);
        }
    };

    // Toggle Camera
    const toggleCamera = () => {
        if (stream && callType === 'video') {
            const nextState = !cameraOn;
            stream.getVideoTracks().forEach(track => {
                track.enabled = nextState;
            });
            setCameraOn(nextState);
        }
    };

    if (!isCallIncoming && !isCallActive) return null;

    return (
        <div style={{
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
            
            <div style={{display: 'flex', gap: '2rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center'}}>
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
                        <button onClick={leaveCall} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
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
                            style={{padding: '0.9rem 2rem', borderRadius: '2rem', border: 'none', background: '#2ecc71', color: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem'}}
                        >
                            <Phone size={20} /> Trả lời
                        </button>
                        <button 
                            onClick={rejectCall}
                            style={{padding: '0.9rem 2rem', borderRadius: '2rem', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem'}}
                        >
                            <PhoneOff size={20} /> Từ chối
                        </button>
                    </div>
                </div>
            )}

            {/* Call Controls */}
            {callAcceptedState && !isCallEnded && (
                <div style={{display: 'flex', gap: '1.5rem', alignItems: 'center'}}>
                    <button onClick={toggleMic} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: micOn ? '#34495e' : '#e74c3c', color: 'white', cursor: 'pointer'}}>
                        {micOn ? <Mic size={22} /> : <MicOff size={22} />}
                    </button>
                    <button onClick={leaveCall} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: '#e74c3c', color: 'white', cursor: 'pointer'}}>
                        <PhoneOff size={24} />
                    </button>
                    {callType === 'video' && (
                        <button onClick={toggleCamera} style={{padding: '1rem', borderRadius: '50%', border: 'none', background: cameraOn ? '#34495e' : '#e74c3c', color: 'white', cursor: 'pointer'}}>
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
