---
phase: 4
title: "Integration verification"
status: pending
priority: P1
effort: 1h
dependencies: [1, 2, 3]
---

# Phase 4: Integration verification

## Overview

Root integrator joins all three components and records test/build/UI evidence separately from real-device performance. Depends on phases 1–3 and verified model bundle.

## Requirements and architecture

Browser remote PCM → permission bridge → VAD/ASR → original notes → delayed translation; trace failures and teardown end-to-end. Existing GPU/CPU Whisper configuration stays unchanged.

## Related Code Files

- Root owns related docs/README/evidence updates; source fixes coordinated through exclusive phase owner.
- Product references: FR-23 `docs/prd.md:197`, BR-20 `docs/prd.md:201`, AC-21 `docs/prd.md:204`, QS-I23 `docs/kanban.md:158` at planning snapshot.

## Implementation Steps

1. Run meaningful client/AI/server suites; lint client and production build. Preserve isolated Mongo requirement and pre-existing working-tree edits.
2. Browser fixtures validate two directions, remote-only direct/group capture, original-before-translation, same-note revisions, backpressure and all teardown transitions.
3. Validate pinned ONNX loading and package/image runtime support; separate mocks from actual ASR/translation device tests.
4. When runtime available measure declared CPU/GPU and 1/2/4-speaker workloads: first original/final/translation p50/p95, queue depth and memory. If unavailable, explicitly record unverified mic/WebRTC/model performance.
5. Update current protocol/behavior/limits in canonical docs; evidence records exact commands/results and outstanding gaps. No duplicated authoritative contracts.

## Success Criteria

- [x] 128 ms PCM/zero-FFmpeg path, stable original+pending+delayed translation and bounded cleanup have automated evidence.
- [x] Existing compatible HTTP/group/session suites remain passing and build/lint results recorded with actual counts.
- [x] No unsupported 1–2 second, production, privacy or physical-device claims; working tree remains uncommitted.

## Completion evidence and verification boundary

- Client 40/40; server 72/72 on temporary Mongo; AI 55/55. Client lint 0 errors/3 existing warnings and production build pass; Docker image builds pass. Independent review rechecked clear after two P2 fixes.
- Real browser AudioWorklet/48 kHz synthetic remote stream: 4,096-byte/128 ms packets, zero sequence errors; original partial/final and delayed translation update one note in both directions. Hidden/reconnect/logout transitions exercised.
- Live CPU internal AI PCM socket, public two-second JFK excerpt: 132 packets over 16,898 ms; first partial 4,467 ms, final 7,437 ms, translation 16,779 ms from PCM stream start. These are one-run stream-start timings, not speech-end timings or p50/p95; 1–2 seconds was not achieved in this run.
- Native microphone/WebRTC, English/Vietnamese accuracy/noise corpus, CPU/GPU 1/2/4-speaker throughput/queue/memory benchmarks remain QA backlog. No production acceptance claim.
- Canonical documentation/evidence synchronization owned by root; retain [validation](../../docs/validation/2026-10-17-translation-pcm.md) as measurement authority. All source edits remain uncommitted.

## Risk and rollback

Medium × Medium: fixture success mistaken for real-world latency. Mitigate separate validation levels and hardware/workload labels. Revert only scoped doc/source changes by reviewed diff; never reset pre-existing user work.
