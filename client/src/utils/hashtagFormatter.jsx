import { useChatStore } from "../stores/useChatStore.js";
import { useAuthStore } from "../stores/useAuthStore.js";

/**
 * Resolve a username (without @) to a user object from friends or conversation participants
 */
export const resolveUserByUsername = (username) => {
    if (!username) return null;
    const lower = username.toLowerCase();

    const currentUser = useAuthStore.getState().user;
    if (currentUser?.username?.toLowerCase() === lower) {
        return currentUser;
    }

    const { friends = [], conversations = [] } = useChatStore.getState();
    const matchedFriend = friends.find(
        (f) => f?.username?.toLowerCase() === lower
    );
    if (matchedFriend?._id) return matchedFriend;

    for (const convo of conversations) {
        const parts = convo?.participants || [];
        for (const p of parts) {
            const u = p?.userId || p;
            if (u?.username?.toLowerCase() === lower && u?._id) {
                return u;
            }
        }
    }
    return null;
};

/**
 * Format text content containing #hashtags, @mentions (@everyone & @username), and URLs into clickable elements
 * @param {string} text - Raw post, comment, or chat message text
 * @param {function} onHashtagClick - Optional handler when hashtag is clicked, receives (tagWithoutHash)
 * @param {function} onMentionClick - Optional handler when @mention is clicked, receives (usernameWithoutAt, resolvedUser)
 * @param {object} options - Optional styling options (e.g., { isOwnMessage: false })
 * @returns {React.ReactNode}
 */
export const formatHashtags = (text, onHashtagClick, onMentionClick, options = {}) => {
    if (!text || typeof text !== "string") return text || "";

    const currentUsername = useAuthStore.getState().user?.username?.toLowerCase();
    const { isOwnMessage = false } = options;

    // Regex matching URLs, #hashtags (with VN unicode), and @mentions
    const tokenRegex = /(https?:\/\/[^\s]+)|#([A-Za-z0-9_À-ỹ]+)|@([A-Za-z0-9_À-ỹ.]+)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }

        const [fullMatch, urlMatch, hashtagMatch, mentionMatch] = match;

        if (urlMatch) {
            parts.push(
                <a
                    key={`url-${match.index}`}
                    href={urlMatch}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: isOwnMessage ? "#ffffff" : "var(--primary-color, #f97316)",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                        fontWeight: 600,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {urlMatch}
                </a>
            );
        } else if (hashtagMatch) {
            parts.push(
                <span
                    key={`hashtag-${match.index}`}
                    style={{
                        color: isOwnMessage ? "#fde047" : "var(--primary-color, #f97316)",
                        cursor: "pointer",
                        fontWeight: 600,
                        textDecoration: "none",
                    }}
                    className="hashtag-link"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onHashtagClick) {
                            onHashtagClick(hashtagMatch);
                        } else {
                            window.location.href = `/feed/search?q=${encodeURIComponent("#" + hashtagMatch)}`;
                        }
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.textDecoration = "none";
                    }}
                >
                    {fullMatch}
                </span>
            );
        } else if (mentionMatch) {
            const lowerMention = mentionMatch.toLowerCase();
            const isEveryone = lowerMention === "everyone" || lowerMention === "all";
            const isMe = currentUsername && lowerMention === currentUsername;

            parts.push(
                <span
                    key={`mention-${match.index}`}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: isEveryone || isMe ? "1px 7px" : "0 4px",
                        margin: "0 1px",
                        borderRadius: "6px",
                        backgroundColor: isEveryone
                            ? isOwnMessage
                                ? "rgba(255, 255, 255, 0.24)"
                                : "rgba(249, 115, 22, 0.22)"
                            : isMe
                            ? isOwnMessage
                                ? "rgba(255, 255, 255, 0.24)"
                                : "rgba(250, 204, 21, 0.2)"
                            : isOwnMessage
                            ? "rgba(255, 255, 255, 0.16)"
                            : "rgba(249, 115, 22, 0.12)",
                        border: isEveryone
                            ? isOwnMessage
                                ? "1px solid rgba(255, 255, 255, 0.45)"
                                : "1px solid rgba(249, 115, 22, 0.45)"
                            : isMe
                            ? "1px solid rgba(250, 204, 21, 0.45)"
                            : "none",
                        color: isOwnMessage
                            ? "#ffffff"
                            : isEveryone
                            ? "#fb923c"
                            : isMe
                            ? "#fde047"
                            : "var(--primary-color, #f97316)",
                        cursor: isEveryone ? "default" : "pointer",
                        fontWeight: 700,
                        textDecoration: "none",
                        transition: "all 0.15s ease",
                    }}
                    className="mention-link"
                    title={
                        isEveryone
                            ? "Nhắc tất cả mọi người"
                            : `Xem trang cá nhân của @${mentionMatch}`
                    }
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isEveryone) return;
                        const resolvedUser = resolveUserByUsername(mentionMatch);
                        if (onMentionClick) {
                            onMentionClick(mentionMatch, resolvedUser);
                        } else if (resolvedUser?._id) {
                            window.location.href = `/feed/profile/${resolvedUser._id}`;
                        } else {
                            window.location.href = `/feed/search?q=${encodeURIComponent("@" + mentionMatch)}`;
                        }
                    }}
                >
                    {fullMatch}
                </span>
            );
        }

        lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts;
};

export default formatHashtags;
