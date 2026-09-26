import React from 'react';
import ChatCard from "../chat/ChatCard.jsx";
import {useChatStore} from "../../stores/useChatStore.js";

const BodyFriendsChat = ({convo}) => {
    const {user, activeConversationId} = useChatStore();

    // if (!user) return null;

    const friendConversations = convo.filter(c => !c.isGroup);

    if (friendConversations.length === 0) {
        return <div style={{padding: 20, textAlign: 'center', color: '#888'}}>No friend yet!</div>;
    }

    return (
        <div className="chat-list">
            {convo.length > 0 &&convo.map((c) =>
                <ChatCard
                    key={c._id}
                    props={c}
                />
            )}

        </div>
    );
};

export default BodyFriendsChat;