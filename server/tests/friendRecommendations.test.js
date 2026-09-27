import test from "node:test";
import assert from "node:assert/strict";
import { scoreFriendCandidate } from "../src/services/friendRecommendations.js";

const viewer = {
    school: "Đại học A",
    major: "CNTT",
    workplace: "Công ty B",
    location: { city: "Hà Nội", country: "Việt Nam" },
    privacy: {}
};

test("mutual friends and direct interaction outrank an unrelated account", () => {
    const candidate = { school: "Trường C", workplace: "Công ty D", location: {}, privacy: {} };
    const connected = scoreFriendCandidate(viewer, candidate, { mutual: 2, likes: 1, comments: 1 });
    const unrelated = scoreFriendCandidate(viewer, candidate, {});
    assert.ok(connected.score > unrelated.score);
    assert.equal(connected.mutualFriendCount, 2);
    assert.equal(connected.suggestionReason, "2 bạn chung");
});

test("hidden profile attributes do not affect ranking or explanation", () => {
    const candidate = { ...viewer, privacy: { showSchool: false, showWorkplace: false, showLocation: false } };
    const hidden = scoreFriendCandidate(viewer, candidate);
    assert.equal(hidden.score, 0);
    assert.equal(hidden.suggestionReason, "Khám phá cộng đồng");
    assert.equal(scoreFriendCandidate({ ...viewer, privacy: { showSchool: false } }, { ...viewer, privacy: {} }).suggestionReason, "Cùng nơi làm việc");
});

test("shared school and city help a new user without any friends", () => {
    const candidate = { school: "đại học a", major: "cntt", location: { city: "hà nội", country: "Việt Nam" }, privacy: {} };
    const match = scoreFriendCandidate(viewer, candidate);
    assert.ok(match.score > 0);
    assert.equal(match.suggestionReason, "Cùng trường");
});

test("repeated activity has a capped contribution", () => {
    const candidate = { privacy: {} };
    const three = scoreFriendCandidate(viewer, candidate, { likes: 3, comments: 3, groups: 2 });
    const hundred = scoreFriendCandidate(viewer, candidate, { likes: 100, comments: 100, groups: 100 });
    assert.equal(three.score, hundred.score);
});
