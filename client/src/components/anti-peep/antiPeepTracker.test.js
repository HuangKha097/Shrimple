import test from 'node:test';
import assert from 'node:assert/strict';
import { updateIntruderTracks } from './antiPeepTracker.js';
import { getFaceGestures, isAttentiveFace } from './antiPeepVision.js';

const box = [20, 20, 80, 80];
const step = (state, now, faces) => updateIntruderTracks({ ...state, now, faces });

test('owner alone never creates an intruder track', () => {
    const state = step({}, 0, [{ box, isOwner: true, attentive: true }]);
    assert.equal(state.shouldLock, false);
    assert.equal(state.tracks.length, 0);
});

test('a passer-by who is not attentive never locks', () => {
    let state = step({}, 0, [{ box, isOwner: false, attentive: false }]);
    state = step(state, 3500, [{ box, isOwner: false, attentive: false }]);
    assert.equal(state.shouldLock, false);
});

test('the same attentive intruder locks after three seconds', () => {
    let state = step({}, 0, [{ box, isOwner: false, attentive: true }]);
    state = step(state, 1400, [{ box: [23, 20, 80, 80], isOwner: false, attentive: true }]);
    state = step(state, 3000, [{ box: [26, 20, 80, 80], isOwner: false, attentive: true }]);
    assert.equal(state.shouldLock, true);
});

test('looking away resets the dwell timer', () => {
    let state = step({}, 0, [{ box, isOwner: false, attentive: true }]);
    state = step(state, 2000, [{ box, isOwner: false, attentive: false }]);
    state = step(state, 4200, [{ box, isOwner: false, attentive: true }]);
    assert.equal(state.shouldLock, false);
    state = step(state, 7200, [{ box, isOwner: false, attentive: true }]);
    assert.equal(state.shouldLock, true);
});

test('brief missed detections preserve dwell, longer gaps reset it', () => {
    let state = step({}, 0, [{ box, isOwner: false, attentive: true }]);
    state = step(state, 400, []);
    state = step(state, 800, [{ box, isOwner: false, attentive: true }]);
    state = step(state, 3000, [{ box, isOwner: false, attentive: true }]);
    assert.equal(state.shouldLock, true);

    state = step({}, 0, [{ box, isOwner: false, attentive: true }]);
    state = step(state, 400, []);
    state = step(state, 1000, [{ box, isOwner: false, attentive: true }]);
    state = step(state, 3000, [{ box, isOwner: false, attentive: true }]);
    assert.equal(state.shouldLock, false);
});
test('iris facing-center cannot substitute for centered head pose', () => {
    const result = {
        gesture: [
            { iris: 0, gesture: 'facing center' },
            { iris: 0, gesture: 'looking center' },
            { face: 0, gesture: 'facing left' },
        ],
    };
    const face = { box: [0, 0, 100, 100] };
    assert.equal(
        isAttentiveFace(face, getFaceGestures(result, 0), 320, 240),
        false,
    );
});

test('attentive face requires centered head and centered iris gaze', () => {
    const result = {
        gesture: [
            { face: 0, gesture: 'facing center' },
            { iris: 0, gesture: 'looking center' },
        ],
    };
    const face = { box: [0, 0, 100, 100] };
    assert.equal(
        isAttentiveFace(face, getFaceGestures(result, 0), 320, 240),
        true,
    );
});

test('a different person in the same box cannot inherit dwell', () => {
    const sameIdentity = (a, b) => a?.[0] === b?.[0];
    let state = updateIntruderTracks({now: 0, faces: [{box, embedding: [1], attentive: true}], sameIdentity});
    state = updateIntruderTracks({...state, now: 2000, faces: [{box, embedding: [2], attentive: true}], sameIdentity});
    state = updateIntruderTracks({...state, now: 3000, faces: [{box, embedding: [2], attentive: true}], sameIdentity});
    assert.equal(state.shouldLock, false);
});
