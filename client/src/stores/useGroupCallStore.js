import { create } from "zustand";
import Peer from "simple-peer";
import { useAuthStore } from "./useAuthStore";
import { toast } from "sonner";
import i18n from "../i18n.js";
import { defaultTargetLanguage } from "../components/chat/translationStream.js";

// Keep audio analyzers and active peer instances outside reactive state to avoid unnecessary renders
let localAudioContext = null;
let localAnalyser = null;
let audioInterval = null;
const remoteAnalysers = new Map(); // socketId -> AnalyserNode

const peerConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

export const useGroupCallStore = create((set, get) => {
    // Internal refs held inside closure
    const peersRef = { current: {} }; // socketId -> { peer, user, stream, isMuted, isCameraOn, isScreenSharing }
    const localStreamRef = { current: null };
    const screenStreamRef = { current: null };
    // Stable stream identity for every peer, including peers created during sharing.
    // Keep capture/preview streams separate; only the selected video is sent.
    const outgoingStreamRef = { current: null };
    let joinGeneration = 0;
    let cameraCaptureRequest = null;
    let screenCaptureRequest = null;
    const syncOutgoingVideo = () => {
        const stream = outgoingStreamRef.current;
        if (!stream) return;
        const liveVideo = source => source?.getVideoTracks().find(track => track.readyState === 'live');
        const next = liveVideo(screenStreamRef.current) || liveVideo(localStreamRef.current);
        const previous = stream.getVideoTracks()[0];
        if (previous === next) return;
        Object.values(peersRef.current).forEach(({ peer }) => {
            if (!peer || peer.destroyed) return;
            try {
                if (previous && next) peer.replaceTrack(previous, next, stream);
                else if (previous) peer.removeTrack(previous, stream);
                else if (next) peer.addTrack(next, stream);
            } catch (error) {
                console.warn('Group call video track update failed', error);
            }
        });
        if (previous) stream.removeTrack(previous);
        if (next) stream.addTrack(next);
    };
    const bindRemoteStream = (peer, socketId, participant) => {
        const update = remoteStream => {
            if (!get().isInCall || peersRef.current[socketId]?.peer !== peer) return;
            set(state => ({ peers: { ...state.peers, [socketId]: {
                ...state.peers[socketId], socketId,
                user: state.peers[socketId]?.user || participant,
                stream: remoteStream,
                isMuted: state.peers[socketId]?.isMuted ?? participant?.isMuted ?? false,
                isCameraOn: state.peers[socketId]?.isCameraOn ?? participant?.isCameraOn ?? false,
                isScreenSharing: state.peers[socketId]?.isScreenSharing ?? participant?.isScreenSharing ?? false,
            } } }));
        };
        peer.on('stream', remoteStream => {
            if (peersRef.current[socketId]?.peer !== peer) return;
            attachRemoteAudioAnalyser(socketId, remoteStream);
            update(remoteStream);
        });
        // simple-peer emits "stream" once per stream; later video tracks still
        // need a render when the call initially contained audio only.
        peer.on('track', (_track, remoteStream) => queueMicrotask(() => update(remoteStream)));
    };
    const syncLanguage = participant => {
        if (!participant) return;
        const { socket } = useAuthStore.getState();
        if (participant.socketId === socket?.id) {
            const current = get().attendance;
            if (current && current.attendanceId !== participant.attendanceId) return;
            if (current && current.languageRevision > participant.languageRevision) return;
            set({ attendance: participant, spokenLanguage: participant.spokenLanguage || get().spokenLanguage });
            return;
        }
        const current = get().peers[participant.socketId];
        if (!current || (current.user?.attendanceId && current.user.attendanceId !== participant.attendanceId) ||
            current.user?.languageRevision > participant.languageRevision) return;
        const next = { ...current, user: { ...current.user, ...participant } };
        if (peersRef.current[participant.socketId]) peersRef.current[participant.socketId].user = next.user;
        set(state => ({ peers: { ...state.peers, [participant.socketId]: next } }));
    };

    const startAudioActivityDetection = () => {
        if (audioInterval) clearInterval(audioInterval);

        audioInterval = setInterval(() => {
            const speaking = new Set();

            // 1. Check local microphone volume
            if (localAnalyser && localStreamRef.current && !get().isMuted) {
                const dataArray = new Uint8Array(localAnalyser.fftSize);
                localAnalyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const diff = dataArray[i] - 128;
                    sum += diff * diff;
                }
                const rms = Math.sqrt(sum / dataArray.length);
                if (rms > 10) {
                    speaking.add("local");
                }
            }

            // 2. Check remote participants volume
            for (const [socketId, analyser] of remoteAnalysers.entries()) {
                const peerInfo = get().peers[socketId];
                if (analyser && !peerInfo?.isMuted) {
                    const dataArray = new Uint8Array(analyser.fftSize);
                    analyser.getByteTimeDomainData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        const diff = dataArray[i] - 128;
                        sum += diff * diff;
                    }
                    const rms = Math.sqrt(sum / dataArray.length);
                    if (rms > 10) {
                        speaking.add(socketId);
                    }
                }
            }

            // Update speaking set if changed
            const currentSpeaking = get().speakingSockets;
            const isSame = currentSpeaking.size === speaking.size && [...speaking].every(s => currentSpeaking.has(s));
            if (!isSame) {
                set({ speakingSockets: speaking });
            }
        }, 150);
    };

    const stopAudioActivityDetection = () => {
        if (audioInterval) {
            clearInterval(audioInterval);
            audioInterval = null;
        }
        if (localAudioContext) {
            localAudioContext.close().catch(() => {});
            localAudioContext = null;
            localAnalyser = null;
        }
        remoteAnalysers.clear();
        set({ speakingSockets: new Set() });
    };

    const attachLocalAudioAnalyser = (stream) => {
        try {
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) return;
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            localAudioContext = new AudioContextClass();
            const source = localAudioContext.createMediaStreamSource(stream);
            localAnalyser = localAudioContext.createAnalyser();
            localAnalyser.fftSize = 256;
            source.connect(localAnalyser);
        } catch (err) {
            console.warn("Could not attach local audio analyser", err);
        }
    };

    const attachRemoteAudioAnalyser = (socketId, stream) => {
        try {
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) return;
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            remoteAnalysers.set(socketId, analyser);
        } catch (err) {
            console.warn("Could not attach remote audio analyser", err);
        }
    };

    return {
        // State
        isInCall: false,
        isModalOpen: false,
        isMinimized: false,
        currentConversationId: null,
        groupInfo: null, // { _id, name, avatarURL, participantsCount }
        localStream: null,
        screenStream: null,
        isMuted: false,
        isCameraOn: false,
        isScreenSharing: false,
        peers: {}, // { [socketId]: { socketId, user, stream, isMuted, isCameraOn, isScreenSharing } }
        speakingSockets: new Set(), // Set of socketIds + "local"
        activeGroupCalls: {}, // { [conversationId]: { isActive, startedBy, startedAt, participants: [...] } }
        incomingCall: null,
        callId: null,
        attendance: null,
        spokenLanguage: defaultTargetLanguage(i18n.resolvedLanguage || i18n.language),
        languagePending: false,

        // Actions
        setModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
        toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized, isModalOpen: state.isMinimized })),
        acceptIncomingCall: async () => {
            const incoming = get().incomingCall;
            if (!incoming) return;
            set({ incomingCall: null });
            await get().joinGroupCall(incoming.conversationId, incoming.groupInfo, incoming.callId);
        },
        declineIncomingCall: () => set({ incomingCall: null }),
        setSpokenLanguage: language => {
            if (!["vi", "en"].includes(language) || get().languagePending || language === get().spokenLanguage) return;
            const { socket } = useAuthStore.getState();
            const { attendance, callId, currentConversationId } = get();
            if (!get().isInCall) { set({ spokenLanguage: language }); return; }
            if (!socket?.connected || !attendance) return;
            set({ languagePending: true });
            socket.timeout(5000).emit("groupCallSetLanguage", { conversationId: currentConversationId, callId,
                attendanceId: attendance.attendanceId, spokenLanguage: language }, (error, answer) => {
                if (get().attendance?.attendanceId !== attendance.attendanceId) return;
                set({ languagePending: false });
                if (error || !answer?.ok) { toast.error(i18n.t('translationNotes.languageUpdateError')); return; }
                syncLanguage(answer.participant);
            });
        },
        removeConversationCalls: (conversationId) => {
            if (get().currentConversationId === conversationId) get().leaveGroupCall();
            set(state => {
                const activeGroupCalls = { ...state.activeGroupCalls };
                delete activeGroupCalls[conversationId];
                return { activeGroupCalls, incomingCall: state.incomingCall?.conversationId === conversationId ? null : state.incomingCall };
            });
        },

        // Group Call Socket Subscriptions
        subscribeToGroupCallEvents: () => {
            const { socket, user } = useAuthStore.getState();
            if (!socket) return;

            socket.off("groupCallStatusChanged");
            socket.off("allActiveGroupCalls");
            socket.off("groupCallExistingUsers");
            socket.off("groupCallUserJoined");
            socket.off("groupCallSignal");
            socket.off("groupCallParticipantMediaChanged");
            socket.off("groupCallLanguageChanged");
            socket.off("disconnect", get().onGroupDisconnect);
            socket.on("disconnect", get().onGroupDisconnect);
            socket.off("groupCallUserLeft");
            socket.off("groupCallEnded");
            socket.off("groupCallError");
            socket.off("incomingGroupCall");
            socket.on("incomingGroupCall", incoming => {
                if (incoming?.conversationId && !get().isInCall) set({ incomingCall: incoming });
            });
            socket.on("groupCallLanguageChanged", ({ conversationId, callId, participant }) => {
                if (get().isInCall && get().currentConversationId === conversationId && get().callId === callId) syncLanguage(participant);
            });

            socket.on("groupCallError", ({ message }) => {
                toast.error(message || "Cuộc gọi đã kết thúc.");
                get().leaveGroupCall();
            });

            // 1. Status of active calls in conversations
            socket.on("groupCallStatusChanged", (data) => {
                if (!data?.conversationId) return;
                const incoming = get().incomingCall;
                if (!data.isActive && incoming?.conversationId === data.conversationId && (!data.callId || incoming.callId === data.callId)) {
                    set({ incomingCall: null });
                }
                set((state) => {
                    const newMap = { ...state.activeGroupCalls };
                    if (data.isActive) {
                        newMap[data.conversationId] = data;
                    } else {
                        delete newMap[data.conversationId];
                    }
                    return { activeGroupCalls: newMap };
                });

                // Sync current call state and prune stale peers
                const { currentConversationId, isInCall } = get();
                if (isInCall && currentConversationId === data.conversationId) {
                    if (!data.isActive) {
                        toast.info("Cuộc gọi nhóm đã kết thúc");
                        get().leaveGroupCall();
                    } else if (Array.isArray(data.participants)) {
                        if (get().callId && data.callId !== get().callId) return;
                        data.participants.forEach(syncLanguage);
                        const activeSocketIds = new Set(data.participants.map((p) => p.socketId));
                        const currentPeers = get().peers;
                        let changed = false;
                        const newPeers = { ...currentPeers };
                        Object.keys(currentPeers).forEach((sid) => {
                            if (!activeSocketIds.has(sid)) {
                                if (peersRef.current[sid]?.peer) {
                                    try {
                                        peersRef.current[sid].peer.destroy();
                                    } catch (error) {
                                        console.error("Failed to destroy stale group call peer", error);
                                    }
                                }
                                delete peersRef.current[sid];
                                delete newPeers[sid];
                                changed = true;
                            }
                        });
                        if (changed) {
                            set({ peers: newPeers });
                        }
                    }
                }
            });

            // Handle when group call ends
            socket.on("groupCallEnded", ({ conversationId }) => {
                if (get().incomingCall?.conversationId === conversationId) set({ incomingCall: null });
                const { currentConversationId, isInCall } = get();
                if (isInCall && currentConversationId === conversationId) {
                    toast.info("Cuộc gọi nhóm đã kết thúc");
                    get().leaveGroupCall();
                }
            });

            // 2. Initial list of all active calls
            socket.on("allActiveGroupCalls", (allCalls) => {
                set({ activeGroupCalls: allCalls || {} });
            });

            // Request active calls immediately
            socket.emit("getAllActiveGroupCalls");

            // 3. Newly joined user receives existing participants
            socket.on("groupCallExistingUsers", ({ conversationId, callId, self, participants }) => {
                if (!get().isInCall || get().currentConversationId !== conversationId) return;
                Object.values(peersRef.current).forEach(entry => entry.peer?.destroy());
                peersRef.current = {};
                remoteAnalysers.clear();
                set({ peers: {} });
                set({ callId, attendance: self, spokenLanguage: self?.spokenLanguage || get().spokenLanguage });
                const stream = outgoingStreamRef.current;

                participants.forEach((participant) => {
                    const peer = new Peer({
                        initiator: true,
                        config: peerConfig,
                        trickle: false,
                        stream: stream || undefined,
                    });

                    peer.on("signal", (signalData) => {
                        socket.emit("groupCallSignal", {
                            to: participant.socketId,
                            signal: signalData,
                            fromSocketId: socket.id,
                            fromUser: {
                                _id: user?._id,
                                name: user?.displayName || user?.username,
                                avatar: user?.avatarURL,
                            },
                        });
                    });

                    bindRemoteStream(peer, participant.socketId, participant);

                    peersRef.current[participant.socketId] = {
                        peer,
                        user: participant,
                        stream: null,
                        isMuted: participant.isMuted,
                        isCameraOn: participant.isCameraOn,
                        isScreenSharing: participant.isScreenSharing,
                    };

                    set((state) => ({
                        peers: {
                            ...state.peers,
                            [participant.socketId]: peersRef.current[participant.socketId],
                        },
                    }));
                });
            });

            // 4. Other participants receive notification that a new user joined
            socket.on("groupCallUserJoined", ({ conversationId, user: newUser }) => {
                if (!get().isInCall || get().currentConversationId !== conversationId) return;
                // Wait for their signal to create non-initiator peer
                set((state) => ({
                    peers: {
                        ...state.peers,
                        [newUser.socketId]: {
                            socketId: newUser.socketId,
                            user: newUser,
                            stream: null,
                            isMuted: newUser.isMuted,
                            isCameraOn: newUser.isCameraOn,
                            isScreenSharing: newUser.isScreenSharing,
                        },
                    },
                }));
            });

            // 5. WebRTC Signaling (Offer / Answer)
            socket.on("groupCallSignal", ({ signal, fromSocketId, fromUser }) => {
                if (!get().isInCall || !outgoingStreamRef.current) return;
                let peerEntry = peersRef.current[fromSocketId];

                if (!peerEntry) {
                    const stream = outgoingStreamRef.current;
                    const peer = new Peer({
                        initiator: false,
                        config: peerConfig,
                        trickle: false,
                        stream: stream || undefined,
                    });

                    peer.on("signal", (signalData) => {
                        socket.emit("groupCallSignal", {
                            to: fromSocketId,
                            signal: signalData,
                            fromSocketId: socket.id,
                            fromUser: {
                                _id: user?._id,
                                name: user?.displayName || user?.username,
                                avatar: user?.avatarURL,
                            },
                        });
                    });

                    bindRemoteStream(peer, fromSocketId, fromUser);

                    peerEntry = {
                        peer,
                        user: get().peers[fromSocketId]?.user || fromUser,
                        stream: null,
                        isMuted: get().peers[fromSocketId]?.isMuted ?? fromUser?.isMuted ?? false,
                        isCameraOn: get().peers[fromSocketId]?.isCameraOn ?? fromUser?.isCameraOn ?? false,
                        isScreenSharing: get().peers[fromSocketId]?.isScreenSharing ?? fromUser?.isScreenSharing ?? false,
                    };
                    peersRef.current[fromSocketId] = peerEntry;

                    set((state) => ({
                        peers: {
                            ...state.peers,
                            [fromSocketId]: peerEntry,
                        },
                    }));
                }

                try {
                    peerEntry.peer.signal(signal);
                } catch (err) {
                    console.error("Error signaling group peer", err);
                }
            });

            // 6. Remote participant toggled their media (Mute / Cam / Screen)
            socket.on("groupCallParticipantMediaChanged", ({ socketId, isMuted, isCameraOn, isScreenSharing }) => {
                set((state) => {
                    const target = state.peers[socketId];
                    if (!target) return state;
                    return {
                        peers: {
                            ...state.peers,
                            [socketId]: {
                                ...target,
                                isMuted: typeof isMuted === "boolean" ? isMuted : target.isMuted,
                                isCameraOn: typeof isCameraOn === "boolean" ? isCameraOn : target.isCameraOn,
                                isScreenSharing: typeof isScreenSharing === "boolean" ? isScreenSharing : target.isScreenSharing,
                            },
                        },
                    };
                });
            });

            // 7. Participant left call
            socket.on("groupCallUserLeft", ({ socketId }) => {
                const peerEntry = peersRef.current[socketId];
                if (peerEntry?.peer) {
                    peerEntry.peer.destroy();
                }
                delete peersRef.current[socketId];
                remoteAnalysers.delete(socketId);

                set((state) => {
                    const newPeers = { ...state.peers };
                    delete newPeers[socketId];
                    const newSpeaking = new Set(state.speakingSockets);
                    newSpeaking.delete(socketId);
                    return { peers: newPeers, speakingSockets: newSpeaking };
                });
            });
        },

        unsubscribeFromGroupCallEvents: () => {
            const { socket } = useAuthStore.getState();
            if (!socket) return;
            socket.off("groupCallStatusChanged");
            socket.off("allActiveGroupCalls");
            socket.off("groupCallExistingUsers");
            socket.off("groupCallUserJoined");
            socket.off("groupCallSignal");
            socket.off("groupCallParticipantMediaChanged");
            socket.off("groupCallLanguageChanged");
            socket.off("disconnect", get().onGroupDisconnect);
            socket.off("groupCallUserLeft");
            socket.off("groupCallEnded");
            socket.off("groupCallError");
            socket.off("incomingGroupCall");
            set({ incomingCall: null });
        },

        // Join Voice Channel / Room
        onGroupDisconnect: () => { if (get().isInCall) get().leaveGroupCall(); },
        joinGroupCall: async (conversationId, groupInfo, targetCallId = null) => {
            const { socket, user } = useAuthStore.getState();
            if (!socket || !conversationId) return;

            // If already in this call, just open modal
            if (get().isInCall && get().currentConversationId === conversationId) {
                set({ isModalOpen: true, isMinimized: false });
                return;
            }

            // If in another call, leave first
            if (get().isInCall) {
                get().leaveGroupCall();
            }
            const generation = ++joinGeneration;

            try {
                // Request microphone access (audio-first for Discord voice channel)
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                    video: false,
                });
                if (generation !== joinGeneration || !socket.connected || useAuthStore.getState().socket !== socket) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                localStreamRef.current = stream;
                outgoingStreamRef.current = new MediaStream(stream.getAudioTracks());
                attachLocalAudioAnalyser(stream);
                startAudioActivityDetection();

                set({
                    isInCall: true,
                    isModalOpen: true,
                    isMinimized: false,
                    currentConversationId: conversationId,
                    groupInfo: groupInfo || null,
                    localStream: stream,
                    isMuted: false,
                    isCameraOn: false,
                    isScreenSharing: false,
                    peers: {},
                    attendance: null,
                    callId: null,
                    languagePending: false,
                });

                // Join room via socket
                socket.emit("joinGroupCall", {
                    conversationId,
                    callId: targetCallId || null,
                    spokenLanguage: get().spokenLanguage,
                    user: {
                        _id: user?._id,
                        displayName: user?.displayName,
                        username: user?.username,
                        avatarURL: user?.avatarURL,
                    },
                });

                toast.success("Đã tham gia phòng thoại nhóm");
            } catch (err) {
                if (generation !== joinGeneration) return;
                console.error("Failed to access audio/microphone:", err);
                toast.error("Không thể truy cập micro. Hãy kiểm tra quyền truy cập.");
            }
        },

        // Leave Voice Room
        leaveGroupCall: () => {
            joinGeneration += 1;
            cameraCaptureRequest = null;
            screenCaptureRequest = null;
            const { socket } = useAuthStore.getState();
            const { currentConversationId } = get();

            if (socket?.connected && currentConversationId) {
                socket.emit("leaveGroupCall", { conversationId: currentConversationId });
            }

            // Cleanup local stream
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => track.stop());
                localStreamRef.current = null;
            }

            // Cleanup screen stream
            if (screenStreamRef.current) {
                screenStreamRef.current.getVideoTracks().forEach(track => { track.onended = null; });
                screenStreamRef.current.getTracks().forEach((track) => track.stop());
                screenStreamRef.current = null;
            }
            outgoingStreamRef.current = null;

            // Destroy all active peer connections
            Object.values(peersRef.current).forEach((entry) => {
                if (entry?.peer) {
                    entry.peer.destroy();
                }
            });
            peersRef.current = {};

            stopAudioActivityDetection();

            set({
                isInCall: false,
                isModalOpen: false,
                isMinimized: false,
                currentConversationId: null,
                groupInfo: null,
                localStream: null,
                screenStream: null,
                isMuted: false,
                isCameraOn: false,
                isScreenSharing: false,
                peers: {},
                attendance: null,
                callId: null,
                languagePending: false,
            });
        },

        // Toggle Microphone (Mute / Unmute)
        toggleMic: () => {
            const { isMuted, currentConversationId } = get();
            const { socket } = useAuthStore.getState();
            const nextState = !isMuted;

            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach((track) => {
                    track.enabled = !nextState;
                });
            }

            set({ isMuted: nextState });

            if (socket && currentConversationId) {
                socket.emit("groupCallToggleMedia", {
                    conversationId: currentConversationId,
                    isMuted: nextState,
                });
            }
        },

        // Toggle Webcam (Video On / Off)
        toggleCamera: async () => {
            const { isCameraOn, currentConversationId } = get();
            const { socket } = useAuthStore.getState();
            if (!get().isInCall || cameraCaptureRequest) return;
            const request = {};
            cameraCaptureRequest = request;
            const generation = joinGeneration;
            const nextState = !isCameraOn;

            try {
                if (nextState) {
                    // Turn Camera ON
                    const videoStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
                        audio: false,
                    });
                    if (generation !== joinGeneration || !get().isInCall || !socket?.connected || useAuthStore.getState().socket !== socket) {
                        videoStream.getTracks().forEach(track => track.stop());
                        return;
                    }
                    const videoTrack = videoStream.getVideoTracks()[0];

                    if (localStreamRef.current) {
                        localStreamRef.current.addTrack(videoTrack);
                    }

                    syncOutgoingVideo();

                    set({ isCameraOn: true, localStream: localStreamRef.current });
                } else {
                    // Turn Camera OFF
                    if (localStreamRef.current) {
                        const videoTrack = localStreamRef.current.getVideoTracks()[0];
                        if (videoTrack) {
                            localStreamRef.current.removeTrack(videoTrack);
                            syncOutgoingVideo();
                            videoTrack.stop();
                        }
                    }
                    set({ isCameraOn: false });
                }

                if (socket && currentConversationId) {
                    socket.emit("groupCallToggleMedia", {
                        conversationId: currentConversationId,
                        isCameraOn: nextState,
                    });
                }
            } catch (err) {
                if (generation !== joinGeneration) return;
                console.error("Camera toggle failed:", err);
                toast.error("Không thể bật camera. Hãy kiểm tra quyền truy cập.");
            } finally {
                if (cameraCaptureRequest === request) cameraCaptureRequest = null;
            }
        },

        // Toggle Screen Share / Livestream
        toggleScreenShare: async () => {
            const { isScreenSharing, currentConversationId } = get();
            const { socket } = useAuthStore.getState();
            if (!get().isInCall || screenCaptureRequest) return;

            if (!isScreenSharing) {
                const request = {};
                screenCaptureRequest = request;
                const generation = joinGeneration;
                try {
                    const displayStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { cursor: "always" },
                        audio: true,
                    });
                    if (generation !== joinGeneration || !get().isInCall || !socket?.connected || useAuthStore.getState().socket !== socket) {
                        displayStream.getTracks().forEach(track => track.stop());
                        return;
                    }

                    screenStreamRef.current = displayStream;
                    const screenVideoTrack = displayStream.getVideoTracks()[0];

                    syncOutgoingVideo();

                    // Handle native stop sharing button on browser UI
                    screenVideoTrack.onended = () => {
                        if (screenStreamRef.current === displayStream && get().isScreenSharing) get().toggleScreenShare();
                    };

                    set({ isScreenSharing: true, screenStream: displayStream });

                    if (socket && currentConversationId) {
                        socket.emit("groupCallToggleMedia", {
                            conversationId: currentConversationId,
                            isScreenSharing: true,
                        });
                    }
                    toast.success("Bắt đầu chia sẻ màn hình");
                } catch (err) {
                    if (generation !== joinGeneration) return;
                    if (err.name !== "NotAllowedError") {
                        console.error("Failed to share screen:", err);
                        toast.error("Không thể chia sẻ màn hình");
                    }
                } finally {
                    if (screenCaptureRequest === request) screenCaptureRequest = null;
                }
            } else {
                // Stop screen sharing
                const displayStream = screenStreamRef.current;
                screenStreamRef.current = null;
                syncOutgoingVideo();
                displayStream?.getVideoTracks().forEach(track => { track.onended = null; });
                displayStream?.getTracks().forEach(track => track.stop());

                set({ isScreenSharing: false, screenStream: null });

                if (socket && currentConversationId) {
                    socket.emit("groupCallToggleMedia", {
                        conversationId: currentConversationId,
                        isScreenSharing: false,
                    });
                }
                toast.info("Đã dừng chia sẻ màn hình");
            }
        },
    };
});
