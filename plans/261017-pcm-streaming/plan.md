---
title: PCM streaming translation and Silero VAD
description: >-
  Stream remote PCM continuously, show original revisions first, translate
  finalized speech asynchronously.
status: in-progress
priority: P1
effort: 6h
branch: main
tags:
  - translation
  - audio-worklet
  - socket
  - silero
blockedBy: []
blocks: []
created: '2026-10-17'
createdBy: 'ck:plan'
source: skill
---

# PCM streaming translation and Silero VAD

## Overview

Replace the note panel's two-second MediaRecorder clips with 128 ms PCM packets and stateful Silero VAD. Show the counterpart's original partial transcript immediately after recognition, with “Translating...” below; update the same note after asynchronous translation. Keep the existing Whisper.cpp/Qwen engines and GPU/CPU configuration. Native Whisper inference remains window-based; 1–2 second latency is a measurement target, not a guarantee.

Authorized scope: reversible implementation and verification; preserve existing uncommitted changes. No commit, deployment, model-engine replacement, own-microphone upload or persistence policy change.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [PCM capture and notes](./phase-01-pcm-capture-and-notes.md) | Completed |
| 2 | [Authorized socket bridge](./phase-02-authorized-socket-bridge.md) | Completed |
| 3 | [Silero streaming AI](./phase-03-silero-streaming-ai.md) | In Progress |
| 4 | [Integration verification](./phase-04-integration-verification.md) | Pending |

## Dependencies

- Contract below is the common blocker for phases 1–3; those phases have disjoint ownership and can implement concurrently against mocks. Phase 4 depends on 1+2+3 and the pinned model bundle.
- Existing plans reviewed: group roles and codebase cleanup completed; Anti-Peep completed. No blocking overlap.
- `docs/development-rules.md` absent at planning time; repository AGENTS instructions apply. Optional active-plan script at `$HOME/.Codex/scripts/set-active-plan.cjs` absent; no session file mutated manually.
- Node image is 22 (`server/Dockerfile:1`); add direct `ws` dependency for an authenticated internal WebSocket. Add explicit Python WebSocket protocol, NumPy and ONNX Runtime dependencies; no Torch requirement.

## Verified current flow

- Panel instances: `client/src/components/chat/CallModal.jsx:289` and `client/src/components/chat/GroupCallModal.jsx:756` (two production callers). Direct activation already requires accepted call and remote stream. Group builds remote peer sources at `client/src/components/chat/GroupCallModal.jsx:197`.
- `client/src/components/chat/TranslationNotes.jsx:135` starts MediaRecorder after remote-only filtering (`client/src/components/chat/translationStream.js:19`); clip duration is 2,000 ms (`client/src/components/chat/TranslationNotes.jsx:14`), then POST `/chunk-stream` (`client/src/components/chat/TranslationNotes.jsx:188`).
- Existing HTTP handler `server/src/routes/translationRoute.js:167` validates the session and pins group attendance (`server/src/routes/translationRoute.js:80`), forwards audio, then rechecks permission before every outgoing event (`server/src/routes/translationRoute.js:190`). Preserve these legacy endpoints.
- JWT middleware populates socket identity after User lookup (`server/src/socket/socket.js:59`). `getTranslationSession` (`server/src/socket/socket.js:41`) requires accepted direct calls; group viewer/speaker IDs must appear in the room. Existing state is process-scoped maps (`server/src/socket/socket.js:36`); call objects are per-call, participant objects per-attendance.
- `ai-service/app.py:36` decodes uploads with FFmpeg; `transcribe_audio` (`ai-service/app.py:74`) already accepts WAV. ASR and translation locks are separate process-wide lanes (`ai-service/app.py:31`, `ai-service/app.py:32`). The PCM path wraps WAV in memory and bypasses decoding.

## Shared contract and data flow

1. Viewer opens notes → authenticate socket from existing auth store → filter live remote tracks → create one AudioContext shared by this panel and one worklet per speaker. Read the actual context sample rate, downmix/resample to 16,000 Hz, clamp float samples to little-endian PCM16.
2. `translation:start` accepts `{kind,sessionId,speakerId,sourceLanguage,targetLanguage}`. Only explicit en↔vi directions accepted; source describes counterpart speech. Server validates speaker differs from viewer, active accepted call, and pins call/attendance objects before opening AI connection.
3. Start acknowledgement is `{ok:true,streamId,sampleRate:16000,channels:1,packetSamples:2048}` or `{ok:false,status,message}`. `streamId` is server-generated, socket-owned and unique. Never send the AI API key to browser.
4. `translation:audio` carries `{streamId,seq,audio:ArrayBuffer}`: exact 4,096 bytes = 2,048 samples = 128 ms; sequence begins at zero and increases by one. No offline Socket.IO replay: stop/reset on disconnection; no accumulating captured packets while offline.
5. `translation:stop` carries `{streamId}` and aborts that socket's stream. Closing panel, hiding document, changing direction, ended/replaced track, logout, unmount or call termination tears down nodes/listeners/timers/upstream work. Never stop the original WebRTC track.
6. Server creates internal authenticated WebSocket `/stream/pcm` with `x-api-key`; first JSON `{sourceLanguage,targetLanguage}`, subsequent binary messages exact 4,096 bytes. AI must emit `{type:'ready',sampleRate:16000,channels:1,packetSamples:2048}` before bridge acknowledges client start. Reject missing/wrong key, malformed start, unexpected control/text and invalid PCM. PCM remains in bounded memory only.
7. AI applies CPU Silero ONNX on 512 samples (32 ms), with independent recurrent state/context for each stream. Keep 256 ms pre-roll; end utterance after 320 ms silence; max utterance 8 seconds. Shared inference session may be process-wide; speech buffers, recurrent state, utterance IDs and queues must be stream-local.
8. After approximately 600 ms voiced audio, schedule growing-window ASR at approximately 500 ms cadence. Coalesce pending partial recognition to the latest snapshot; preserve finalization requests with explicit capacity limits. One ASR lane and one translation lane remain independent; never hold ASR while translating.
9. Internal events use `{type,utteranceId,revision,...}`. `transcript` adds `{original,sourceLanguage,targetLanguage,isFinal}`; `translation` adds `{translated}`; `status`/`error` adds `{status,message}` and utterance identity when relevant. Server patches trusted `{streamId,speakerId,speakerName}` and validates lengths/types before emitting `translation:event` exclusively to requesting socket.
10. Each utterance has stable ID and monotonically increasing transcript revisions. A final transcript freezes that utterance; translation refers to its final revision. Client upserts by stream+utterance and ignores stale revisions/old stream generations. Every nonempty original shows pending text below until translated or a specific error/interruption settles it.
11. Translate final utterances asynchronously; keep later original recognition moving while translation waits. Bound pending finals, memory, active streams and model jobs; overflow emits explicit busy/error for affected note/stream. Never silently discard finalized speech or show another utterance's translation.

## Admission, cleanup and security gates

- Enforce exact packet size and sequence, real-time rate ceiling with a small burst allowance, bounded per-stream and process buffers, stream caps per socket/process, setup timeout and inactivity timeout. The server worker must declare concrete limits as exported constants and exercise their boundaries in tests.
- Recheck pinned call/attendance on every audio packet and inference result, plus periodic revocation during silence. A user leaving/rejoining cannot inherit old work. Only existing active authenticated sockets may start new streams.
- Internal ONNX file must be official, revision-pinned with SHA-256 and MIT license; bundle model at build time under `ai-service/models/`. Selected Silero v6.2 revision `be95df9152c0d7618fa1edfeb296fc3dae32376f`, SHA-256 `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3`; root reports downloaded file size 2,327,524 bytes. Fail readiness closed on missing, corrupt or incompatible model; do not download unpinned models at runtime.
- Never log audio, original/translations, credentials or request payloads. Diagnostic events contain IDs/status and bounded timings only. Do not broaden existing consent/retention claims.

## Phase ownership and approval gates

| Phase / owner | Exclusive files / responsibility | Blockers / observable gate |
|---|---|---|
| 1 / client worker | `client/src/components/chat/TranslationNotes.jsx`, new PCM/worklet/socket helpers and their tests under chat, `client/public/worklets/`, `client/src/i18n.js`; CSS only if needed | Shared contract; mocked PCM/transport/reducer tests and build prove 128 ms output, correct direction, remote-only capture, stable note revisions and cleanup |
| 2 / server worker | New translation socket bridge/tests, `server/src/socket/socket.js`, `server/package.json`, `server/package-lock.json` | Shared contract; mocked upstream tests prove JWT/session/attendance authorization, limits, stop/revocation/disconnect and sanitization |
| 3 / AI worker | `ai-service/app.py`, new PCM/VAD module/tests, `ai-service/requirements.txt`, `ai-service/Dockerfile`, official model/license bundle | Shared contract + verified model; tests prove no FFmpeg PCM path, state isolation, pre-roll/VAD/finalization, independent ASR/translation and explicit overload |
| 4 / root integrator | `docs/` and README scope updates, integration evidence; coordinate source fixes back to owning worker | Phases 1+2+3; combined tests/build/lint pass, browser fixtures recorded; runtime/device limits reported honestly |

Phase estimates: client 1.5h; bridge 1.5h; AI 2h; integration 1h. These are engineering estimates, not delivery deadlines.

## Risk and rollback per phase

| Phase | Likelihood × impact / failure | Mitigation | Rollback |
|---|---|---|---|
| 1 | Medium × High: sample-rate drift, own mic capture, stale notes, node leaks | Actual-rate resampler tests at 44.1/48 kHz; remote helper retained; generation guard; close AudioContext without stopping source track | Completed |
| 2 | Medium × High: stale call permission or unbounded audio flood | Per-packet/result/session-pin checks, input/rate/buffer caps, timers, upstream abort and exclusive socket emission | Completed |
| 3 | High × High: CPU saturation, model mismatch, state leakage, final backlog | Shared ONNX session with per-stream state; hash/readiness checks; bounded fair work; independent lane locks; explicit overloaded final errors | In Progress |
| 4 | Medium × Medium: mocks mistaken for live speech/latency evidence | Separate test/build/UI/live-hardware evidence; report model readiness and measured workload | Restore related docs from captured diff only; never reset pre-existing user changes |

## Compatibility and migration

- Additive socket protocol and internal AI WebSocket; retain HTTP health/chunk/chunk-stream clients and original upload limits/FFmpeg validation. Existing stored users, notes, conversations and integrations need no data migration.
- New panel uses PCM only after acknowledged start; unsupported AudioWorklet/browser/model receives an actionable error. Do not silently switch source language, upload own microphone or fall back to RMS VAD while claiming Silero.
- Existing CPU/GPU Whisper configuration stays authoritative; ONNX VAD runs on CPU. No new guarantee that combined CPU/GPU makes ASR real-time. Current per-viewer remote capture can duplicate recognition across viewers; speaker-owned fanout is deferred because it changes call/privacy contracts.

## Test matrix and measurable success

| Layer | Required meaningful checks |
|---|---|
| Unit client | 44.1/48 kHz resampling duration/frequency, stereo downmix, PCM clipping/endianness, exact packet sizes/sequences, revision and terminal-error reducer, both directions and own-user exclusion |
| Unit AI | Real ONNX model smoke plus deterministic VAD fixture; 512-frame boundaries, 256 ms pre-roll, 320 ms silence, 8-second max split, distinct stream state, waveform-to-WAV without FFmpeg, slow translation does not gate subsequent ASR |
| Integration server/AI | Unauthorized or unaccepted calls, wrong stream owner, call ended/rejoined, speaker removed, disconnect/cancel, malformed/out-of-order/oversized packets, flood/backpressure, AI timeout/corrupt events, final job overload, simultaneous sessions |
| Existing regressions | Client tests + lint + production build; server session/route/group suites on isolated Mongo; AI existing HTTP/progressive tests |
| Browser E2E fixtures | Direct and group remote-only data; partial original before delayed translation; same-note updates, two directions, panel/visibility/track cleanup, reconnect without stale audio; light/dark and mobile |
| Live device benchmark | When runtime available: actual voice, noise/short words, English/Vietnamese, CPU and available GPU; measure speech-start→first-original, end→final, final→translation p50/p95, queue depth and memory for declared 1/2/4-speaker workload |

Done requires exact 128 ms packets, zero FFmpeg invocation on PCM, nonempty original before delayed translation in fixtures, bounded resource behavior and no stale/unauthorized note events. Each test count and runtime limitation must be recorded; physical mic/WebRTC/model performance is unverified until exercised.

## Validation log

- Four phases: standard verification tier. Re-grep performed for current entrypoints, locks, session authorization, call cleanup, DTOs, manifests and both production panel callers; actual control flow read rather than inferred from names.
- New file paths above are proposed ownership, not claims of existing symbols. No new fields are added to shared call/user models; new state belongs to panel/socket/AI stream and is explicitly destroyed.
- Full-plan sweep: contracts, ownership, compatibility, tests and rollback reconciled; no unresolved architecture blocker. Root may adjust numeric caps after implementation/load evidence.

## Unresolved questions

No blocking product question. Available hardware/runtime and acceptable ASR accuracy remain empirical validation gaps; do not claim 1–2 second service-level performance from mocks.
