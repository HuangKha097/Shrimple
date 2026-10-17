# Phase 02 — Enrollment and persistence

## Context

Parent: [plan.md](./plan.md)

## Implementation

- Capture several high-quality owner embeddings per enrollment.
- Persist `faceDescriptors` and `modelVersion` while retaining the legacy field/API input.
- Detect incompatible legacy descriptors and require re-enrollment.
- Update settings calibration state and user feedback.

## Todo

- [x] Burst enrollment with quality gates
- [x] Schema/controller compatibility changes
- [x] Settings legacy-state handling
- [x] Calibration progress feedback

## Result

Enrollment captures five FaceRes embeddings and displays sample progress before asking for the four-digit recovery PIN. The API and Mongoose schema accept `faceDescriptors` plus `modelVersion` while retaining the original `faceDescriptor` field for request compatibility. Current enrollment requires model version `human-faceres-v3.3.6`; settings identify older face-api data and ask the user to scan again.

## Risks

- Existing 128-value face-api descriptors are incompatible with Human embeddings and cannot be migrated mathematically.

Security hardening stores the four-digit PIN as a bcrypt hash, verifies it through a self-only rate-limited endpoint, hides Anti-Peep fields from public user queries, and excludes biometric settings from localStorage persistence.
