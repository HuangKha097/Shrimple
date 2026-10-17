# Phase 01 — Adaptive perception and tracking

## Context

Parent: [plan.md](./plan.md)

## Implementation

- Add Human vision adapter with low-power and threat-analysis configurations.
- Add pure face-box association and per-intruder dwell state helpers.
- Replace overlapping `setInterval` inference with a single-flight recursive scheduler.
- Stop/resume camera on visibility changes and apply balanced media constraints.
- Escalate only when multiple faces are present; lock after continuous three-second attention.

## Todo

- [x] Human dependency and adapter
- [x] Tracker/dwell state machine
- [x] Provider integration
- [x] Visibility and cleanup behavior

## Result

The provider now uses a single-flight recursive scheduler. A detector-only scan runs every 1.5 seconds; mesh, iris, gesture, and face embeddings run at a 350 ms cadence only while at least two faces are visible. Camera input targets 320×240 at 6 FPS with a 10 FPS ceiling, and the stream stops whenever protection is disabled or the page becomes hidden.

The pure tracker associates moving face boxes, resets dwell when a person looks away, preserves state through detection gaps up to 500 ms, and locks after the same attentive non-owner reaches 3,000 ms.

## Risks

- Browser/device variance in gaze estimation; mitigate through head-pose plus iris checks and conservative size/confidence gates.
- Model load latency; bundled same-origin assets load only when enrollment or protection needs them.
