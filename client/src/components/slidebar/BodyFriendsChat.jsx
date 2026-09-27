import ChatCard from '../chat/ChatCard.jsx';

export default function BodyFriendsChat({ convo }) {
    const friendConversations = convo.filter((conversation) => !conversation.isGroup);

    if (friendConversations.length === 0) {
        return <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>No friend yet!</div>;
    }

    return (
        <div className="chat-list">
            {friendConversations.map((conversation) => (
                <ChatCard key={conversation._id} props={conversation} />
            ))}
        </div>
    );
}
