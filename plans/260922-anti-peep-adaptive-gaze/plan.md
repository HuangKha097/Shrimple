---
title: Adaptive Anti-Peep gaze protection
date: 2026-09-22
status: completed
progress: 100
---

# Adaptive Anti-Peep gaze protection

## Overview

Replace the always-heavy face-api loop with an adaptive `@vladmandic/human` pipeline. The browser performs low-rate face-count scans, escalates to identity and gaze analysis only when multiple faces are visible, and locks after the same non-owner attends to the screen-camera region continuously for three seconds.

The user approved implementation after reviewing the proposed balanced-mode architecture.

## Requirements

- Expected output: updated Anti-Peep provider/calibration/settings, backward-compatible persistence for multiple Human embeddings, adaptive camera constraints, and a tested three-second intruder dwell tracker.
- Acceptance: one owner alone never locks; a passer-by or person looking away does not lock; the same non-owner looking toward the screen-camera region for at least 3,000 ms locks; inference calls never overlap; camera stops while the page is hidden or protection is disabled.
- Scope boundary: no exact screen-coordinate gaze calibration, no server-side video inference and no raw video/frame persistence. PIN hashing and server-side verification were added during security review.
- Constraints: React/Vite browser runtime, local inference, 320×240 camera target, maximum 10 FPS camera input, existing `PUT /api/users/anti-peep` contract remains accepted, legacy face-api descriptors prompt re-enrollment instead of being compared with incompatible embeddings.
- Touchpoints: `AntiPeepProvider.jsx`, `FaceIDCalibrationModal.jsx`, `AntiPeepSettings.jsx`, client dependencies/lockfile, `User.js`, `userController.js`, README, and new pure tracking/vision helpers.

## Phases

| Phase | Status | Deliverable |
|---|---|---|
| 01 — Adaptive perception and tracking | Complete | Human integration, two-stage loop, gaze dwell tracker |
| 02 — Enrollment and persistence | Complete | Multi-embedding enrollment, model versioning, legacy handling |
| 03 — Verification and documentation | Complete | Unit checks, scoped lint, production build, review, README sync |

## Dependencies

- `@vladmandic/human`
- Existing camera permission and authenticated user settings flow
- Human model assets bundled in `client/public/models/human/`

## Success criteria

- Low-power scan runs without mesh, iris, or embedding inference.
- Full analysis runs only while at least two faces are present.
- Dwell duration uses monotonic timestamps rather than frame counts.
- Brief inference dropout under 500 ms does not reset a genuine stare.
- Legacy users see a re-enrollment requirement and do not get false matches.
- Client unit tests, feature-scoped lint, and production build complete without new errors.

## Verification

- `npm test`: 8/8 tracker and gaze-regression tests passed.
- Feature-scoped ESLint: passed for the provider, calibration modal, settings, vision adapter, tracker, and tracker tests.
- `npm run build`: passed; Human is emitted as a lazy chunk, with remaining chunk-size and existing auth-store import warnings.
- Repository-wide `npm run lint`: still fails on 38 errors and 8 warnings in unrelated existing files; no Anti-Peep file was reported.

Final verification: 8 unit tests include identity replacement and gaze provenance. Real camera accuracy, battery and thermal measurements remain device validation tasks. PIN attempt reservation is synchronous per server process; distributed deployment requires a shared limiter.
