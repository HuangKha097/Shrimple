import "dotenv/config";
import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || "http://localhost:5173,https://shrimplechat.netlify.app")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: CLIENT_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { upDateConversationAfterCreateMessage } from "../utils/messageHelper.js";

// Map { [userId: string]: Set<socketId> }
const userSocketMap = {}; 
// Map { [userId: string]: boolean }
const userVisibilityMap = {};

// Active group calls: Map<conversationId, { conversationId, startedBy, startedAt, participants: Map<socketId, { userId, socketId, name, avatar, isMuted, isCameraOn, isScreenSharing, joinedAt }> }>
const activeGroupCalls = new Map();
// A direct call becomes translatable only after its answer is signaled.
const directCalls = new Map();
const directKey = (a, b) => [a?.toString(), b?.toString()].sort().join(":");

export const isTranslationParticipant = (kind, sessionId, viewerId, speakerId) => {
    if (!sessionId || !speakerId) return false;
    if (kind === "direct") {
        const call = directCalls.get(directKey(viewerId, sessionId));
        return Boolean(call?.accepted && call.users.includes(viewerId) && call.users.includes(speakerId));
    }
    if (kind === "group") {
        const call = activeGroupCalls.get(sessionId);
        if (!call) return false;
        const members = Array.from(call.participants.values()).map((participant) => participant.userId.toString());
        return members.includes(viewerId) && members.includes(speakerId);
    }
    return false;
};

io.use((socket, next) => {
    try {
        const decoded = jwt.verify(socket.handshake.auth?.token, process.env.ACCESS_TOKEN_SECRET);
        socket.data.userId = decoded.userId?.toString();
        if (!socket.data.userId) throw new Error("Missing user ID");
        next();
    } catch {
        next(new Error("Authentication required"));
    }
});

const formatCallPayload = (conversationId, call) => {
    if (!call || call.participants.size === 0) {
        return {
            callId: call?.callId || null,
            conversationId,
            isActive: false,
            participants: [],
            startedBy: null,
            startedAt: null,
        };
    }
    return {
        callId: call.callId,
        conversationId,
        isActive: true,
        startedBy: call.startedBy,
        startedAt: call.startedAt,
        participants: Array.from(call.participants.values()),
    };
};

const broadcastGroupCallStatus = async (conversationId, callData) => {
    try {
        const convo = await Conversation.findById(conversationId).select("participants");
        if (convo && convo.participants) {
            convo.participants.forEach((p) => {
                const uid = (p.userId?._id || p.userId)?.toString();
                if (uid) {
                    io.to(uid).emit("groupCallStatusChanged", callData);
                }
            });
        }
    } catch (err) {
        console.error("Error broadcasting group call status:", err);
    }
    io.to(`group-call-${conversationId}`).emit("groupCallStatusChanged", callData);
};

const formatCallTime = (date) => {
    try {
        return new Date(date).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Ho_Chi_Minh",
        });
    } catch {
        const d = new Date(date);
        const h = String(d.getHours()).padStart(2, "0");
        const m = String(d.getMinutes()).padStart(2, "0");
        return h + ":" + m;
    }
};

const formatCallDuration = (startDate, endDate) => {
    const diffMs = Math.max(0, new Date(endDate).getTime() - new Date(startDate).getTime());
    const totalSeconds = Math.round(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
        return (minutes + " phút " + (seconds > 0 ? (seconds + " giây") : "")).trim();
    }
    return Math.max(1, seconds) + " giây";
};

const leaveParticipantFromGroupCall = async (conversationId, socket, reason = "leave") => {
    const call = activeGroupCalls.get(conversationId);
    if (!call) return;

    if (call.participants.has(socket.id)) {
        const participant = call.participants.get(socket.id);
        call.participants.delete(socket.id);
        socket.leave("group-call-" + conversationId);

        // Notify all remaining participants in the group call room
        io.to("group-call-" + conversationId).emit("groupCallUserLeft", {
            socketId: socket.id,
            userId: participant.userId,
            conversationId,
        });

        // If no one is left in the call, terminate the group call completely
        if (call.participants.size === 0) {
            await terminateGroupCall(conversationId, socket, reason);
        } else {
            // Update active call status for chat banner / all conversation members
            const payload = formatCallPayload(conversationId, call);
            await broadcastGroupCallStatus(conversationId, payload);
        }
    }
};

const terminateGroupCall = async (conversationId, socket, reason = "ended") => {
    const call = activeGroupCalls.get(conversationId);
    if (!call) return;

    activeGroupCalls.delete(conversationId);

    const startedAt = call.startedAt || new Date();
    const endedAt = new Date();
    const startTimeStr = formatCallTime(startedAt);
    const endTimeStr = formatCallTime(endedAt);
    const durationStr = formatCallDuration(startedAt, endedAt);
    const endContent = "Cuộc gọi nhóm đã kết thúc • Bắt đầu: " + startTimeStr + " - Kết thúc: " + endTimeStr + " (" + durationStr + ")";

    // Notify all participants in this group call room
    io.to("group-call-" + conversationId).emit("groupCallEnded", {
        callId: call.callId,
        conversationId,
        startedAt,
        endedAt,
        durationStr,
        reason,
    });

    // Make all sockets leave this group call room
    io.in("group-call-" + conversationId).socketsLeave("group-call-" + conversationId);

    // Broadcast inactive status to all members of the conversation
    const endedPayload = {
        callId: call.callId,
        conversationId,
        isActive: false,
        participants: [],
        startedBy: null,
        startedAt: null,
        endedAt,
    };
    await broadcastGroupCallStatus(conversationId, endedPayload);

    // Update original call message to ended state, or create ended message if not found
    try {
        let finalMessage = null;
        if (call.callMessageId) {
            finalMessage = await Message.findByIdAndUpdate(
                call.callMessageId,
                {
                    content: endContent,
                    callStatus: "ended",
                    callDuration: durationStr,
                    endedAt,
                },
                { new: true }
            ).populate("senderId", "username displayName avatarURL");
        }

        if (!finalMessage) {
            const senderId = call.startedBy?._id || socket?.data?.userId;
            const callEndMessage = await Message.create({
                conversationId,
                senderId,
                content: endContent,
                messageType: "group_call",
                callId: call.callId,
                callStatus: "ended",
                callDuration: durationStr,
                startedAt,
                endedAt,
            });
            finalMessage = await Message.findById(callEndMessage._id)
                .populate("senderId", "username displayName avatarURL");
        }

        const convo = await Conversation.findById(conversationId);
        if (convo && finalMessage) {
            upDateConversationAfterCreateMessage(convo, finalMessage, finalMessage.senderId?._id || finalMessage.senderId);
            await convo.save();

            // Broadcast messageUpdated to all participants in this conversation
            convo.participants.forEach((p) => {
                const uid = (p.userId?._id || p.userId)?.toString();
                if (uid) {
                    io.to(uid).emit("messageUpdated", finalMessage);
                }
            });
        }
    } catch (msgErr) {
        console.error("Error updating group call ended message:", msgErr);
    }
};

export const broadcastOnlineUsers = () => {
    const visibleOnlineUserIds = Object.keys(userSocketMap).filter(
        (uid) => userVisibilityMap[uid] !== false
    );

    Object.entries(userSocketMap).forEach(([uid, sockets]) => {
        const isSelfVisible = userVisibilityMap[uid] !== false;
        const listToSend = isSelfVisible ? visibleOnlineUserIds : [];
        sockets.forEach((sid) => {
            io.to(sid).emit("getOnlineUsers", listToSend);
        });
    });
};

export const getReceiverSocketId = (receiverId) => {
    if (!receiverId) return null;
    const id = receiverId.toString();
    const sockets = userSocketMap[id];
    if (!sockets || sockets.size === 0) return null;
    return Array.from(sockets)[0];
};

export const isUserOnline = (userId) => {
    if (!userId) return false;
    const sockets = userSocketMap[userId.toString()];
    const isVisible = userVisibilityMap[userId.toString()] !== false;
    return !!(sockets && sockets.size > 0 && isVisible);
};

io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    const userId = socket.data.userId;
    const showOnline = socket.handshake.query.showOnlineStatus !== "false";

    if (userId && userId !== "undefined") {
        if (!userSocketMap[userId]) {
            userSocketMap[userId] = new Set();
        }
        userSocketMap[userId].add(socket.id);
        userVisibilityMap[userId] = showOnline;
        // Cho socket gia nhập room theo userId
        socket.join(userId);
    }

    broadcastOnlineUsers();

    socket.on("setOnlineVisibility", (isVisible) => {
        if (userId) {
            userVisibilityMap[userId] = !!isVisible;
            broadcastOnlineUsers();
        }
    });

    // --- 1-ON-1 CALLING EVENTS (Signaling) ---
    
    // 1. Initiate Call
    socket.on("callUser", ({ userToCall, signalData, from, name, avatar, isVideo }) => {
        const targetUserId = userToCall?.toString();
        if (targetUserId && isUserOnline(targetUserId)) {
            directCalls.set(directKey(userId, targetUserId), { users: [userId, targetUserId], accepted: false });
            io.to(targetUserId).emit("callUser", { signal: signalData, from: userId, name, avatar, isVideo });
        } else {
             // Notify caller that user is offline
             io.to(socket.id).emit("callUserOffline", { userId: userToCall });
        }
    });

    // 2. Answer Call
    socket.on("answerCall", (data) => {
        const targetUserId = data.to?.toString();
        const call = directCalls.get(directKey(userId, targetUserId));
        if (targetUserId && call?.users.includes(userId)) {
            call.accepted = true;
            io.to(targetUserId).emit("callAccepted", data.signal);
        }
    });

    // 3. ICE Candidates (Network path discovery)
    socket.on("ice-candidate", ({ candidate, to }) => {
        const targetUserId = to?.toString();
        if (targetUserId) {
            io.to(targetUserId).emit("ice-candidate", candidate);
        }
    });

    // 4. End Call / Reject Call
    socket.on("endCall", ({ to }) => {
        const targetUserId = to?.toString();
        if (targetUserId) {
            directCalls.delete(directKey(userId, targetUserId));
            io.to(targetUserId).emit("endCall");
        }
    });

    // --- DISCORD-LIKE GROUP CALLING (Mesh WebRTC & Voice Channels) ---

    // 1. Join Group Call Room
    socket.on("joinGroupCall", async ({ conversationId, user, callId }) => {
        if (!mongoose.isValidObjectId(conversationId) || user?._id?.toString() !== userId) return;
        const membership = await Conversation.exists({ _id: conversationId, "participants.userId": userId });
        if (!membership) return;
        
        let call = activeGroupCalls.get(conversationId);

        // If a call is active, but the user requested a specific old callId that doesn't match
        if (call && callId && call.callId !== callId) {
            socket.emit("groupCallError", { message: "Cuộc gọi này đã kết thúc." });
            return;
        }

        // If no call is currently active, but the user is clicking an old ended call's link
        if (!call && callId) {
            socket.emit("groupCallError", { message: "Cuộc gọi này đã kết thúc." });
            return;
        }

        const isNewCall = !call;

        if (!call) {
            const newCallId = new mongoose.Types.ObjectId().toString();
            const startedAt = new Date();
            const startTimeStr = formatCallTime(startedAt);
            call = {
                callId: newCallId,
                conversationId,
                startedBy: {
                    _id: user._id,
                    name: user.displayName || user.username || "User",
                    avatar: user.avatarURL || "",
                },
                startedAt,
                participants: new Map(),
                callMessageId: null,
            };
            activeGroupCalls.set(conversationId, call);

            // Create in-group notification message for the group call
            try {
                const startContent = "Cuộc gọi nhóm đã bắt đầu • " + startTimeStr;
                const callMessage = await Message.create({
                    conversationId,
                    senderId: user._id,
                    content: startContent,
                    messageType: "group_call",
                    callId: newCallId,
                    callStatus: "active",
                    startedAt,
                });
                call.callMessageId = callMessage._id.toString();

                const populatedMessage = await Message.findById(callMessage._id)
                    .populate("senderId", "username displayName avatarURL");

                const convo = await Conversation.findById(conversationId);
                if (convo) {
                    upDateConversationAfterCreateMessage(convo, populatedMessage, user._id);
                    await convo.save();

                    // Broadcast newMessage to all participants in this conversation
                    convo.participants.forEach((p) => {
                        const uid = (p.userId?._id || p.userId)?.toString();
                        if (uid) {
                            io.to(uid).emit("newMessage", populatedMessage);
                        }
                    });

                    // Emit incomingGroupCall to other participants so their call screen / modal pops up
                    convo.participants.forEach((p) => {
                        const uid = (p.userId?._id || p.userId)?.toString();
                        if (uid && uid !== userId) {
                            io.to(uid).emit("incomingGroupCall", {
                                callId: newCallId,
                                conversationId,
                                caller: {
                                    _id: user._id,
                                    name: user.displayName || user.username || "Thành viên",
                                    avatar: user.avatarURL || "",
                                },
                                groupInfo: {
                                    _id: convo._id,
                                    name: convo.group?.name || convo.name || "Nhóm",
                                    avatarURL: convo.group?.avatarURL || convo.avatarURL || "",
                                    participantsCount: convo.participants.length,
                                }
                            });
                        }
                    });
                }
            } catch (msgErr) {
                console.error("Error creating group call notification message:", msgErr);
            }
        }

        const newParticipant = {
            userId: user._id,
            socketId: socket.id,
            name: user.displayName || user.username || "User",
            avatar: user.avatarURL || "",
            isMuted: false,
            isCameraOn: false,
            isScreenSharing: false,
            joinedAt: new Date(),
        };

        // Existing participants currently in the call
        const existingParticipants = Array.from(call.participants.values());

        // Add user to call
        call.participants.set(socket.id, newParticipant);
        socket.join(`group-call-${conversationId}`);

        // Send existing participants list to newly joined user
        socket.emit("groupCallExistingUsers", {
            conversationId,
            participants: existingParticipants,
        });

        // Notify other participants in the room that a new user joined
        socket.to(`group-call-${conversationId}`).emit("groupCallUserJoined", {
            conversationId,
            user: newParticipant,
        });

        // Broadcast active status to all conversation members (updates live banner in chat)
        const payload = formatCallPayload(conversationId, call);
        await broadcastGroupCallStatus(conversationId, payload);
    });

    // 2. WebRTC Mesh Signaling (Offer / Answer / ICE)
    socket.on("groupCallSignal", ({ to, signal, fromSocketId, fromUser }) => {
        if (to) {
            io.to(to).emit("groupCallSignal", {
                signal,
                fromSocketId: socket.id,
                fromUser,
            });
        }
    });

    // 3. Toggle Media States (Mic Mute / Camera / Screen Share)
    socket.on("groupCallToggleMedia", async ({ conversationId, isMuted, isCameraOn, isScreenSharing }) => {
        const call = activeGroupCalls.get(conversationId);
        if (call && call.participants.has(socket.id)) {
            const participant = call.participants.get(socket.id);
            if (typeof isMuted === "boolean") participant.isMuted = isMuted;
            if (typeof isCameraOn === "boolean") participant.isCameraOn = isCameraOn;
            if (typeof isScreenSharing === "boolean") participant.isScreenSharing = isScreenSharing;

            io.to(`group-call-${conversationId}`).emit("groupCallParticipantMediaChanged", {
                socketId: socket.id,
                userId: participant.userId,
                isMuted: participant.isMuted,
                isCameraOn: participant.isCameraOn,
                isScreenSharing: participant.isScreenSharing,
            });

            const payload = formatCallPayload(conversationId, call);
            await broadcastGroupCallStatus(conversationId, payload);
        }
    });

    // 4. Leave Group Call
    socket.on("leaveGroupCall", async ({ conversationId }) => {
        if (conversationId) {
            await leaveParticipantFromGroupCall(conversationId, socket, "leave");
        } else {
            for (const [convoId, call] of activeGroupCalls.entries()) {
                if (call.participants.has(socket.id)) {
                    await leaveParticipantFromGroupCall(convoId, socket, "leave");
                }
            }
        }
    });

    // 5. Query Call Status for a Conversation
    socket.on("getGroupCallStatus", ({ conversationId }, callback) => {
        const call = activeGroupCalls.get(conversationId);
        const payload = formatCallPayload(conversationId, call);
        if (typeof callback === "function") {
            callback(payload);
        } else {
            socket.emit("groupCallStatusChanged", payload);
        }
    });

    // 6. Query All Active Group Calls
    socket.on("getAllActiveGroupCalls", (callback) => {
        const allCalls = {};
        for (const [convoId, call] of activeGroupCalls.entries()) {
            if (call.participants.size > 0) {
                allCalls[convoId] = formatCallPayload(convoId, call);
            }
        }
        for (const [key, call] of directCalls.entries()) {
            if (call.users.includes(userId)) directCalls.delete(key);
        }
        if (typeof callback === "function") {
            callback(allCalls);
        } else {
            socket.emit("allActiveGroupCalls", allCalls);
        }
    });

    socket.on("disconnect", async () => {
        console.log("user disconnected", socket.id);
        if (userId && userSocketMap[userId]) {
            userSocketMap[userId].delete(socket.id);
            if (userSocketMap[userId].size === 0) {
                delete userSocketMap[userId];
                delete userVisibilityMap[userId];
            }
        }
        broadcastOnlineUsers();

        // 1-on-1 direct calls cleanup: if user was in direct call, cancel it!
        for (const [key, call] of directCalls.entries()) {
            if (call.users.includes(userId)) {
                directCalls.delete(key);
                const otherUserId = call.users.find(u => u !== userId);
                if (otherUserId) {
                    io.to(otherUserId).emit("endCall");
                }
            }
        }

        // Group call cleanup: if this socket was participating in any active group call, leave gracefully!
        for (const [convoId, call] of activeGroupCalls.entries()) {
            if (call.participants.has(socket.id)) {
                await leaveParticipantFromGroupCall(convoId, socket, "disconnect");
            }
        }
    });
});

export { app, io, server };
