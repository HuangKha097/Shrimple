export const INTRUDER_DWELL_MS = 3000;
export const TRACK_MISSING_GRACE_MS = 500;
const TRACK_MATCH_RETENTION_MS = 4000;

const intersectionOverUnion = (left, right) => {
    const x1 = Math.max(left[0], right[0]);
    const y1 = Math.max(left[1], right[1]);
    const x2 = Math.min(left[0] + left[2], right[0] + right[2]);
    const y2 = Math.min(left[1] + left[3], right[1] + right[3]);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = left[2] * left[3] + right[2] * right[3] - intersection;
    return union > 0 ? intersection / union : 0;
};

const centerDistance = (left, right) => {
    const leftX = left[0] + left[2] / 2;
    const leftY = left[1] + left[3] / 2;
    const rightX = right[0] + right[2] / 2;
    const rightY = right[1] + right[3] / 2;
    const normalizer = Math.max(left[2], left[3], right[2], right[3], 1);
    return Math.hypot(leftX - rightX, leftY - rightY) / normalizer;
};

const findMatchingTrack = (tracks, face, claimedTrackIds, sameIdentity) => {
    let best = null;
    let bestScore = -Infinity;
    for (const track of tracks) {
        if (claimedTrackIds.has(track.id)) continue; if (sameIdentity && !sameIdentity(track.embedding, face.embedding)) continue;
        const iou = intersectionOverUnion(track.box, face.box);
        const distance = centerDistance(track.box, face.box);
        if (iou < 0.08 && distance > 0.9) continue;
        const score = iou - distance * 0.15;
        if (score > bestScore) {
            best = track;
            bestScore = score;
        }
    }
    return best;
};

export const updateIntruderTracks = ({
    tracks = [],
    faces = [],
    now,
    nextId = 1,
    dwellMs = INTRUDER_DWELL_MS,
    missingGraceMs = TRACK_MISSING_GRACE_MS, sameIdentity,
}) => {
    const intruders = faces.filter((candidate) => !candidate.isOwner);

    if (intruders.length === 0) {
        const nextTracks = tracks
            .map((track) => ({
                ...track,
                missingSince: track.missingSince ?? now,
            }))
            .filter((track) => now - track.missingSince <= missingGraceMs);
        return {
            tracks: nextTracks,
            nextId,
            shouldLock: false,
            threatTrackId: null,
        };
    }

    const matchableTracks = tracks.filter(
        (track) => now - track.lastSeenAt <= TRACK_MATCH_RETENTION_MS,
    );
    const claimedTrackIds = new Set();
    const nextTracks = [];
    let assignedNextId = nextId;

    for (const face of intruders) {
        const matched = findMatchingTrack(matchableTracks, face, claimedTrackIds, sameIdentity);
        const lostBeyondGrace = Boolean(
            matched?.missingSince !== null
            && matched?.missingSince !== undefined
            && now - matched.missingSince > missingGraceMs
        );
        const track = matched
            ? {
                ...matched,
                firstAttentiveAt: lostBeyondGrace ? null : matched.firstAttentiveAt,
            }
            : {
                id: assignedNextId++,
                firstAttentiveAt: null,
                lastSeenAt: now,
                missingSince: null,
                box: face.box, embedding: face.embedding,
            };

        claimedTrackIds.add(track.id);
        const firstAttentiveAt = face.attentive ? (track.firstAttentiveAt ?? now) : null;
        nextTracks.push({
            ...track,
            box: face.box, embedding: face.embedding,
            lastSeenAt: now,
            missingSince: null,
            firstAttentiveAt,
        });
    }

    for (const track of matchableTracks) {
        if (claimedTrackIds.has(track.id)) continue;
        const missingSince = track.missingSince ?? now;
        if (now - missingSince <= missingGraceMs) nextTracks.push({ ...track, missingSince });
    }
    const threat = nextTracks.find((track) => (
        track.firstAttentiveAt !== null && track.missingSince === null
        && now - track.firstAttentiveAt >= dwellMs
    ));

    return {
        tracks: nextTracks,
        nextId: assignedNextId,
        shouldLock: Boolean(threat),
        threatTrackId: threat?.id ?? null,
    };
};
