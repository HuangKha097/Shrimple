import { create } from "zustand";
import Peer from "simple-peer";
import { useAuthStore } from "./useAuthStore";
import { toast } from "sonner";

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

        // Actions
        setModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
        toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized, isModalOpen: state.isMinimized })),

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
            socket.off("groupCallUserLeft");
            socket.off("groupCallEnded");
            socket.off("groupCallError");

            socket.on("groupCallError", ({ message }) => {
                toast.error(message || "Cuộc gọi đã kết thúc.");
                get().leaveGroupCall();
            });

            // 1. Status of active calls in conversations
            socket.on("groupCallStatusChanged", (data) => {
                if (!data?.conversationId) return;
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
                        const activeSocketIds = new Set(data.participants.map((p) => p.socketId));
                        const currentPeers = get().peers;
                        let changed = false;
                        const newPeers = { ...currentPeers };
                        Object.keys(currentPeers).forEach((sid) => {
                            if (!activeSocketIds.has(sid)) {
                                if (peersRef.current[sid]?.peer) {
                                    try {
                                        peersRef.current[sid].peer.destroy();
                                    } catch (e) {}
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
            socket.on("groupCallExistingUsers", ({ conversationId, participants }) => {
                const stream = localStreamRef.current;
                const { isMuted, isCameraOn, isScreenSharing } = get();

                participants.forEach((participant) => {
                    const peer = new Peer({
                        initiator: true,
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

                    peer.on("stream", (remoteStream) => {
                        attachRemoteAudioAnalyser(participant.socketId, remoteStream);
                        set((state) => ({
                            peers: {
                                ...state.peers,
                                [participant.socketId]: {
                                    ...state.peers[participant.socketId],
                                    socketId: participant.socketId,
                                    user: participant,
                                    stream: remoteStream,
                                    isMuted: participant.isMuted,
                                    isCameraOn: participant.isCameraOn,
                                    isScreenSharing: participant.isScreenSharing,
                                },
                            },
                        }));
                    });

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
                let peerEntry = peersRef.current[fromSocketId];

                if (!peerEntry) {
                    const stream = localStreamRef.current;
                    const peer = new Peer({
                        initiator: false,
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

                    peer.on("stream", (remoteStream) => {
                        attachRemoteAudioAnalyser(fromSocketId, remoteStream);
                        set((state) => ({
                            peers: {
                                ...state.peers,
                                [fromSocketId]: {
                                    ...state.peers[fromSocketId],
                                    socketId: fromSocketId,
                                    user: fromUser || state.peers[fromSocketId]?.user,
                                    stream: remoteStream,
                                },
                            },
                        }));
                    });

                    peerEntry = {
                        peer,
                        user: fromUser,
                        stream: null,
                        isMuted: get().peers[fromSocketId]?.isMuted ?? false,
                        isCameraOn: get().peers[fromSocketId]?.isCameraOn ?? false,
                        isScreenSharing: get().peers[fromSocketId]?.isScreenSharing ?? false,
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
            socket.off("groupCallUserLeft");
            socket.off("groupCallEnded");
            socket.off("groupCallError");
        },

        // Join Voice Channel / Room
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

                localStreamRef.current = stream;
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
                });

                // Join room via socket
                socket.emit("joinGroupCall", {
                    conversationId,
                    callId: targetCallId || null,
                    user: {
                        _id: user?._id,
                        displayName: user?.displayName,
                        username: user?.username,
                        avatarURL: user?.avatarURL,
                    },
                });

                toast.success("Đã tham gia phòng thoại nhóm");
            } catch (err) {
                console.error("Failed to access audio/microphone:", err);
                toast.error("Không thể truy cập micro. Hãy kiểm tra quyền truy cập.");
            }
        },

        // Leave Voice Room
        leaveGroupCall: () => {
            const { socket } = useAuthStore.getState();
            const { currentConversationId } = get();

            if (socket && currentConversationId) {
                socket.emit("leaveGroupCall", { conversationId: currentConversationId });
            }

            // Cleanup local stream
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => track.stop());
                localStreamRef.current = null;
            }

            // Cleanup screen stream
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach((track) => track.stop());
                screenStreamRef.current = null;
            }

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
            const nextState = !isCameraOn;

            try {
                if (nextState) {
                    // Turn Camera ON
                    const videoStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
                        audio: false,
                    });
                    const videoTrack = videoStream.getVideoTracks()[0];

                    if (localStreamRef.current) {
                        localStreamRef.current.addTrack(videoTrack);
                    }

                    // Add / replace track in all peer connections
                    Object.values(peersRef.current).forEach(({ peer }) => {
                        try {
                            if (peer) {
                                peer.addTrack(videoTrack, localStreamRef.current);
                            }
                        } catch (e) {
                            console.warn("Peer addTrack video error:", e);
                        }
                    });

                    set({ isCameraOn: true, localStream: localStreamRef.current });
                } else {
                    // Turn Camera OFF
                    if (localStreamRef.current) {
                        const videoTrack = localStreamRef.current.getVideoTracks()[0];
                        if (videoTrack) {
                            videoTrack.stop();
                            localStreamRef.current.removeTrack(videoTrack);
                            Object.values(peersRef.current).forEach(({ peer }) => {
                                try {
                                    if (peer) {
                                        peer.removeTrack(videoTrack, localStreamRef.current);
                                    }
                                } catch (e) {
                                    console.warn("Peer removeTrack video error:", e);
                                }
                            });
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
                console.error("Camera toggle failed:", err);
                toast.error("Không thể bật camera. Hãy kiểm tra quyền truy cập.");
            }
        },

        // Toggle Screen Share / Livestream
        toggleScreenShare: async () => {
            const { isScreenSharing, currentConversationId } = get();
            const { socket } = useAuthStore.getState();

            if (!isScreenSharing) {
                try {
                    const displayStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { cursor: "always" },
                        audio: true,
                    });

                    screenStreamRef.current = displayStream;
                    const screenVideoTrack = displayStream.getVideoTracks()[0];

                    // Replace or add video track on peers
                    Object.values(peersRef.current).forEach(({ peer }) => {
                        try {
                            if (peer) {
                                const currentVideoTrack = localStreamRef.current?.getVideoTracks()[0];
                                if (currentVideoTrack) {
                                    peer.replaceTrack(currentVideoTrack, screenVideoTrack, localStreamRef.current);
                                } else {
                                    peer.addTrack(screenVideoTrack, localStreamRef.current);
                                }
                            }
                        } catch (e) {
                            console.warn("Screen share track error:", e);
                        }
                    });

                    // Handle native stop sharing button on browser UI
                    screenVideoTrack.onended = () => {
                        get().toggleScreenShare();
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
                    if (err.name !== "NotAllowedError") {
                        console.error("Failed to share screen:", err);
                        toast.error("Không thể chia sẻ màn hình");
                    }
                }
            } else {
                // Stop screen sharing
                if (screenStreamRef.current) {
                    screenStreamRef.current.getTracks().forEach((track) => track.stop());
                    screenStreamRef.current = null;
                }

                // If camera was on, revert back to camera track
                const cameraVideoTrack = localStreamRef.current?.getVideoTracks()[0];
                Object.values(peersRef.current).forEach(({ peer }) => {
                    try {
                        if (peer && cameraVideoTrack) {
                            peer.replaceTrack(peer.streams[0]?.getVideoTracks()[0], cameraVideoTrack, localStreamRef.current);
                        }
                    } catch (e) {
                        console.warn("Screen share revert error:", e);
                    }
                });

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
