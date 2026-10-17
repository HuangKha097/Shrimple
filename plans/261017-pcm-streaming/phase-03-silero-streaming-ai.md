---
phase: 3
title: Silero streaming AI
status: in-progress
priority: P1
effort: 2h
dependencies: []
---

# Phase 3: Silero streaming AI

## Overview

AI owner adds CPU Silero ONNX segmentation and independent partial-ASR/final-translation scheduling. Shared contract plus verified pinned model are prerequisites; preserve existing HTTP decode/progressive behavior.

## Requirements and architecture

Authenticated PCM WebSocket → 512-sample Silero frames with per-stream recurrent state/context → utterance with 256 ms pre-roll → partial/final in-memory WAV → existing ASR lane → original event → bounded independent final text translation lane. No FFmpeg on PCM path.

## Related Code Files

- Modify `ai-service/app.py` (existing locks lines 31–32, WAV inference line 74), requirements.txt and Dockerfile.
- Added `ai-service/pcm_stream.py`, `pcm_vad.py`, `test_pcm.py` and public speech fixture with provenance under `testdata/`. Official ONNX, metadata and MIT license bundled under `models/`; hash/revision specified in main plan.

## Implementation Steps

1. Verify model hash and input/output signatures; CPU inference shared with thread limit one, state/context separate per stream. Add NumPy, ONNX Runtime and WebSocket protocol dependencies without Torch.
2. Authenticate before accepting audio; exact start schema, fixed PCM packet size, explicit languages and bounded sessions/buffers/event sizes.
3. Keep 256 ms pre-roll; begin partial ASR around 600 ms speech and update around 500 ms; end after 320 ms silence or 8 seconds maximum.
4. Coalesce replaceable partial snapshots; preserve final jobs up to explicit limits, emit affected utterance busy/error on overload. One ASR lane and one translation lane; final translation never holds ASR lane.
5. Freeze final transcript revision and translate asynchronously. Disconnect cancels queued work and suppresses stale output; bounded active sync inference retains its lock until actual completion.
6. Readiness fails for absent/corrupt/incompatible model; no implicit RMS fallback or runtime unpinned downloads.

## Success Criteria

- [x] Real ONNX smoke plus deterministic VAD tests cover 32 ms frames, pre-roll, silence, maximum split and two-stream state isolation.
- [x] ASR while previous translation is blocked; final overload reports explicitly; every emitted translation matches frozen final revision.
- [x] PCM tests prove FFmpeg is never invoked; all existing HTTP/progressive tests pass; dependency/image validation recorded.

## Completion evidence

- AI suite: 55/55, including real ONNX VAD/public voice fixture and deterministic mock ASR/translation scheduling; existing HTTP/progressive regressions pass.
- Docker images built; latest AI image rebuilt/applied. Live CPU public two-second JFK excerpt produced partial, final and translation through the PCM WebSocket. This is real model evidence for one sample, not an accuracy or latency SLA.
- CPU VAD probe: p50 0.151 ms, p95 0.338 ms per 32 ms frame. Model hash/readiness verified; PCM path wraps WAV in RAM without FFmpeg.
- Cross-stream finals take priority over replaceable partials; active synchronous inference retains its global lane until completion after cancellation.
- Evidence: [PCM validation](../../docs/validation/2026-10-17-translation-pcm.md).

## Risk and rollback

High × High: CPU backlog/model mismatch/state leakage. Mitigate hash/readiness checks, bounded independent schedulers, stream-local state and overload events. Disable PCM route/remove its scoped dependencies and bundled model while preserving HTTP inference.
