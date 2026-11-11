// One owner for the microphone, peer and signaling listeners of a direct call.
// Accepting an incoming call must not replace the stream already attached to it.
export function createDirectCallSession({ socket, peerId, incoming, signal, isVideo, user,
    createPeer, getUserMedia, onLocalStream, onRemoteStream, onAccepted, onRemoteMute,
    onEnded, onError }) {
    let closed = false;
    let peer;
    let localStream;
    let mediaPromise;
    let answering = false;
    let accepted = false;
    let micEnabled = true;
    let cameraEnabled = true;
    const listeners = [];
    const listen = (event, handler) => {
        socket.on(event, handler);
        listeners.push([event, handler]);
    };
    const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
    const applyMediaState = () => {
        localStream?.getAudioTracks().forEach(track => { track.enabled = micEnabled; });
        localStream?.getVideoTracks().forEach(track => { track.enabled = cameraEnabled; });
    };
    const sendMediaState = () => {
        if (!closed && accepted && socket.connected) {
            socket.emit('callMediaState', { to: peerId, isMuted: !micEnabled });
        }
    };
    const stop = ({ notify = true } = {}) => {
        if (closed) return;
        closed = true;
        listeners.forEach(([event, handler]) => socket.off(event, handler));
        // Disable callbacks before destroy(), which can synchronously emit close.
        peer?.destroy();
        stopTracks(localStream);
        localStream = null;
        if (notify && socket.connected) socket.emit('endCall', { to: peerId });
    };
    const end = (options) => {
        if (closed) return;
        stop(options);
        onEnded();
    };
    const fail = reason => {
        if (closed) return;
        onError(reason);
        end();
    };
    const acquireMedia = () => {
        if (!mediaPromise) {
            mediaPromise = Promise.resolve().then(() => {
                if (closed) return null;
                return getUserMedia({ video: isVideo, audio: {
                    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                } });
            }).then(stream => {
                if (closed) { stopTracks(stream); return null; }
                localStream = stream;
                applyMediaState();
                onLocalStream(stream);
                return stream;
            });
        }
        return mediaPromise;
    };
    const attachPeer = (stream, initiator) => {
        peer = createPeer({ initiator, trickle: false, stream });
        peer.on('signal', data => {
            if (closed) return;
            socket.emit(initiator ? 'callUser' : 'answerCall', initiator ? {
                userToCall: peerId, signalData: data,
                name: user?.displayName || user?.username, avatar: user?.avatarURL, isVideo,
            } : { to: peerId, signal: data });
        });
        peer.on('stream', stream => { if (!closed) onRemoteStream(stream); });
        peer.on('connect', sendMediaState);
        peer.on('error', () => fail('connection'));
        peer.on('close', () => end());
        return peer;
    };
    const markAccepted = () => {
        accepted = true;
        onAccepted();
        sendMediaState();
    };

    listen('disconnect', () => end({ notify: false }));
    listen('callMediaState', data => {
        if (!closed && data?.from === peerId && typeof data.isMuted === 'boolean') onRemoteMute(data.isMuted);
    });
    if (!incoming) {
        listen('callAccepted', answer => {
            if (closed || accepted || !peer) return;
            try { peer.signal(answer); markAccepted(); } catch { fail('connection'); }
        });
        listen('callUserOffline', data => {
            if (!data?.userId || data.userId === peerId) fail('offline');
        });
    }

    return {
        async start() {
            // Ringing alone does not need microphone/camera permission.
            if (incoming || closed || peer) return;
            try {
                const stream = await acquireMedia();
                if (!closed && !peer && stream) attachPeer(stream, true);
            } catch { fail(localStream ? 'connection' : 'media'); }
        },
        async answer() {
            if (!incoming || closed || answering || peer) return;
            answering = true;
            try {
                const stream = await acquireMedia();
                if (closed || !stream) return;
                attachPeer(stream, false).signal(signal);
                markAccepted();
            } catch { fail(localStream ? 'connection' : 'media'); }
        },
        setMicEnabled(enabled) {
            if (closed) return;
            micEnabled = enabled;
            applyMediaState();
            sendMediaState();
        },
        setCameraEnabled(enabled) {
            if (closed) return;
            cameraEnabled = enabled;
            applyMediaState();
        },
        end,
        stop,
    };
}
