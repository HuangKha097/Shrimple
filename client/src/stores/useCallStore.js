import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";

export const useCallStore = create((set, get) => ({
    // State
    isCallIncoming: false,
    isCallActive: false,
    isCallEnded: false,
    callType: null, // "audio" | "video"
    callerSignal: null,
    callerInfo: null, // { id, name, avatar }
    stream: null,
    remoteStream: null,
    
    // Actions
    setCallIncoming: (data) => set({
        isCallIncoming: true,
        callerSignal: data.signal,
        callerInfo: { id: data.from, name: data.name, avatar: data.avatar },
        callType: data.isVideo ? "video" : "audio"
    }),

    setCallAccepted: (signal) => {
        // Here we would typically trigger the Peer signal processing
        set({ isCallActive: true, isCallIncoming: false });
    },

    setCallEnded: () => {
        set({ 
            isCallIncoming: false, 
            isCallActive: false, 
            isCallEnded: true,
            callerSignal: null,
            callerInfo: null,
            remoteStream: null 
            // Note: Local stream usually needs valid cleanup in component
        });
    },

    // Socket Event Subscriptions
    subscribeToCallEvents: () => {
        const { socket } = useAuthStore.getState();
        if (!socket) return;

        socket.off("callUser");
        socket.off("endCall");

        socket.on("callUser", (data) => {
            get().setCallIncoming(data);
        });
        
        // Handled inside component usually via Peer instance, but state can update here
        // socket.on("callAccepted", (signal) => ... ); 

        socket.on("endCall", () => {
            get().setCallEnded();
        });
    },

    unsubscribeFromCallEvents: () => {
        const { socket } = useAuthStore.getState();
        if (!socket) return;
        
        socket.off("callUser");
        socket.off("endCall");
    },
    
    // Call Actions (emitters)
    initiateCall: (recipientId, isVideo = false, recipientInfo = null) => {
         // Set state to active so Modal opens and starts getting media/signaling
         set({ 
             isCallActive: true, 
             isCallEnded: false, 
             callType: isVideo ? "video" : "audio",
             // We reuse callerInfo to store the person we are talking to
             // If we have full recipientInfo, use it for better UI (name, avatar)
             callerInfo: recipientInfo 
                ? { id: recipientId, name: recipientInfo.displayName || recipientInfo.username, avatar: recipientInfo.avatarURL } 
                : { id: recipientId, name: "User" } 
         });
    },
    
    rejectCall: () => {
        const { socket } = useAuthStore.getState();
        const { callerInfo } = get();
        if (socket && callerInfo) {
            socket.emit("endCall", { to: callerInfo.id });
        }
        get().setCallEnded();
    }
}));
