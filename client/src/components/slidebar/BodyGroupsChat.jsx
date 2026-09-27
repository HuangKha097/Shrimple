import GroupChatCard from '../chat/GroupChatCard.jsx';

export default function BodyGroupsChat({ convo }) {
    const groupConversations = convo.filter((conversation) => conversation.isGroup);

    if (groupConversations.length === 0) {
        return <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>No group yet!</div>;
    }

    return groupConversations.map((conversation) => (
        <GroupChatCard key={conversation._id} props={conversation} />
    ));
}
