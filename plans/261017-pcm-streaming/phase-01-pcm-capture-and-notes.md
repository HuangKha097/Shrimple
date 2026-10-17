---
phase: 1
title: PCM capture and notes
status: completed
priority: P1
effort: 1.5h
dependencies: []
---

# Phase 1: PCM capture and notes

## Overview

Client owner replaces recorder transport with continuous remote PCM and stable utterance revisions. Shared contract in [plan.md](./plan.md) is the implementation prerequisite; server/AI phases can proceed concurrently with mocks.

## Requirements and architecture

Remote tracks → shared panel AudioContext → per-speaker AudioWorklet → mono 16 kHz PCM16LE → 128 ms packets → authenticated existing socket. Server events → revision-aware note reducer → original with pending translation beneath it. Explicit en→vi and vi→en describe counterpart→viewer.

## Related Code Files

- Modified `client/src/components/chat/TranslationNotes.jsx`, `client/src/i18n.js` and client test script.
- Added `translationPcmCapture.js`, `translationPcmWorklet.js`, `translationPcmSocket.js`, `translationNotesState.js` and `translationPcm.test.js` beside the panel. Vite bundles the worklet through `?url`; no public worklet copy is needed.
- Retain remote filtering in `client/src/components/chat/translationStream.js:19`; existing two callers are enumerated in plan.

## Implementation Steps

1. Resample from actual AudioContext rate; output exact 2,048-sample/4,096-byte packets with sequential IDs after start acknowledgement.
2. Use existing auth socket; suppress offline queue/replay. Shared context closes after last source, with idempotent teardown.
3. Upsert partial/final originals by stream+utterance+revision; translate only matching final revision. Every nonempty original shows pending translation, then complete/error/interrupted.
4. Direction/source/track/session changes invalidate generation. Closing/hidden/unmount/logout/disconnect cleans nodes/listeners/timers without stopping original WebRTC tracks.

## Success Criteria

- [x] 44.1/48 kHz fixture duration/frequency, stereo, PCM saturation, endianness and packet tests pass.
- [x] Remote-only selection and both directions verified; stale revisions/results ignored.
- [x] Browser fixture shows original before delayed translation and same-note update; client tests/lint/build pass.

## Completion evidence

- Client suite: 40/40; lint: 0 errors, 3 existing warnings; production build passes.
- Browser fixture used real AudioContext at 48 kHz and real AudioWorklet with synthetic remote audio. Exact 4,096-byte packets represent 128 ms at 16 kHz; zero sequence errors. Self source excluded.
- Same note progressed partial → final → delayed translation in both directions. Hidden tab stopped streams; reconnect started fresh; logout cleaned up. Model events in this UI fixture were mocked; physical WebRTC capture remains unverified.
- Evidence: [PCM validation](../../docs/validation/2026-10-17-translation-pcm.md).

## Risk and rollback

Medium × High: resampling drift or stale private content. Mitigate actual-rate fixtures, source filter, generation guard and no offline replay. Revert scoped panel/PCM integration to preserved legacy HTTP flow; do not overwrite other pre-existing edits.
