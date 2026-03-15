---
id: T02
parent: S02
milestone: M001
provides:
  - Server-enforced onboarding command locking plus bridge auth-refresh state that keeps browser setup blocked until a restarted bridge sees newly validated credentials
key_files:
  - src/web/onboarding-service.ts
  - src/web/bridge-service.ts
  - web/app/api/session/command/route.ts
  - src/tests/web-onboarding-contract.test.ts
  - src/tests/integration/web-mode-onboarding.test.ts
key_decisions:
  - Browser credential setup now stays locked until the bridge has been restarted onto the new auth view, with `lockReason` and `bridgeAuthRefresh` exposed as part of the onboarding contract
patterns_established:
  - Read-only RPC commands remain available during onboarding while mutating commands return structured locked responses keyed to the shared onboarding state
observability_surfaces:
  - `/api/boot`, `/api/onboarding`, `/api/session/command` blocked responses, and `onboarding.bridgeAuthRefresh`
duration: 1h 05m
verification_result: passed
completed_at: 2026-03-14T19:05:44-04:00
blocker_discovered: false
---

# T02: Enforce the gate and refresh bridge auth after successful setup

**Turned the onboarding contract into a real server lock, restarted the bridge onto newly validated auth before the first prompt, and made refresh failures inspectable instead of silently looking like a generic locked workspace.**

## What Happened

Extended `src/web/onboarding-service.ts` so onboarding state now carries a first-class `lockReason` plus `bridgeAuthRefresh` phase/timestamp/error data. Successful API-key and OAuth setup still records `lastValidation`, but the workspace only reports ready after a bridge auth refresh succeeds; failed refreshes keep `required.satisfied` true while leaving the workspace locked with a specific failure reason.

Added the bridge-side enforcement in `src/web/bridge-service.ts` and `web/app/api/session/command/route.ts`. The command helper now classifies RPC inputs, allows read-only state/status requests through, and rejects mutating commands with a structured locked response (`code: "onboarding_locked"`, 423 status, and a reason tied to shared onboarding state). That closes the direct-post bypass while preserving `/state`-style inspection during setup.

Implemented controlled bridge auth refresh via bridge restart. Because the RPC surface does not expose a live auth reload command, successful onboarding now restarts the project bridge service and waits for it to come back on the new auth view before prompts are permitted. If restart/reattach fails, onboarding exposes `bridge_refresh_failed` with redacted error text and keeps the lock in place.

Expanded the proof in both test surfaces. The route-level contract test now covers blocked prompt bypasses, allowed read-only `get_state` while locked, successful bridge-refresh unlocks, and inspectable refresh failures. The integration file now simulates the real stale-bridge sequence: boot without auth, block the pre-setup prompt, validate auth, restart the bridge, and confirm the first unlocked prompt succeeds against the refreshed child; it also proves refresh failures remain locked and diagnosable.

## Verification

Passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
- `npm run build:web-host`

Verified in automated coverage:
- direct `POST /api/session/command` prompt attempts return a structured 423 locked response instead of reaching the bridge
- read-only `get_state` remains available while onboarding is locked
- successful `save_api_key` persists auth, restarts the bridge, flips `bridgeAuthRefresh.phase` to `succeeded`, and allows the first prompt on the restarted child
- failed bridge refresh leaves `required.satisfied: true` but keeps the workspace locked with `lockReason: bridge_refresh_failed` and a redacted bridge-refresh error

Slice-level partial status:
- Real fresh-profile browser pass of `gsd --web` remains open for T03, which owns the locked-shell UI and browser/UAT proof

## Diagnostics

Inspect later via:
- `GET /api/boot` → `onboarding.lockReason`, `onboarding.bridgeAuthRefresh`, `onboarding.lastValidation`, and `onboardingNeeded`
- `POST /api/onboarding` with `save_api_key` → 200 on full unlock, 422 on validation failure, 503 when credential validation succeeded but bridge auth refresh failed
- `POST /api/session/command` while locked → 423 response with `code: "onboarding_locked"` and `details.reason`
- `src/tests/web-onboarding-contract.test.ts` for route-level gate/diagnostic proof
- `src/tests/integration/web-mode-onboarding.test.ts` for stale-bridge restart and refresh-failure coverage

## Deviations

Updated `web/lib/gsd-workspace-store.tsx` type definitions so the web client contract reflects the new onboarding and blocked-command payload fields, even though T03 still owns the visible locked-shell UX that will consume them.

## Known Issues

- The locked onboarding shell and browser-visible setup flow are still pending in T03.
- The slice’s real browser validation run (`gsd --web` fresh profile → locked gate → failed validation → successful unlock → first live prompt) is still pending T03.

## Files Created/Modified

- `src/web/onboarding-service.ts` — added `lockReason`/`bridgeAuthRefresh` state and bridge-auth refresh after successful setup
- `src/web/bridge-service.ts` — added read-only-vs-mutating command gating and controlled bridge restart for auth refresh
- `web/app/api/session/command/route.ts` — returns 423 structured lock responses instead of forwarding blocked prompt/session mutations
- `web/app/api/onboarding/route.ts` — surfaces bridge-refresh failure as a distinct onboarding response state/status
- `web/lib/gsd-workspace-store.tsx` — synced client-side typings to the richer onboarding and blocked-command payload contracts
- `src/tests/web-onboarding-contract.test.ts` — added lock-bypass, read-only allowance, refresh-success, and refresh-failure coverage
- `src/tests/integration/web-mode-onboarding.test.ts` — added stale-bridge restart proof and failed-refresh lock retention coverage
- `.gsd/DECISIONS.md` — recorded the controlled-restart + inspectable lock-state decision for post-setup auth sync
