import React from 'react';
import ChatCard from "../chat/ChatCard.jsx";
import {useChatStore} from "../../stores/useChatStore.js";
import GroupChatCard from "../chat/GroupChatCard.jsx";

const BodyGroupsChat = ({convo}) => {
    const {user, activeConversationId} = useChatStore();
    const groupConversations = convo.filter(c => c.isGroup);
    console.log("cxcx", convo)
    if (groupConversations.length === 0) {
        return <div style={{padding: 20, textAlign: 'center', color: '#888'}}>No group yet!</div>;
    }

    return (
            <>
                {
                    convo?.length > 0 &&
                    convo?.map((convo) => {
                        return (
                            <GroupChatCard props={convo} key={convo._id}/>
                        )
                    })
                }

            </>
        );

    }
;

export default BodyGroupsChat;