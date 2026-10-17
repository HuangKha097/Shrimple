

import GroupChatCard from "../chat/GroupChatCard.jsx";

const BodyGroupsChat = ({convo}) => {
    const groupConversations = convo.filter(c => c.isGroup);
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
