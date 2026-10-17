import api from '../lib/axios.js'


export const chatService = {
    async updateGroup(id, data) {
        return (await api.patch(`/api/conversations/${id}/group`, data)).data;
    },
    async removeGroupMember(id, memberId) {
        return (await api.delete(`/api/conversations/${id}/members/${memberId}`)).data;
    },
    async deleteGroup(id) {
        return (await api.delete(`/api/conversations/${id}/group`)).data;
    },
    async getGroupInvite(id) {
        return (await api.get(`/api/conversations/${id}/invite`)).data;
    },
    async rotateGroupInvite(id) {
        return (await api.post(`/api/conversations/${id}/invite`)).data;
    },
    async previewGroupInvite(token) {
        return (await api.get(`/api/conversations/invites/${encodeURIComponent(token)}`)).data;
    },
    async joinGroupInvite(token) {
        return (await api.post(`/api/conversations/invites/${encodeURIComponent(token)}/join`)).data;
    },
    async fetchConversations() {
        const res = await api.get("/api/conversations");
        return res.data;
    },
    async fetchMessage(id, cursor, limit = 20) {
        const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const res = await api.get(`/api/conversations/${id}/messages?limit=${limit}${cursorParam}`);
        return {messages: res.data.messages, cursor: res.data.nextCursor};
    },
    async sendDirectMessage(recipientId, content, conversationId, image, file, type) {

        const res = await api.post(`/api/messages/direct`, {
            recipientId,
            content,
            conversationId,
            image,
            file,
            type
        });
        return res.data;
    } ,
    async sendGroupMessage(conversationId, content, image, file, type) {

        const res = await api.post(`/api/messages/group`, {
            conversationId, content, image, file, type
        });
        return res.data;
    } ,
    async createConversation(isGroup, name, memberIds, recipientId) {
        const res = await api.post(`/api/conversations/`, {
            isGroup, name, memberIds, recipientId
        });
        return res.data;
    },
    async reactToMessage(messageId, reaction) {
        const res = await api.post(`/api/messages/reaction`, {
            messageId, reaction
        })
        return res.data;
    },
    async getSharedMedia(conversationId) {
        const res = await api.get(`/api/conversations/${conversationId}/media`);
        return res.data;
    },
    async markAsRead(conversationId) {
        const res = await api.patch(`/api/conversations/${conversationId}/read`);
        return res.data;
    },
    async recallMessage(id) {
        const res = await api.put(`/api/messages/${id}/recall`);
        return res.data;
    },
    async deleteMessageForMe(id) {
        const res = await api.put(`/api/messages/${id}/delete-for-me`);
        return res.data;
    },
    async togglePinMessage(id) {
        const res = await api.put(`/api/messages/${id}/pin`);
        return res.data;
    },
    async forwardMessage(id, targetConversationIds) {
        const res = await api.post(`/api/messages/${id}/forward`, { targetConversationIds });
        return res.data;
    },
    async getPinnedMessages(conversationId) {
        const res = await api.get(`/api/conversations/${conversationId}/pins`);
        return res.data;
    },
    async addMembers(conversationId, memberIds) {
        const res = await api.post(`/api/conversations/${conversationId}/members`, { memberIds });
        return res.data;
    },
    async removeMember(conversationId, memberId) {
        const res = await api.delete(`/api/conversations/${conversationId}/members/${memberId}`);
        return res.data;
    },
    async updateMemberRole(conversationId, memberId, role) {
        const res = await api.patch(`/api/conversations/${conversationId}/members/${memberId}/role`, { role });
        return res.data;
    },
    async leaveGroup(conversationId) {
        const res = await api.post(`/api/conversations/${conversationId}/leave`);
        return res.data;
    },
    async disbandGroup(conversationId) {
        const res = await api.delete(`/api/conversations/${conversationId}`);
        return res.data;
    },
    async joinGroupByInvite(inviteCode) {
        const res = await api.post(`/api/conversations/join/${encodeURIComponent(inviteCode)}`);
        return res.data;
    },
    async createPoll(conversationId, question, options, allowMultiple) {
        const res = await api.post(`/api/messages/poll`, { conversationId, question, options, allowMultiple });
        return res.data;
    },
    async votePoll(messageId, optionId) {
        const res = await api.post(`/api/messages/${messageId}/vote`, { optionId });
        return res.data;
    },
    async closePoll(messageId) {
        const res = await api.put(`/api/messages/${messageId}/poll/close`);
        return res.data;
    }
}
