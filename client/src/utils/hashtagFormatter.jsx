import React from "react";

/**
 * Format text content containing #hashtags, @mentions, and URLs into clickable elements
 * @param {string} text - Raw post or comment text
 * @param {function} onHashtagClick - Optional handler when hashtag is clicked, receives (tagWithoutHash)
 * @param {function} onMentionClick - Optional handler when @mention is clicked, receives (usernameWithoutAt)
 * @returns {React.ReactNode}
 */
export const formatHashtags = (text, onHashtagClick, onMentionClick) => {
    if (!text || typeof text !== "string") return text || "";

    // Regex matching URLs, #hashtags (with VN unicode), and @mentions
    const tokenRegex = /(https?:\/\/[^\s]+)|#([A-Za-z0-9_À-ỹ]+)|@([A-Za-z0-9_]+)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
        // Plain text before token
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }

        const [fullMatch, urlMatch, hashtagMatch, mentionMatch] = match;

        if (urlMatch) {
            // URL Link
            parts.push(
                <a
                    key={`url-${match.index}`}
                    href={urlMatch}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: "var(--primary-color, #f97316)",
                        textDecoration: "underline",
                        wordBreak: "break-all"
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {urlMatch}
                </a>
            );
        } else if (hashtagMatch) {
            // Hashtag
            parts.push(
                <span
                    key={`hashtag-${match.index}`}
                    style={{
                        color: "var(--primary-color, #f97316)",
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
                            window.location.href = `/feed/search?q=${encodeURIComponent('#' + hashtagMatch)}`;
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
            // Mention
            parts.push(
                <span
                    key={`mention-${match.index}`}
                    style={{
                        color: "var(--primary-color, #f97316)",
                        cursor: "pointer",
                        fontWeight: 600,
                        textDecoration: "none",
                    }}
                    className="mention-link"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onMentionClick) {
                            onMentionClick(mentionMatch);
                        } else {
                            window.location.href = `/feed/search?q=${encodeURIComponent('@' + mentionMatch)}`;
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
        }

        lastIndex = tokenRegex.lastIndex;
    }

    // Remaining text
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return parts;
};

export default formatHashtags;
