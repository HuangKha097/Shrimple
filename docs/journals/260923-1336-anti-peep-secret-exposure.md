---
date: 2026-09-23 13:36
severity: critical
component: anti-peep-authentication
status: resolved
---

# Anti-Peep Secrets Were Public User Data

**Date**: 2026-09-23 13:36  
**Severity**: Critical  
**Component**: Anti-Peep authentication and user serialization  
**Status**: Resolved

## What Happened

Anti-Peep stored a four-digit recovery PIN in plaintext beside face descriptors. The entire `antiPeepData` object could be selected by normal user queries and Zustand persisted it in the browser's `auth-storage` localStorage entry. A public profile response or any script with same-origin storage access could therefore obtain both the biometric template and the PIN intended to protect it.

## The Brutal Truth

We treated biometric data and an unlock secret like ordinary profile preferences. That was reckless. The feature looked functional while quietly violating the most basic rule for secrets: never serialize them into broad API responses or persistent browser state. The frustrating part is that this did not require a sophisticated attack. Inspecting a JSON response or localStorage was enough.

## Technical Details

`server/src/models/User.js:113-117` now marks every Anti-Peep field `select: false`. The authenticated `/me` query explicitly selects only `isEnabled`, face descriptors, and `modelVersion`; it never selects the PIN. `POST /api/users/anti-peep/verify-pin` is protected, operates only on `req.user._id`, and returns `401 { valid: false, message: "Incorrect PIN" }` or `429` after five failures in five minutes. New PINs use `bcrypt.hash(pin, 10)`, while successful verification lazily migrates legacy plaintext values. `client/src/stores/useAuthStore.js:393-397` strips `antiPeepData` from persisted state.

## What We Tried

The original design compared the PIN in React and persisted the current user object wholesale. It was simple, fast, and fundamentally unsafe. We rejected client-side hashing because a reusable client hash merely becomes another password. We moved verification to a self-only server endpoint and retained only non-PIN enrollment data in the authenticated in-memory user state.

## Root Cause Analysis

The data model had no sensitivity boundary. `antiPeepData` was added as one convenient nested object, then reused across public serialization, settings updates, and client persistence. Nobody threat-modeled the API surface before implementation, and no test asserted that public user payloads excluded biometric material.

## Lessons Learned

Schema secrecy must be the default for credentials and biometrics. Every endpoint should opt in to the minimum fields it needs. Recovery secrets must be verified server-side with throttling, and persisted client state needs an explicit allowlist rather than a copied user object.

## Next Steps

- Backend owner: replace the process-local attempt map with a shared Redis limiter before running multiple server instances.
- QA owner: add regression tests proving public user endpoints and localStorage never contain `antiPeepData` or PIN hashes before the next release.
- Release owner: force a sanitized auth-store write or logout during rollout so stale browser snapshots are removed immediately.
