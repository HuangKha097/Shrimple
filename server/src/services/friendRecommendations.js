import User from "../models/User.js";
import Friend from "../models/Friend.js";
import FriendRequest from "../models/FriendRequest.js";
import Conversation from "../models/Conversation.js";
import Post from "../models/Post.js";

const RESULT_LIMIT = 20;
const CANDIDATE_LIMIT = 400;
const PROFILE_POOL_LIMIT = 160;

const idOf = (value) => value?.toString();
const normalized = (value) => String(value || "").trim().toLocaleLowerCase("vi");

function addSignal(pool, userId, name, amount = 1) {
    const id = idOf(userId);
    if (!id) return;
    if (!pool.has(id)) {
        pool.set(id, { mutual: 0, groups: 0, likes: 0, comments: 0, profile: 0 });
    }
    pool.get(id)[name] += amount;
}

export function scoreFriendCandidate(viewer, candidate, signals = {}) {
    const sharedSchool = viewer.privacy?.showSchool !== false && candidate.privacy?.showSchool !== false &&
        normalized(viewer.school) && normalized(viewer.school) === normalized(candidate.school);
    const sharedWorkplace = viewer.privacy?.showWorkplace !== false && candidate.privacy?.showWorkplace !== false &&
        normalized(viewer.workplace) && normalized(viewer.workplace) === normalized(candidate.workplace);
    const sharedMajor = sharedSchool && normalized(viewer.major) && normalized(viewer.major) === normalized(candidate.major);
    const sharedCity = viewer.privacy?.showLocation !== false && candidate.privacy?.showLocation !== false &&
        normalized(viewer.location?.city) && normalized(viewer.location?.city) === normalized(candidate.location?.city) &&
        normalized(viewer.location?.country) === normalized(candidate.location?.country);
    const sharedProvince = !sharedCity && viewer.privacy?.showLocation !== false && candidate.privacy?.showLocation !== false &&
        normalized(viewer.location?.province) && normalized(viewer.location?.province) === normalized(candidate.location?.province) &&
        normalized(viewer.location?.country) === normalized(candidate.location?.country);

    const mutual = Math.max(0, signals.mutual || 0);
    const groups = Math.max(0, signals.groups || 0);
    const likes = Math.max(0, signals.likes || 0);
    const comments = Math.max(0, signals.comments || 0);
    // Saturation keeps one large group or a very active account from dominating the list.
    const score = Math.min(mutual, 5) * 12 + Math.log2(1 + mutual) * 4 +
        Math.min(groups, 2) * 10 + Math.min(likes, 3) * 4 + Math.min(comments, 3) * 9 +
        (sharedWorkplace ? 14 : 0) + (sharedSchool ? 12 : 0) +
        (sharedMajor ? 4 : 0) + (sharedCity ? 6 : sharedProvince ? 3 : 0);

    let suggestionReason = "Khám phá cộng đồng";
    if (mutual) suggestionReason = `${mutual} bạn chung`;
    else if (comments || likes) suggestionReason = "Từng tương tác bài viết";
    else if (groups) suggestionReason = "Cùng nhóm trò chuyện";
    else if (sharedWorkplace) suggestionReason = "Cùng nơi làm việc";
    else if (sharedSchool) suggestionReason = "Cùng trường";
    else if (sharedCity) suggestionReason = "Cùng thành phố";
    else if (sharedProvince) suggestionReason = "Cùng tỉnh/thành";

    return { score, mutualFriendCount: mutual, suggestionReason };
}

export async function getFriendRecommendations(userId) {
    const viewer = await User.findById(userId)
        .select("school major workplace location privacy blockedUsers")
        .lean();
    if (!viewer) return [];

    const [friendships, requests] = await Promise.all([
        Friend.find({ $or: [{ userA: userId }, { userB: userId }] })
            .select("userA userB").lean(),
        FriendRequest.find({ $or: [{ from: userId }, { to: userId }] })
            .select("from to").lean()
    ]);
    const myId = idOf(userId);
    const friendIds = friendships.map((edge) => idOf(edge.userA) === myId ? edge.userB : edge.userA);
    const excluded = new Set([myId, ...friendIds.map(idOf), ...(viewer.blockedUsers || []).map(idOf)]);
    for (const request of requests) {
        excluded.add(idOf(request.from) === myId ? idOf(request.to) : idOf(request.from));
    }

    const pool = new Map();
    const profileQueries = [];
    if (viewer.privacy?.showSchool !== false && normalized(viewer.school)) {
        profileQueries.push({ school: viewer.school, "privacy.showSchool": { $ne: false } });
    }
    if (viewer.privacy?.showWorkplace !== false && normalized(viewer.workplace)) {
        profileQueries.push({ workplace: viewer.workplace, "privacy.showWorkplace": { $ne: false } });
    }
    if (viewer.privacy?.showLocation !== false && normalized(viewer.location?.city)) {
        profileQueries.push({ "location.city": viewer.location.city, "location.country": viewer.location.country || "", "privacy.showLocation": { $ne: false } });
    } else if (viewer.privacy?.showLocation !== false && normalized(viewer.location?.province)) {
        profileQueries.push({ "location.province": viewer.location.province, "location.country": viewer.location.country || "", "privacy.showLocation": { $ne: false } });
    }

    const [secondDegree, groups, profileMatches, engagedPosts, myPosts] = await Promise.all([
        friendIds.length ? Friend.find({ $or: [
            { userA: { $in: friendIds.slice(0, 100) } },
            { userB: { $in: friendIds.slice(0, 100) } }
        ] }).select("userA userB").limit(1200).lean() : [],
        Conversation.find({ isGroup: true, "participants.userId": userId })
            .select("participants.userId").limit(25).lean(),
        profileQueries.length ? User.find({ $or: profileQueries })
            .collation({ locale: "vi", strength: 2 })
            .select("_id").limit(PROFILE_POOL_LIMIT).lean() : [],
        Post.find({ privacy: "public", $or: [
            { likes: userId }, { "comments.postedBy": userId }
        ] }).select("author likes comments.postedBy").sort({ createdAt: -1 }).limit(60).lean(),
        Post.find({ author: userId, privacy: "public" })
            .select("likes comments.postedBy").sort({ createdAt: -1 }).limit(30).lean()
    ]);

    const friendSet = new Set(friendIds.map(idOf));
    for (const edge of secondDegree) {
        const a = idOf(edge.userA);
        const b = idOf(edge.userB);
        if (friendSet.has(a) && !excluded.has(b)) addSignal(pool, b, "mutual");
        if (friendSet.has(b) && !excluded.has(a)) addSignal(pool, a, "mutual");
    }
    for (const group of groups) {
        for (const participant of (group.participants || []).slice(0, 100)) {
            if (!excluded.has(idOf(participant.userId))) addSignal(pool, participant.userId, "groups");
        }
    }
    for (const user of profileMatches) {
        if (!excluded.has(idOf(user._id))) addSignal(pool, user._id, "profile");
    }
    for (const post of engagedPosts) {
        const author = idOf(post.author);
        if (excluded.has(author)) continue;
        if (post.likes?.some((id) => idOf(id) === myId)) addSignal(pool, author, "likes");
        if (post.comments?.some((comment) => idOf(comment.postedBy) === myId)) addSignal(pool, author, "comments");
    }
    for (const post of myPosts) {
        for (const liker of (post.likes || []).slice(0, 100)) {
            if (!excluded.has(idOf(liker))) addSignal(pool, liker, "likes");
        }
        for (const comment of (post.comments || []).slice(0, 100)) {
            if (!excluded.has(idOf(comment.postedBy))) addSignal(pool, comment.postedBy, "comments");
        }
    }

    // Keep a bounded ranking set while preserving candidates from every source.
    const candidateIds = [...pool.entries()]
        .sort((a, b) => {
            const preliminary = (signal) => signal.mutual * 12 + signal.groups * 10 +
                signal.likes * 4 + signal.comments * 9 + signal.profile * 8;
            return preliminary(b[1]) - preliminary(a[1]) || a[0].localeCompare(b[0]);
        })
        .slice(0, CANDIDATE_LIMIT)
        .map(([id]) => id);

    const candidates = await User.find({
        _id: { $in: candidateIds, $nin: [...excluded] },
        username: { $exists: true, $ne: "" },
        blockedUsers: { $ne: userId }
    }).select("_id displayName avatarURL username school major workplace location privacy").lean();

    const toRecommendation = (candidate) => {
        const { score, mutualFriendCount, suggestionReason } = scoreFriendCandidate(viewer, candidate, pool.get(idOf(candidate._id)));
        return {
            _id: candidate._id,
            displayName: candidate.displayName,
            avatarURL: candidate.avatarURL,
            username: candidate.username,
            mutualFriendCount,
            suggestionReason,
            score
        };
    };
    const ranked = candidates.map(toRecommendation);

    // Cold start: show other discoverable accounts when the graph and profile pools are sparse.
    if (ranked.length < RESULT_LIMIT) {
        const fallback = await User.find({
            _id: { $nin: [...excluded, ...candidateIds] },
            username: { $exists: true, $ne: "" },
            blockedUsers: { $ne: userId }
        }).select("_id displayName avatarURL username school major workplace location privacy")
            .sort({ _id: -1 }).limit(RESULT_LIMIT - ranked.length).lean();
        ranked.push(...fallback.map(toRecommendation));
    }

    return ranked.sort((a, b) => b.score - a.score || idOf(a._id).localeCompare(idOf(b._id)))
        .slice(0, RESULT_LIMIT)
        .map(({ score, ...candidate }) => candidate);
}
