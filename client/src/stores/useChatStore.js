import {create} from "zustand";
import {persist} from "zustand/middleware";
import {chatService} from "../services/chatService.js";
import {friendService} from "../services/friendService.js";
import {useAuthStore} from "./useAuthStore.js"; // 1. Import thêm service


export const useChatStore = create(
    persist(
        (set, get) => ({

            conversations: [],
            messages: {},
            pinnedMessages: {},
            pinnedMessagesLoading: false,
            activeConversationId: null,
            loading: false, // convo loading
            messageLoading: false,
            isCreatingGroup: false,
            activeReactionMessageId: null,
            setActiveReactionMessageId: (id) => set({ activeReactionMessageId: id }),

            friends: [],
            friendRequests: [],
            suggestedFriends: [],
            isFriendRequestsLoading: false,

            setActiveConversationId: (id) => {
                set({activeConversationId: id});
                if (id) {
                    get().markAsReadAction(id);
                }
            },

            reset: () => {
                set({
                    conversations: [],
                    messages: {},
                    pinnedMessages: {},
                    pinnedMessagesLoading: false,
                    activeConversationId: null,
                    activeReactionMessageId: null,
                    loading: false,
                    messageLoading: false,

                    friendRequests: [],
                    isFriendRequestsLoading: false,
                });
            },

            fetchConversations: async () => {
                try {

                    const {conversations} = await chatService.fetchConversations();
                    set({
                        conversations: conversations,
                        loading: false
                    });

                } catch (error) {
                    console.error("Error during fetching conversations", error);
                    set({loading: false});
                }
            },
            fetchFriendRequests: async () => {
                try {
                    set({isFriendRequestsLoading: true});

                    const data = await friendService.getFriendRequests();

                    set({

                        friendRequests: data.received || [],
                        isFriendRequestsLoading: false
                    });
                } catch (error) {
                    console.error("Error fetching friend requests:", error);
                    set({
                        friendRequests: [],
                        isFriendRequestsLoading: false
                    });
                }
            },
            declineRequestAction: async (requestId) => {
                try {

                    await friendService.declineRequest(requestId);
                    set((state) => ({
                        friendRequests: state.friendRequests.filter((req) => req._id !== requestId)
                    }));
                    return true;
                } catch (error) {
                    console.error("Error declining request:", error);
                    throw error;
                }
            },
            acceptRequestAction: async (requestId) => {
                try {
                    await friendService.acceptRequest(requestId);

                    set((state) => {
                        // 1. Remove from friendRequests 
                        const newRequests = state.friendRequests.filter((req) => req._id !== requestId);
                        
                        // 2. Optionally fetch friends to update list, or we could optimistic update if we had user data
                        // For now, just firing fetchFriends in background is safe enough without reloading app
                        get().fetchFriends(); 
                        
                        return { friendRequests: newRequests };
                    });
                    
                    return true;
                } catch (error) {
                    console.error("Error accepting request:", error);
                    throw error;
                }
            },
            fetchFriends: async () => {
                try {
                    const data = await friendService.getFriends();
                    // API trả về { friends: [...] }
                    set({friends: data.friends || []});
                } catch (error) {
                    console.error("Error fetching friends:", error);
                    set({friends: []});
                }
            },
            fetchSuggestedFriends: async () => {
                try {
                    const data = await friendService.getSuggestedFriends();
                    set({suggestedFriends: data || []});
                } catch (error) {
                    console.error("Error fetching suggested friends:", error);
                    set({suggestedFriends: []});
                }
            },
            unfriendAction: async (friendId) => {
                try {
                    await friendService.unfriend(friendId);
                    set((state) => ({
                         friends: state.friends.filter(f => f._id !== friendId)
                    }));
                } catch (error) {
                    console.error("Error unfriending user:", error);
                    throw error;
                }
            },

            sendRequestAction: async (targetUserId) => {
                try {
                    await friendService.sendRequest(targetUserId);
                    // Optionally update state if needed, e.g. add to sent requests list
                     set((state) => ({
                         // Maybe track sent requests ID to disable button
                     }));
                } catch (error) {
                    console.error("Error sending friend request:", error);
                    throw error;
                }
            },

            removeFriendRequest: (requestId) => {
                set((state) => ({
                    friendRequests: state.friendRequests.filter((req) => req._id !== requestId)
                }));
            },
            getOrCreateConversation: async (partnerId) => {
                if (!partnerId) return null;
                const { conversations } = get();
                const existing = (conversations || []).find(c =>
                    !c.isGroup && Array.isArray(c.participants) && c.participants.some(p => {
                        const pId = p?._id || (typeof p?.userId === 'object' ? p?.userId?._id : p?.userId);
                        return pId && pId.toString() === partnerId.toString();
                    })
                );
                if (existing) {
                    return existing;
                }

                try {
                    const res = await chatService.createConversation(false, null, [partnerId], partnerId);
                    const newConvo = res.conversation || res;
                    if (newConvo && newConvo._id) {
                        set((state) => {
                            const exists = state.conversations.some(c => c._id === newConvo._id);
                            return {
                                conversations: exists ? state.conversations : [newConvo, ...state.conversations]
                            };
                        });
                    }
                    return newConvo;
                } catch (err) {
                    console.error("Error in getOrCreateConversation:", err);
                    throw err;
                }
            },

            fetchMessages: async (conversationId) => {
                const {activeConversationId, messages} = get();
                const {user} = useAuthStore.getState();

                const convoId = conversationId ?? activeConversationId;
                if (!convoId) return;

                const current = messages?.[convoId];
                const nextCursor = current?.nextCursor === undefined ? "" : current?.nextCursor;

                if (nextCursor === null) return;

                set({messageLoading: true});

                try {
                    const {messages: fetched, cursor} = await chatService.fetchMessage(convoId, nextCursor);

                    const processed = fetched.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id,
                    }));

                    set((state) => {
                        const prevItems = state.messages[convoId]?.items ?? [];
                        
                        // Lọc bỏ tin nhắn đã tồn tại để tránh trùng key
                        const newItems = processed.filter(
                            (newItem) => !prevItems.some((prevItem) => prevItem._id === newItem._id)
                        );

                        const merged = [...newItems, ...prevItems];

                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: {
                                    items: merged,
                                    hasMore: !!cursor,
                                    nextCursor: cursor ?? null,
                                }
                            }
                        };
                    });
                } catch (error) {
                    console.error("Error fetching messages:", error);
                } finally {
                    set({messageLoading: false});
                }
            },

            sendDirectMessage: async (recipientId, content, conversationId, image, file, type) => {
                const { user } = useAuthStore.getState();
                const { activeConversationId } = get();

                const targetConvoId = conversationId || activeConversationId;

                try {
                    // 1. Gọi API
                    const response = await chatService.sendDirectMessage(recipientId, content, targetConvoId, image, file, type);
                    const newMessage = response.message;

                    // 2. Xác định ID cuộc trò chuyện thực sự sau khi server trả về
                    const realConversationId = newMessage.conversationId;

                    // 3. Xử lý tin nhắn mới (Thêm isOwn = true vì mình vừa gửi)
                    const processedMessage = {
                        ...newMessage,
                        isOwn: true,
                        senderId: user?._id
                    };

                    set((state) => {
                        // A. Cập nhật Messages State
                        const existingMessages = state.messages[realConversationId]?.items || [];
                        const updatedMessages = [...existingMessages, processedMessage];

                        // B. Cập nhật Conversations State (Danh sách bên trái)
                        let updatedConversations = [...state.conversations];
                        const convoIndex = updatedConversations.findIndex(c => c._id === realConversationId);

                        if (convoIndex !== -1) {
                            const updatedConvo = {
                                ...updatedConversations[convoIndex],
                                lastMessage: {
                                    _id: processedMessage._id,
                                    content: processedMessage.content,
                                    createdAt: processedMessage.createdAt,
                                    senderId: user?._id,
                                    messageType: processedMessage.messageType,
                                    isRecalled: processedMessage.isRecalled || false
                                },
                                updatedAt: new Date().toISOString(),
                                lastMessageAt: new Date().toISOString()
                            };

                            updatedConversations.splice(convoIndex, 1);
                            updatedConversations.unshift(updatedConvo);

                            return {
                                messages: {
                                    ...state.messages,
                                    [realConversationId]: {
                                        ...state.messages[realConversationId],
                                        items: updatedMessages
                                    }
                                },
                                conversations: updatedConversations,
                                activeConversationId: realConversationId
                            };
                        } else {
                            get().fetchConversations();

                            return {
                                messages: {
                                    ...state.messages,
                                    [realConversationId]: { items: [processedMessage], hasMore: false, nextCursor: null }
                                },
                                activeConversationId: realConversationId
                            };
                        }
                    });

                    return newMessage;
                } catch (error) {
                    console.error("Failed to send message:", error);
                    throw error;
                }
            },
            createConversation: async (isGroup, name, memberIds, recipientId) => {
                set({ isCreatingGroup: true });
                try {
                    const response = await chatService.createConversation(isGroup, name, memberIds, recipientId);
                    const newConversation = response.conversation || response;

                    set((state) => ({
                        conversations: [
                            newConversation,
                            ...state.conversations.filter(c => c._id !== newConversation._id)
                        ],
                        activeConversationId: newConversation._id,
                        isCreatingGroup: false
                    }));

                    return newConversation;
                } catch (error) {
                    console.error("Error creating conversation:", error);
                    set({ isCreatingGroup: false });
                    throw error;
                }
            },
            sendGroupMessage: async (conversationId, content, image, file, type) => {
                const { user } = useAuthStore.getState();

                try {
                    // 1. Gọi API gửi tin nhắn nhóm
                    const response = await chatService.sendGroupMessage(conversationId, content, image, file, type);
                    const newMessage = response.message;

                    // 2. Tạo object tin nhắn để update UI ngay lập tức
                    const processedMessage = {
                        ...newMessage,
                        isOwn: true, // Đánh dấu là tin nhắn của mình
                        senderId: user?._id
                    };

                    set((state) => {
                        // A. Cập nhật danh sách Messages
                        const existingMessages = state.messages[conversationId]?.items || [];
                        const updatedMessages = [...existingMessages, processedMessage];

                        // B. Cập nhật danh sách Conversations (Đưa nhóm lên đầu)
                        let updatedConversations = [...state.conversations];
                        const convoIndex = updatedConversations.findIndex(c => c._id === conversationId);

                        if (convoIndex !== -1) {
                            const updatedConvo = {
                                ...updatedConversations[convoIndex],
                                lastMessage: {
                                    _id: processedMessage._id,
                                    content: processedMessage.content,
                                    createdAt: processedMessage.createdAt,
                                    senderId: user?._id,
                                    messageType: processedMessage.messageType || type || 'text',
                                    isRecalled: processedMessage.isRecalled || false
                                },
                                updatedAt: new Date().toISOString(),
                                lastMessageAt: new Date().toISOString()
                            };

                            // Xoá vị trí cũ, đưa lên đầu mảng
                            updatedConversations.splice(convoIndex, 1);
                            updatedConversations.unshift(updatedConvo);
                        }

                        return {
                            messages: {
                                ...state.messages,
                                [conversationId]: {
                                    ...state.messages[conversationId],
                                    items: updatedMessages
                                }
                            },
                            conversations: updatedConversations
                        };
                    });

                } catch (error) {
                    console.error("Failed to send group message:", error);
                    throw error;
                }
            },

            reactToMessageAction: async (messageId, reaction, conversationId) => {
                const { user } = useAuthStore.getState();
                const userId = user._id;

                // Optimistic Update
                set((state) => {
                    const existingMessages = state.messages[conversationId]?.items || [];
                    const msgIndex = existingMessages.findIndex(m => m._id === messageId);

                    if (msgIndex !== -1) {
                        const updatedMessages = [...existingMessages];
                        const currentMessage = updatedMessages[msgIndex];
                        const currentReactions = currentMessage.reactions ? [...currentMessage.reactions] : [];
                        
                        const existingReactionIndex = currentReactions.findIndex(r => {
                             const rUserId = typeof r.userId === 'object' ? r.userId._id : r.userId;
                             return rUserId.toString() === userId.toString();
                        });

                        if (existingReactionIndex !== -1) {
                            if (currentReactions[existingReactionIndex].reaction === reaction) {
                                // Remove
                                currentReactions.splice(existingReactionIndex, 1);
                            } else {
                                // Update
                                currentReactions[existingReactionIndex] = {
                                    ...currentReactions[existingReactionIndex],
                                    reaction
                                };
                            }
                        } else {
                            // Add
                            currentReactions.push({
                                userId: {
                                    _id: user._id, 
                                    displayName: user.displayName, 
                                    username: user.username
                                }, // Optimistically use full user object with name
                                reaction
                            });
                        }

                        updatedMessages[msgIndex] = {
                            ...currentMessage,
                            reactions: currentReactions
                        };

                        return {
                            messages: {
                                ...state.messages,
                                [conversationId]: {
                                    ...state.messages[conversationId],
                                    items: updatedMessages
                                }
                            }
                        };
                    }
                    return state;
                });

                try {
                    // API Call
                    const { reactions } = await chatService.reactToMessage(messageId, reaction);
                    
                    // Server returns standard data, update again to ensure consistency (e.g. timestamps, etc)
                     set((state) => {
                         const existingMessages = state.messages[conversationId]?.items || [];
                         const msgIndex = existingMessages.findIndex(m => m._id === messageId);
                         
                         if (msgIndex !== -1) {
                             const updatedMessages = [...existingMessages];
                             updatedMessages[msgIndex] = {
                                 ...updatedMessages[msgIndex],
                                 reactions
                             };

                             return {
                                 messages: {
                                     ...state.messages,
                                     [conversationId]: {
                                         ...state.messages[conversationId],
                                         items: updatedMessages
                                     }
                                 }
                             };
                         }
                         return state;
                     });

                } catch (error) {
                    console.error("Failed to react to message:", error);
                    // Revert or fetch messages again could be done here
                }
            },
            
            markAsReadAction: async (conversationId) => {
                const { user } = useAuthStore.getState();
                try {
                    // 1. Optimistic Update
                    set((state) => {
                         const convoIndex = state.conversations.findIndex(c => c._id === conversationId);
                         if (convoIndex !== -1) {
                             const updatedConversations = [...state.conversations];
                             
                             // Reset unread count logic
                             // Need to handle both Map and plain object structure just in case
                             // Mongoose Maps often come as objects in JSON unless strictly typed
                             
                             // Simple approach: Just assume we receive an object map { userId: count, ... } from backend
                             // But here we might just want to set the whole unreadCounts object/map for 'me' to 0
                             
                             const currentUnread = updatedConversations[convoIndex].unreadCounts || {};
                             
                             // If it's a Map in local state (unlikely from JSON), convert or set.
                             // Safest: clone object and set logic
                             
                             // However, since we track simple unread counts mostly effectively by just resetting:
                             // Let's assume we refresh the conversation or just set it to 0 for current user locally.
                             
                             // But wait, the UI uses `unreadCounts` which might be the number itself or the map.
                             // Let's check how UI renders unread count.
                             
                             // Looking at socket logic (line 500):
                             // unreadCounts: isActive ? ... : unreadCounts + 1
                             // It implies unreadCounts MIGHT be a number in the socket update logic? 
                             // Wait, line 498 checks `updatedConversations[conversationIndex].unreadCounts instanceof Map`
                             
                             // Let's fix the structure to be consistent. 
                             // Backend sends unreadCounts as Map-like object { "userId": 5 }.
                             
                             // If we want to reset for ME:
                             let newUnreadCounts = updatedConversations[convoIndex].unreadCounts;
                             if (newUnreadCounts && typeof newUnreadCounts === 'object') {
                                 newUnreadCounts = { ...newUnreadCounts, [user._id]: 0 };
                             } else {
                                 // Fallback if it was somehow a number? Or init it
                                 newUnreadCounts = { [user._id]: 0 };
                             }

                             updatedConversations[convoIndex] = {
                                 ...updatedConversations[convoIndex],
                                 unreadCounts: newUnreadCounts
                             };

                             return { conversations: updatedConversations };
                         }
                         return {};
                    });

                    // 2. Call API
                    await chatService.markAsRead(conversationId);
                    
                } catch (error) {
                    console.error("Failed to mark as read:", error);
                }
            },

            fetchPinnedMessages: async (conversationId) => {
                const convoId = conversationId ?? get().activeConversationId;
                if (!convoId) return;

                set({ pinnedMessagesLoading: true });
                try {
                    const data = await chatService.getPinnedMessages(convoId);
                    set((state) => ({
                        pinnedMessages: {
                            ...state.pinnedMessages,
                            [convoId]: data.pinnedMessages || []
                        },
                        pinnedMessagesLoading: false
                    }));
                } catch (error) {
                    console.error("Failed to fetch pinned messages:", error);
                    set({ pinnedMessagesLoading: false });
                }
            },

            recallMessageAction: async (messageId) => {
                const convoId = get().activeConversationId;
                if (!convoId) return;

                // Optimistically update message state locally
                set((state) => {
                    const existingMessages = state.messages[convoId]?.items || [];
                    const msgIndex = existingMessages.findIndex(m => m._id === messageId);
                    let updatedMessagesMap = { ...state.messages };

                    if (msgIndex !== -1) {
                        const updatedItems = [...existingMessages];
                        updatedItems[msgIndex] = {
                            ...updatedItems[msgIndex],
                            isRecalled: true,
                            content: "Tin nhắn đã bị thu hồi",
                            messageType: "text",
                            imgUrl: undefined,
                            fileUrl: undefined,
                            reactions: []
                        };
                        updatedMessagesMap[convoId] = {
                            ...updatedMessagesMap[convoId],
                            items: updatedItems
                        };
                    }

                    // Also update lastMessage in conversations list
                    let updatedConversations = [...state.conversations];
                    const convoIndex = updatedConversations.findIndex(c => c._id === convoId);
                    if (convoIndex !== -1 && updatedConversations[convoIndex].lastMessage && updatedConversations[convoIndex].lastMessage._id === messageId) {
                        updatedConversations[convoIndex] = {
                            ...updatedConversations[convoIndex],
                            lastMessage: {
                                ...updatedConversations[convoIndex].lastMessage,
                                content: "Tin nhắn đã bị thu hồi",
                                messageType: "text",
                                isRecalled: true
                            }
                        };
                    }

                    return {
                        messages: updatedMessagesMap,
                        conversations: updatedConversations
                    };
                });

                try {
                    await chatService.recallMessage(messageId);
                } catch (error) {
                    console.error("Failed to recall message:", error);
                }
            },

            deleteMessageForMeAction: async (messageId) => {
                const convoId = get().activeConversationId;
                if (!convoId) return;

                // Optimistically remove from state
                set((state) => {
                    const existingMessages = state.messages[convoId]?.items || [];
                    const updatedItems = existingMessages.filter(m => m._id !== messageId);
                    
                    return {
                        messages: {
                            ...state.messages,
                            [convoId]: {
                                ...state.messages[convoId],
                                items: updatedItems
                            }
                        }
                    };
                });

                try {
                    await chatService.deleteMessageForMe(messageId);
                } catch (error) {
                    console.error("Failed to delete message for me:", error);
                }
            },

            togglePinMessageAction: async (messageId) => {
                const convoId = get().activeConversationId;
                if (!convoId) return;

                try {
                    const { updatedMessage } = await chatService.togglePinMessage(messageId);

                    set((state) => {
                        const existingMessages = state.messages[convoId]?.items || [];
                        const msgIndex = existingMessages.findIndex(m => m._id === messageId);
                        let updatedMessagesMap = { ...state.messages };

                        if (msgIndex !== -1) {
                            const updatedItems = [...existingMessages];
                            updatedItems[msgIndex] = {
                                ...updatedItems[msgIndex],
                                isPinned: updatedMessage.isPinned,
                                pinnedBy: updatedMessage.pinnedBy,
                                pinnedAt: updatedMessage.pinnedAt
                            };
                            updatedMessagesMap[convoId] = {
                                ...updatedMessagesMap[convoId],
                                items: updatedItems
                            };
                        }

                        return { messages: updatedMessagesMap };
                    });

                    // Refresh pinned messages list
                    get().fetchPinnedMessages(convoId);

                } catch (error) {
                    console.error("Failed to toggle pin status:", error);
                }
            },

            forwardMessageAction: async (messageId, targetConversationIds) => {
                try {
                    await chatService.forwardMessage(messageId, targetConversationIds);
                    // Refresh conversations list to update sidebar for active / other conversations
                    get().fetchConversations();
                } catch (error) {
                    console.error("Failed to forward message:", error);
                    throw error;
                }
            },

            addMembersAction: async (conversationId, memberIds) => {
                const data = await chatService.addMembers(conversationId, memberIds);
                if (data.conversation) {
                    set((state) => ({
                        conversations: state.conversations.map(c => c._id === conversationId ? data.conversation : c)
                    }));
                }
                return data;
            },

            removeMemberAction: async (conversationId, memberId) => {
                const data = await chatService.removeMember(conversationId, memberId);
                if (data.conversation) {
                    set((state) => ({
                        conversations: state.conversations.map(c => c._id === conversationId ? data.conversation : c)
                    }));
                }
                return data;
            },

            updateMemberRoleAction: async (conversationId, memberId, role) => {
                const data = await chatService.updateMemberRole(conversationId, memberId, role);
                if (data.conversation) {
                    set((state) => ({
                        conversations: state.conversations.map(c => c._id === conversationId ? data.conversation : c)
                    }));
                }
                return data;
            },

            leaveGroupAction: async (conversationId) => {
                await chatService.leaveGroup(conversationId);
                set((state) => ({
                    conversations: state.conversations.filter(c => c._id !== conversationId),
                    activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId
                }));
            },

            disbandGroupAction: async (conversationId) => {
                await chatService.disbandGroup(conversationId);
                set((state) => ({
                    conversations: state.conversations.filter(c => c._id !== conversationId),
                    activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId
                }));
            },

            createPollAction: async (conversationId, question, options, allowMultiple) => {
                const data = await chatService.createPoll(conversationId, question, options, allowMultiple);
                return data;
            },

            votePollAction: async (messageId, optionId) => {
                const data = await chatService.votePoll(messageId, optionId);
                return data;
            },

            closePollAction: async (messageId) => {
                const data = await chatService.closePoll(messageId);
                return data;
            },

            subscribeToMessages: () => {
                const { socket } = useAuthStore.getState();
                if (!socket) return;

                // Prevent duplicate listeners
                socket.off("newMessage");
                socket.off("messageUpdated");
                socket.off("messageReaction");
                socket.off("messageRecalled");
                socket.off("messagePinStatus");
                socket.off("newConversation");
                socket.off("conversationUpdated");
                socket.off("conversationRemoved");
                socket.off("groupDisbanded");
                socket.off("newFriendRequest");
                socket.off("friendRequestAccepted");
                socket.off("friendRequestDeclined");

                socket.on("newConversation", (convo) => {
                    if (!convo || !convo._id) return;
                    set((state) => {
                        const exists = state.conversations.some(c => c._id === convo._id);
                        if (exists) return state;
                        return {
                            conversations: [convo, ...state.conversations]
                        };
                    });
                });

                socket.on("newMessage", (newMessage) => {
                    const myId = useAuthStore.getState().user?._id?.toString();
                    const senderIdStr = (newMessage.senderId?._id || newMessage.senderId)?.toString();
                    const isOwn = senderIdStr === myId;

                    set((state) => {
                        const convoId = newMessage.conversationId;
                        const isActive = state.activeConversationId === convoId;

                        // 1. Update Messages
                        let updatedMessagesMap = { ...state.messages };
                        const existingItems = updatedMessagesMap[convoId]?.items || [];
                        const isDuplicate = existingItems.some(item => item._id === newMessage._id);

                        if (!isDuplicate) {
                            updatedMessagesMap[convoId] = {
                                ...(updatedMessagesMap[convoId] || { hasMore: false, nextCursor: null }),
                                items: [...existingItems, { ...newMessage, isOwn }]
                            };
                        }

                        // 2. Update Conversations List
                        const conversationIndex = state.conversations.findIndex(c => c._id === convoId);
                        let updatedConversations = [...state.conversations];

                        if (conversationIndex !== -1) {
                            const currentCounts = updatedConversations[conversationIndex].unreadCounts || {};
                            const currentVal = (typeof currentCounts === 'object' && myId) ? (currentCounts[myId] || 0) : 0;

                            const updatedConvo = {
                                ...updatedConversations[conversationIndex],
                                lastMessage: {
                                    _id: newMessage._id,
                                    content: newMessage.content,
                                    createdAt: newMessage.createdAt,
                                    senderId: newMessage.senderId,
                                    messageType: newMessage.messageType,
                                    isRecalled: newMessage.isRecalled || false
                                },
                                updatedAt: new Date().toISOString(),
                                lastMessageAt: new Date().toISOString(),
                                unreadCounts: isActive 
                                    ? updatedConversations[conversationIndex].unreadCounts 
                                    : (typeof currentCounts === 'object' && myId ? { ...currentCounts, [myId]: currentVal + 1 } : currentCounts)
                            };
                            updatedConversations.splice(conversationIndex, 1);
                            updatedConversations.unshift(updatedConvo);
                        } else {
                            setTimeout(() => get().fetchConversations(), 0);
                        }

                        return {
                            messages: updatedMessagesMap,
                            conversations: updatedConversations,
                            activeConversationId: state.activeConversationId
                        };
                    });

                    // Thông báo tin nhắn mới nếu không đang mở hội thoại này
                    const state = get();
                    const convoId = newMessage.conversationId;
                    const isActive = state.activeConversationId === convoId;
                    if (!isOwn && !isActive) {
                        toast.info("Tin nhắn mới: " + (newMessage.content || "Đã gửi một tệp/ảnh"));
                    }
                });

                socket.on("messageUpdated", (updatedMessage) => {
                    if (!updatedMessage?._id) return;
                    const myId = useAuthStore.getState().user?._id?.toString();
                    const senderIdStr = (updatedMessage.senderId?._id || updatedMessage.senderId)?.toString();
                    const isOwn = senderIdStr === myId;
                    const convoId = updatedMessage.conversationId;

                    set((state) => {
                        let updatedMessagesMap = { ...state.messages };
                        const existingItems = updatedMessagesMap[convoId]?.items || [];
                        const msgIndex = existingItems.findIndex(m => m._id === updatedMessage._id);

                        if (msgIndex !== -1) {
                            const newItems = [...existingItems];
                            newItems[msgIndex] = { ...updatedMessage, isOwn };
                            updatedMessagesMap[convoId] = {
                                ...updatedMessagesMap[convoId],
                                items: newItems
                            };
                        }

                        const updatedConvos = state.conversations.map(c => {
                            if (c._id === convoId && c.lastMessage?._id === updatedMessage._id) {
                                return {
                                    ...c,
                                    lastMessage: {
                                        ...c.lastMessage,
                                        content: updatedMessage.content,
                                        messageType: updatedMessage.messageType,
                                    }
                                };
                            }
                            return c;
                        });

                        return {
                            messages: updatedMessagesMap,
                            conversations: updatedConvos
                        };
                    });
                });

                socket.on("conversationUpdated", (updatedConvo) => {
                    if (!updatedConvo?._id) return;
                    set((state) => ({
                        conversations: state.conversations.map(c => c._id === updatedConvo._id ? updatedConvo : c)
                    }));
                });

                socket.on("conversationRemoved", ({ conversationId }) => {
                    if (!conversationId) return;
                    set((state) => ({
                        conversations: state.conversations.filter(c => c._id !== conversationId),
                        activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId
                    }));
                });

                socket.on("groupDisbanded", ({ conversationId, groupName }) => {
                    if (!conversationId) return;
                    toast.info(`Nhóm "${groupName || ""}" đã được giải tán bởi quản trị viên.`);
                    set((state) => ({
                        conversations: state.conversations.filter(c => c._id !== conversationId),
                        activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId
                    }));
                });

                socket.on("messageReaction", ({ messageId, reactions, conversationId }) => {
                    set((state) => {
                        const existingMessages = state.messages[conversationId]?.items || [];
                        const msgIndex = existingMessages.findIndex(m => m._id === messageId);

                        if (msgIndex !== -1) {
                            const updatedMessages = [...existingMessages];
                            updatedMessages[msgIndex] = {
                                ...updatedMessages[msgIndex],
                                reactions
                            };

                            return {
                                messages: {
                                    ...state.messages,
                                    [conversationId]: {
                                        ...state.messages[conversationId],
                                        items: updatedMessages
                                    }
                                }
                            };
                        }
                        return state;
                    });
                });

                socket.on("messageRecalled", ({ messageId, conversationId }) => {
                    set((state) => {
                        const existingMessages = state.messages[conversationId]?.items || [];
                        const msgIndex = existingMessages.findIndex(m => m._id === messageId);
                        let updatedMessagesMap = { ...state.messages };

                        if (msgIndex !== -1) {
                            const updatedItems = [...existingMessages];
                            updatedItems[msgIndex] = {
                                ...updatedItems[msgIndex],
                                isRecalled: true,
                                content: "Tin nhắn đã bị thu hồi",
                                messageType: "text",
                                imgUrl: undefined,
                                fileUrl: undefined,
                                reactions: []
                            };
                            updatedMessagesMap[conversationId] = {
                                ...updatedMessagesMap[conversationId],
                                items: updatedItems
                            };
                        }

                        let updatedConversations = [...state.conversations];
                        const convoIndex = updatedConversations.findIndex(c => c._id === conversationId);
                        if (convoIndex !== -1 && updatedConversations[convoIndex].lastMessage && updatedConversations[convoIndex].lastMessage._id === messageId) {
                            updatedConversations[convoIndex] = {
                                ...updatedConversations[convoIndex],
                                lastMessage: {
                                    ...updatedConversations[convoIndex].lastMessage,
                                    content: "Tin nhắn đã bị thu hồi",
                                    messageType: "text",
                                    isRecalled: true
                                }
                            };
                        }

                        return {
                            messages: updatedMessagesMap,
                            conversations: updatedConversations
                        };
                    });
                });

                socket.on("messagePinStatus", ({ messageId, conversationId, isPinned, pinnedMessage }) => {
                    set((state) => {
                        const existingMessages = state.messages[conversationId]?.items || [];
                        const msgIndex = existingMessages.findIndex(m => m._id === messageId);
                        let updatedMessagesMap = { ...state.messages };

                        if (msgIndex !== -1) {
                            const updatedItems = [...existingMessages];
                            updatedItems[msgIndex] = {
                                ...updatedItems[msgIndex],
                                isPinned,
                                pinnedBy: pinnedMessage?.pinnedBy,
                                pinnedAt: pinnedMessage?.pinnedAt
                            };
                            updatedMessagesMap[conversationId] = {
                                ...updatedMessagesMap[conversationId],
                                items: updatedItems
                            };
                        }

                        setTimeout(() => get().fetchPinnedMessages(conversationId), 0);

                        return { messages: updatedMessagesMap };
                    });
                });

                // --- REALTIME NOTIFICATIONS / FRIEND REQUESTS ---
                socket.on("newFriendRequest", (request) => {
                    if (!request) return;
                    set((state) => {
                        const existing = (state.friendRequests || []).filter(r => r._id !== request._id);
                        return {
                            friendRequests: [request, ...existing]
                        };
                    });

                    const sender = request.from || {};
                    const senderName = sender.displayName || sender.username || "Người dùng";
                    toast.info(`${senderName} đã gửi cho bạn một lời mời kết bạn!`);
                });

                socket.on("friendRequestAccepted", ({ friend, newFriend, requestId }) => {
                    const friendObj = newFriend || friend;
                    if (friendObj) {
                        set((state) => {
                            const friendId = friendObj._id?.toString();
                            const cleanRequests = (state.friendRequests || []).filter(r => 
                                r._id !== requestId && r.from?._id?.toString() !== friendId && r.from?.toString() !== friendId
                            );
                            const exists = (state.friends || []).some(f => f._id?.toString() === friendId);
                            const updatedFriends = exists ? state.friends : [friendObj, ...state.friends];
                            return {
                                friendRequests: cleanRequests,
                                friends: updatedFriends
                            };
                        });

                        setTimeout(() => {
                            get().fetchFriends();
                            get().fetchConversations();
                        }, 0);

                        toast.success(`${friendObj.displayName || friendObj.username || "Bạn bè"} đã chấp nhận lời mời kết bạn!`);
                    }
                });

                socket.on("friendRequestDeclined", ({ requestId }) => {
                    if (requestId) {
                        set((state) => ({
                            friendRequests: (state.friendRequests || []).filter(r => r._id !== requestId)
                        }));
                    }
                });
            },

            unsubscribeFromMessages: () => {
                const { socket } = useAuthStore.getState();
                if (socket) {
                    socket.off("newMessage");
                    socket.off("messageUpdated");
                    socket.off("messageReaction");
                    socket.off("messageRecalled");
                    socket.off("messagePinStatus");
                    socket.off("newConversation");
                    socket.off("conversationUpdated");
                    socket.off("conversationRemoved");
                    socket.off("groupDisbanded");
                    socket.off("newFriendRequest");
                    socket.off("friendRequestAccepted");
                    socket.off("friendRequestDeclined");
                }
            },

        }),

        {
            name: "chat-storage",
            partialize: (state) => ({
                conversations: state.conversations,
                friends: state.friends,
                friendRequests: state.friendRequests,
                activeConversationId: state.activeConversationId,
            }),
        }
    )
);