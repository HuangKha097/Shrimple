import "dotenv/config";
import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { isConversationMember } from "../utils/conversationHelper.js";
import User from "../models/User.js";

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

io.use(async (socket, next) => {
    try {
        const decoded = jwt.verify(socket.handshake.auth?.token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decoded.userId).select('_id displayName username avatarURL');
        if (!user) return next(new Error('Người dùng không tồn tại'));
        socket.data.user = user;
        socket.data.userId = user._id.toString();
        return next();
    } catch {
        return next(new Error('Vui lòng đăng nhập để kết nối'));
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
        if (!await Conversation.exists({ _id: conversationId })) {
            if (call.callMessageId) await Message.deleteOne({ _id: call.callMessageId });
            return;
        }
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

export const removeUsersFromGroupCall = async (conversationId, userIds) => {
    const call = activeGroupCalls.get(conversationId);
    if (!call) return;
    for (const participant of [...call.participants.values()]) {
        if (!userIds.includes(participant.userId.toString())) continue;
        const socket = io.sockets.sockets.get(participant.socketId);
        if (socket) await leaveParticipantFromGroupCall(conversationId, socket, "removed");
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
    socket.on("joinGroupCall", async ({ conversationId, callId } = {}) => {
        let call;
        let pending = false;
        try {
            if (!mongoose.isObjectIdOrHexString(conversationId)) return;
            conversationId = new mongoose.Types.ObjectId(conversationId).toString();
            const conversation = await Conversation.findById(conversationId);
            if (!conversation?.isGroup || !isConversationMember(conversation, userId)) {
                socket.emit("groupCallError", { message: "Bạn không còn là thành viên của nhóm" });
                return;
            }
            const user = socket.data.user;
            call = activeGroupCalls.get(conversationId);
            if (callId && (!call || call.callId !== callId)) {
                socket.emit("groupCallError", { message: "Cuộc gọi này đã kết thúc." });
                return;
            }

            if (!call) {
                call = {
                    callId: new mongoose.Types.ObjectId().toString(),
                    conversationId,
                    startedBy: { _id: user._id, name: user.displayName || user.username || "User", avatar: user.avatarURL || "" },
                    startedAt: new Date(),
                    participants: new Map(),
                    callMessageId: null,
                    pendingJoins: 0,
                    announced: false,
                };
                activeGroupCalls.set(conversationId, call);
                // All concurrent joins await one initialization; no participant can terminate a half-created call.
                call.initialization = (async () => {
                    const message = await Message.create({
                        conversationId,
                        senderId: user._id,
                        content: "Cuộc gọi nhóm đã bắt đầu • " + formatCallTime(call.startedAt),
                        messageType: "group_call",
                        callId: call.callId,
                        callStatus: "active",
                        startedAt: call.startedAt,
                    });
                    call.callMessageId = message._id.toString();
                    const populatedMessage = await Message.findById(message._id)
                        .populate("senderId", "username displayName avatarURL");
                    const current = await Conversation.findById(conversationId);
                    if (!current || !populatedMessage) return;
                    upDateConversationAfterCreateMessage(current, populatedMessage, user._id);
                    await current.save();
                    call.message = populatedMessage;
                })();
            }

            call.pendingJoins += 1;
            pending = true;
            await call.initialization;

            // Async history creation may overlap removal, deletion, disconnect or call termination.
            // Keep this fresh check immediately adjacent to admission, with no await between them.
            const current = await Conversation.findById(conversationId);
            if (!current?.isGroup || !isConversationMember(current, userId)) {
                socket.emit("groupCallError", { message: "Bạn không còn là thành viên của nhóm" });
                return;
            }
            if (!socket.connected || activeGroupCalls.get(conversationId) !== call) {
                if (socket.connected) socket.emit("groupCallError", { message: "Cuộc gọi này đã kết thúc." });
                return;
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
            const existingParticipants = Array.from(call.participants.values()).filter(p => p.socketId !== socket.id);
            call.participants.set(socket.id, newParticipant);
            socket.join(`group-call-${conversationId}`);
            socket.emit("groupCallExistingUsers", { conversationId, participants: existingParticipants });
            socket.to(`group-call-${conversationId}`).emit("groupCallUserJoined", { conversationId, user: newParticipant });

            if (!call.announced) {
                call.announced = true;
                current.participants.forEach(p => {
                    const uid = (p.userId?._id || p.userId)?.toString();
                    if (!uid) return;
                    if (call.message) io.to(uid).emit("newMessage", call.message);
                    if (uid !== userId) io.to(uid).emit("incomingGroupCall", {
                        callId: call.callId,
                        conversationId,
                        caller: { _id: user._id, name: user.displayName || user.username || "Thành viên", avatar: user.avatarURL || "" },
                        groupInfo: { _id: current._id, name: current.group.name, avatarURL: current.group.avatarURL || "", participantsCount: current.participants.length },
                    });
                });
            }
            await broadcastGroupCallStatus(conversationId, formatCallPayload(conversationId, call));
        } catch (error) {
            console.error("Cannot join group call", error);
            socket.emit("groupCallError", { message: "Không thể tham gia cuộc gọi nhóm" });
        } finally {
            if (pending) {
                call.pendingJoins -= 1;
                if (call.pendingJoins === 0 && call.participants.size === 0 && activeGroupCalls.get(conversationId) === call) {
                    await terminateGroupCall(conversationId, socket, "cancelled");
                }
            }
        }
    });

    // 2. WebRTC Mesh Signaling (Offer / Answer / ICE)
    socket.on("groupCallSignal", ({ to, signal }) => {
        const sharedCall = [...activeGroupCalls.values()].some(call =>
            call.participants.has(socket.id) && call.participants.has(to));
        if (to && sharedCall) {
            io.to(to).emit("groupCallSignal", {
                signal,
                fromSocketId: socket.id,
                fromUser: {
                    _id: socket.data.user._id,
                    name: socket.data.user.displayName || socket.data.user.username,
                    avatar: socket.data.user.avatarURL,
                },
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
    socket.on("getGroupCallStatus", async ({ conversationId }, callback) => {
        let call;
        try {
            if (mongoose.isObjectIdOrHexString(conversationId)) {
                const conversation = await Conversation.findById(conversationId).select('participants');
                if (isConversationMember(conversation, userId)) call = activeGroupCalls.get(conversationId);
            }
        } catch (error) { console.error('Cannot read group call status', error); }
        const payload = formatCallPayload(conversationId, call);
        if (typeof callback === "function") {
            callback(payload);
        } else {
            socket.emit("groupCallStatusChanged", payload);
        }
    });

    // 6. Query All Active Group Calls
    socket.on("getAllActiveGroupCalls", async (callback) => {
        const allCalls = {};
        let allowedIds = new Set();
        try {
            const conversations = await Conversation.find({ _id: { $in: [...activeGroupCalls.keys()] }, 'participants.userId': userId }).select('_id');
            allowedIds = new Set(conversations.map(c => c._id.toString()));
        } catch (error) { console.error('Cannot read active group calls', error); }
        for (const [convoId, call] of activeGroupCalls.entries()) {
            if (!allowedIds.has(convoId)) continue;
            if (call.participants.size > 0) {
                allCalls[convoId] = formatCallPayload(convoId, call);
            }
        }
        if (typeof callback === "function") {
            callback(allCalls);
        } else {
            socket.emit("allActiveGroupCalls", allCalls);
        }
    });

    // --- 7. Instagram-Style Chat Screen Draw / Doodle Sync ---
    socket.on("getChatScreenDrawing", async ({ conversationId }, callback) => {
        try {
            if (!mongoose.isObjectIdOrHexString(conversationId)) return;
            const convo = await Conversation.findById(conversationId).select("participants");
            if (!isConversationMember(convo, userId)) return;

            const existing = global.__chatScreenDrawings?.get(conversationId) || {
                conversationId,
                strokes: [],
                updatedBy: null,
                updatedAt: null,
            };
            if (typeof callback === "function") {
                callback(existing);
            } else {
                socket.emit("chatScreenDrawingUpdated", existing);
            }
        } catch (err) {
            console.error("Error in getChatScreenDrawing:", err);
        }
    });

    socket.on("updateChatScreenDrawing", async ({ conversationId, strokes, authorName }) => {
        try {
            if (!mongoose.isObjectIdOrHexString(conversationId)) return;
            const convo = await Conversation.findById(conversationId).select("participants");
            if (!isConversationMember(convo, userId)) return;

            if (!global.__chatScreenDrawings) {
                global.__chatScreenDrawings = new Map();
            }

            const safeStrokes = Array.isArray(strokes) ? strokes.slice(-250) : [];
            const payload = {
                conversationId,
                strokes: safeStrokes,
                updatedBy: {
                    _id: userId,
                    name: authorName || socket.data?.user?.displayName || socket.data?.user?.username || "Thành viên",
                },
                updatedAt: new Date().toISOString(),
            };

            if (safeStrokes.length === 0) {
                global.__chatScreenDrawings.delete(conversationId);
            } else {
                global.__chatScreenDrawings.set(conversationId, payload);
            }

            (convo.participants || []).forEach((p) => {
                const uid = (p.userId?._id || p.userId)?.toString();
                if (uid) {
                    io.to(uid).emit("chatScreenDrawingUpdated", payload);
                }
            });
        } catch (err) {
            console.error("Error in updateChatScreenDrawing:", err);
        }
    });

    socket.on("clearChatScreenDrawing", async ({ conversationId, authorName }) => {
        try {
            if (!mongoose.isObjectIdOrHexString(conversationId)) return;
            const convo = await Conversation.findById(conversationId).select("participants");
            if (!isConversationMember(convo, userId)) return;

            if (global.__chatScreenDrawings) {
                global.__chatScreenDrawings.delete(conversationId);
            }

            const payload = {
                conversationId,
                strokes: [],
                updatedBy: null,
                clearedBy: authorName || socket.data?.user?.displayName || socket.data?.user?.username || "Thành viên",
                updatedAt: new Date().toISOString(),
            };

            (convo.participants || []).forEach((p) => {
                const uid = (p.userId?._id || p.userId)?.toString();
                if (uid) {
                    io.to(uid).emit("chatScreenDrawingUpdated", payload);
                }
            });
        } catch (err) {
            console.error("Error in clearChatScreenDrawing:", err);
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
