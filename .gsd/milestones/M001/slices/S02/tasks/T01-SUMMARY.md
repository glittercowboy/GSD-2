---
id: T01
parent: S02
milestone: M001
provides:
  - Shared server-side onboarding/auth state for boot and same-origin setup routes, backed by runtime auth truth instead of a web-only boolean heuristic
key_files:
  - src/web/onboarding-service.ts
  - src/web/bridge-service.ts
  - web/app/api/onboarding/route.ts
  - src/tests/web-onboarding-contract.test.ts
  - src/tests/integration/web-mode-onboarding.test.ts
key_decisions:
  - Kept `onboardingNeeded` in `/api/boot` only as a derived compatibility shim while the structured `onboarding` object became the authoritative contract
patterns_established:
  - Server-owned onboarding state with route-level mutations (`GET/POST /api/onboarding`) and boot reuse via one shared service/singleton
observability_surfaces:
  - `/api/boot`, `/api/onboarding`, `onboarding.lastValidation`, and `src/tests/web-onboarding-contract.test.ts`
duration: 1h 35m
verification_result: passed
completed_at: 2026-03-14T14:01:59-04:00
blocker_discovered: false
---

# T01: Establish shared onboarding auth truth and browser setup API

**Replaced the S01 boolean onboarding seam with a shared onboarding service, added `/api/onboarding`, and proved the boot/setup contract for missing auth, env-backed auth, redacted validation failure, and successful API-key persistence.**

## What Happened

Added `src/web/onboarding-service.ts` as the authoritative web-host onboarding model. It now computes required-provider state from real runtime auth truth (`AuthStorage.hasAuth()` plus env-backed auth resolution), exposes explicitly skippable optional sections, tracks redacted `lastValidation`, and manages browser-driven OAuth flow state without introducing a second credential store.

Switched `src/web/bridge-service.ts` boot assembly to consume that shared onboarding state instead of computing `onboardingNeeded` locally. `/api/boot` now returns both the structured `onboarding` object and a derived `onboardingNeeded` compatibility flag so the existing shell/store can keep building while new onboarding consumers stop depending on the boolean seam.

Added `web/app/api/onboarding/route.ts` with same-origin actions for provider discovery/recheck, API-key save+validate, OAuth flow start/continue/cancel, and redacted handled failure responses. API-key validation persists only on success, so failed validation leaves the workspace locked without storing bad credentials.

Created `src/tests/web-onboarding-contract.test.ts` to exercise the contract through the real boot/onboarding routes and added `src/tests/integration/web-mode-onboarding.test.ts` as the first explicit slice-level integration placeholder. That integration test now fails for the real remaining work instead of failing because the file did not exist.

## Verification

Passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- `npm run build:web-host`

Observed/expected partial slice status:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts` → fails intentionally with an explicit message that T02/T03 still need command gating, bridge auth refresh, and the locked-shell browser flow

Contract assertions now cover:
- missing required auth stays locked in both `/api/boot` and `/api/onboarding`
- env-backed runtime auth (`GITHUB_TOKEN` → `github-copilot`) unlocks onboarding and reports `source: environment`
- failed API-key validation stays locked, returns redacted `lastValidation`, and does not persist credentials
- successful API-key validation persists auth and unlocks boot/onboarding state

## Diagnostics

Inspect later via:
- `GET /api/boot` → `onboarding`, `onboardingNeeded`, `onboarding.lastValidation`
- `GET /api/onboarding` / `POST /api/onboarding` → provider discovery, flow state, validation status
- `src/tests/web-onboarding-contract.test.ts` for route-level contract proof
- `src/tests/integration/web-mode-onboarding.test.ts` for the still-open slice integration gap

The primary failure surface added in this task is `onboarding.lastValidation` with redacted error text plus the required/locked status that boot and onboarding routes now share.

## Deviations

Created `src/tests/integration/web-mode-onboarding.test.ts` during T01 even though the runtime/browser flow is not implemented yet, because the slice verification named that file and the first task needs the slice test surface to exist. It currently fails intentionally with a precise message instead of a missing-file error.

## Known Issues

- `/api/session/command` is not gated yet; direct command blocking belongs to T02.
- Bridge auth refresh/reload after successful setup is not implemented yet; also T02.
- The locked-shell UI/browser flow is not wired yet; T03 owns the visible gate and end-to-end browser proof.

## Files Created/Modified

- `src/web/onboarding-service.ts` — shared onboarding/auth truth, optional-section model, validation tracking, and OAuth flow orchestration
- `src/web/bridge-service.ts` — boot payload now includes structured onboarding state and derives `onboardingNeeded` from it
- `web/app/api/onboarding/route.ts` — same-origin onboarding API for discovery, validation, and provider-flow actions
- `web/lib/gsd-workspace-store.tsx` — boot payload types updated to reflect the structured onboarding contract
- `src/tests/web-onboarding-contract.test.ts` — route/boot contract coverage for missing auth, env-backed auth, redaction, and persistence behavior
- `src/tests/integration/web-mode-onboarding.test.ts` — explicit failing slice-level integration placeholder for remaining T02/T03 work
- `.gsd/DECISIONS.md` — recorded the compatibility decision for keeping `onboardingNeeded` as a derived shim
