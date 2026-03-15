---
id: S02
parent: M001
milestone: M001
provides:
  - Browser-first onboarding backed by shared auth truth, same-origin setup routes, server-enforced command gating, bridge-auth refresh, and a locked setup shell inside the preserved web workspace
requires:
  - slice: S01
    provides: Browser host/bridge launch, current-project boot payload, same-origin web routes, and the preserved shell skin wired to live boot/session state
affects:
  - S03
  - S04
  - S05
  - S06
  - S07
key_files:
  - src/web/onboarding-service.ts
  - src/web/bridge-service.ts
  - src/web/web-auth-storage.ts
  - packages/pi-ai/src/web-runtime-env-api-keys.ts
  - web/app/api/onboarding/route.ts
  - web/app/api/session/command/route.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/onboarding-gate.tsx
  - src/tests/web-onboarding-contract.test.ts
  - src/tests/integration/web-mode-onboarding.test.ts
key_decisions:
  - Keep `onboardingNeeded` only as a derived compatibility shim while the structured `onboarding` object remains authoritative
  - Treat successful credential validation as incomplete until the bridge has restarted onto the new auth view
  - Use a node-only web-host env-key shim plus cached workspace indexing to keep the packaged standalone onboarding path bundle-safe and responsive
patterns_established:
  - Server-owned onboarding state reused by `/api/boot`, `/api/onboarding`, and `/api/session/command`
  - Locked-shell onboarding overlay backed by shared workspace-store actions and post-setup boot resync
  - Read-only bridge commands remain available while onboarding is locked; mutating commands return structured 423 lock responses
  - Short-lived workspace-index caching keeps repeated `/api/boot` reads fast enough for packaged browser-mode startup and refresh flows
observability_surfaces:
  - /api/boot
  - /api/onboarding
  - /api/session/command 423 blocked responses
  - onboarding.lastValidation
  - onboarding.bridgeAuthRefresh
  - web/lib/gsd-workspace-store.tsx onboarding request/action state
  - src/tests/web-onboarding-contract.test.ts
  - src/tests/integration/web-mode-onboarding.test.ts
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T03-SUMMARY.md
duration: 6h 19m + packaged-host runtime recovery
verification_result: passed
completed_at: 2026-03-14T21:16:27-0400
---

# S02: First-run setup wizard

**A fresh `gsd --web` user can now complete required setup entirely in-browser: the preserved shell stays visibly locked until required credentials validate, failed validation stays gated with redacted feedback, successful validation refreshes bridge auth, and the first live command succeeds without terminal fallback.**

## What Happened

S02 replaced the S01 boolean onboarding seam with an authoritative shared onboarding service. `src/web/onboarding-service.ts` now owns required-provider state, optional skippable setup, redacted validation feedback, active provider-flow state, and bridge-auth refresh status. `/api/boot` and `/api/onboarding` both read that same state, so the browser gate and the server lock no longer drift.

T02 made the lock real. `web/app/api/session/command/route.ts` now rejects mutating commands with a structured 423 `onboarding_locked` response while still allowing read-only bridge/state inspection. Successful credential setup persists only validated credentials, restarts the bridge onto the new auth view, and exposes `lockReason` plus `bridgeAuthRefresh` so failed refreshes remain diagnosable instead of looking like a generic frozen shell.

T03 finished the visible browser path. The workspace store now owns onboarding fetch/mutate/poll behavior, the preserved shell renders a full-screen onboarding overlay instead of a separate route, terminal input stays disabled while locked, and onboarding validation/refresh state is promoted into shared status/error surfaces. The browser proof now covers failed validation staying locked, successful retry unlocking the shell, and the first live command succeeding from the browser workspace.

The remaining slice blocker turned out to be the packaged standalone host path, not the onboarding contract itself. The standalone bundle was still pulling in a browser-safe dynamic-import helper for env-key detection, which Next converted into runtime `Cannot find module as expression is too dynamic` failures, and repeated `/api/boot` calls were spending too much time recomputing the workspace index. Recovery work replaced the web-host env-key shim with a node-only implementation and cached the workspace index in the bridge boot path. After that, the packaged build went cleanly green and the fresh-profile runtime/browser proof passed.

## Verification

Passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
- `npm run build:web-host`
- Fresh-profile packaged runtime spot-check:
  - `/api/boot` reports `onboarding.locked: true`, `lockReason: "required_setup"`, and `bridgeAuthRefresh.phase: "idle"`
  - `/api/onboarding` exposes structured provider/setup state
  - blocked `POST /api/session/command` prompt attempts return HTTP 423 with `code: "onboarding_locked"` and `details.reason: "required_setup"`

Observability confirmed:
- `/api/boot` exposes `onboarding.lockReason`, `onboarding.lastValidation`, `onboarding.bridgeAuthRefresh`, and `onboardingNeeded`
- `/api/onboarding` returns redacted validation/provider-flow state without stored credential values
- `/api/session/command` returns structured blocked-command diagnostics instead of silent failure
- Browser/runtime proof in `src/tests/integration/web-mode-onboarding.test.ts` exercises both the happy path and failed-refresh path against packaged `gsd --web`

## Requirements Advanced

- R004 — S02 advanced the browser-only primary loop by making first-run setup, gating, auth refresh, and the first unlocked command work inside the browser shell without TUI fallback.
- R010 — Validation failures, blocked-command reasons, and bridge-refresh failures are now visible in-browser and on same-origin diagnostic surfaces instead of failing silently.

## Requirements Validated

- R002 — Validated by the route contract test, the packaged browser/runtime integration test, the clean `build:web-host` pass, and the fresh-profile route spot-check proving locked setup, failed validation retention, successful unlock, and first-command success.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Added `packages/pi-ai/src/web-runtime-env-api-keys.ts` as a node-only web-host shim instead of continuing to reuse the browser-safe dynamic-import helper from the shared pi-ai runtime. This was not in the written slice plan; it was forced by the packaged standalone host converting that helper into runtime module-resolution failures.
- Added short-lived workspace-index caching in `src/web/bridge-service.ts` so repeated packaged-host `/api/boot` reads stop paying the full indexing cost during startup and post-validation refreshes.

## Known Limitations

- S03 still owns focused prompt/interrupt handling beyond onboarding-specific setup requests.
- S04 still owns wiring dashboard, roadmap, files, and activity surfaces fully onto real project/session data instead of the remaining mixed shell state.
- Direct Node-based route tests still emit the non-fatal `MODULE_TYPELESS_PACKAGE_JSON` warning for `web/package.json`; it is noisy but not a slice blocker.

## Follow-ups

- Start S03 by wiring live agent prompt/interrupt rendering into the focused browser panel using the now-proven onboarding lock/state patterns.
- If S04 needs fresher workspace metadata than the current boot cache TTL, add explicit cache invalidation where `.gsd` project structure changes are written.

## Files Created/Modified

- `src/web/onboarding-service.ts` — authoritative onboarding state, validation redaction, provider flows, and bridge-auth refresh coordination
- `src/web/bridge-service.ts` — server boot payload assembly, command gating, bridge restart/auth refresh, and cached workspace indexing for packaged boot performance
- `src/web/web-auth-storage.ts` — web-host credential storage adapter reused by onboarding routes and boot state
- `packages/pi-ai/src/web-runtime-env-api-keys.ts` — node-only env-key lookup shim for the packaged web host
- `web/app/api/onboarding/route.ts` — same-origin onboarding actions for discovery, API-key validation, OAuth flows, and refresh diagnostics
- `web/app/api/session/command/route.ts` — structured onboarding lock enforcement for mutating bridge commands
- `web/lib/gsd-workspace-store.tsx` — onboarding state/actions, lock-state merging, and post-setup boot resync behavior
- `web/components/gsd/onboarding-gate.tsx` — blocking onboarding overlay inside the preserved shell
- `src/tests/web-onboarding-contract.test.ts` — route-level proof for locking, redaction, unlock, and refresh-failure diagnostics
- `src/tests/integration/web-mode-onboarding.test.ts` — packaged `gsd --web` runtime/browser proof for failed validation, successful retry, unlock, and first-command success

## Forward Intelligence

### What the next slice should know
- The onboarding contract itself is solid now. The packaged-host instability was fixed by removing the dynamic-import env-key trap and by caching repeated workspace-index reads in the boot path.
- Boot/onboarding/session-command are now the authoritative same-origin surfaces for web setup state. The browser store simply mirrors and drives them.
- Post-setup unlock depends on a full boot resync, not just a local optimistic flip. That keeps the browser attached to the refreshed bridge state.

### What's fragile
- `src/web/bridge-service.ts` workspace-index cache — it solves the packaged boot timing problem, but later slices that mutate `.gsd` structure in-process may need explicit invalidation instead of waiting for TTL expiry.
- `packages/pi-ai/src/web-runtime-oauth.ts` / OAuth provider imports — the packaged host is currently clean, but broader OAuth-provider bundle behavior is still worth watching as S03/S07 exercise more live flows.

### Authoritative diagnostics
- `src/tests/integration/web-mode-onboarding.test.ts` — this is the authoritative packaged-host/browser proof for the slice, including the fresh-profile retry/unlock path.
- `src/tests/web-onboarding-contract.test.ts` — this is the authoritative contract proof for redaction, lock enforcement, and bridge-refresh diagnostics.
- `/api/boot`, `/api/onboarding`, and blocked `/api/session/command` responses — these are the fastest runtime surfaces for checking whether the browser and server agree on onboarding state.

### What assumptions changed
- “The fresh-profile packaged-host failure is probably just the launcher timing out.” — false; the real causes were a standalone-bundle runtime trap in env-key lookup and a boot path that recomputed workspace state too expensively for the packaged browser proof.
