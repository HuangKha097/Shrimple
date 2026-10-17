---
phase: 2
title: Authorized socket bridge
status: completed
priority: P1
effort: 1.5h
dependencies: []
---

# Phase 2: Authorized socket bridge

## Overview

Server owner implements bounded, authenticated Socket.IO-to-AI WebSocket transport. Shared contract in [plan.md](./plan.md) is prerequisite; client/AI can implement concurrently against mocks.

## Requirements and architecture

JWT socket identity → validate active accepted call and remote speaker → pin call/attendance → authenticated AI WebSocket `/stream/pcm` → validate/sanitize events → emit only to requesting socket. Recheck permissions for every packet/result and silence-time revocation timer.

## Related Code Files

- Modify `server/src/socket/socket.js` (identity middleware line 59, session helper line 41), package.json and package-lock.json together.
- Added `server/src/socket/translationPcm.js`, `server/tests/translationPcm.test.js` and `server/tests/translationPcmSocket.test.js`. HTTP translation routes remain compatible; health adds `mode=pcm`.

## Implementation Steps

1. Register start/audio/stop once per connection; own every stream under the creating socket, using unpredictable server stream IDs.
2. Validate languages, remote speaker, exact PCM size, sequence, rate, stream count and buffer bounds. Export concrete limits for boundary tests.
3. Forward trusted language start and binary PCM to AI using direct `ws` dependency and server-only API key; enforce setup/inactivity/inference budgets. Wait for AI ready event with matching format before acknowledging browser start.
4. Pin group attendance objects to reject leave/rejoin reuse; direct call replacement similarly invalidates old work.
5. Validate upstream event schema/size/revisions; attach trusted speaker metadata, prevent post-revocation content. Abort upstream and remove timers/listeners on every terminal path.

## Success Criteria

- [x] Mocked AI integration proves unaccepted/nonparticipant/own-speaker/wrong-owner starts or frames are rejected.
- [x] Revocation, call end, leave/rejoin, malformed frames/events, flood, overload, timeout and disconnect settle with bounded cleanup.
- [x] Existing direct/group/HTTP session suites pass using isolated test DB; no sensitive payload logging.

## Completion evidence

- Full server suite: 72/72 using temporary MongoDB. Socket.IO integration authenticates JWT and uses mocked internal AI WebSocket; no production DB or private audio.
- Limits, permission revocation, attendance replacement, malformed packets/events, backpressure, idle/setup timeouts and disconnect have regression coverage. Pending packet acknowledgements settle once on shutdown; failed utterances retire without unbounded ledger growth.
- Internal AI API key stays backend-only; event messages sanitized and trusted speaker metadata attached by bridge.
- Independent review's two P2 findings fixed and rechecked clear. Evidence: [PCM validation](../../docs/validation/2026-10-17-translation-pcm.md).

## Risk and rollback

Medium × High: permission bypass or memory/CPU exhaustion. Mitigate pinned authority checks and exported resource limits. Disable bridge registration and revert its direct dependency/lockfile together; legacy HTTP remains available.
