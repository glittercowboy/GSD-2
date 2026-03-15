---
id: T03
parent: S02
milestone: M001
provides:
  - Locked onboarding UI inside the preserved web shell, backed by shared store actions/phases instead of boot-only state.
key_files:
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/onboarding-gate.tsx
  - web/components/gsd/status-bar.tsx
  - src/tests/integration/web-mode-onboarding.test.ts
key_decisions:
  - Kept the existing shell chrome visible and blocked it with an absolute onboarding gate instead of swapping to a separate route.
  - Let the workspace store own onboarding fetch/mutate/poll behavior, while `/api/boot` remains the full bridge/session resync surface after successful setup.
patterns_established:
  - Server-owned onboarding state mirrored into a client store with explicit save/flow actions plus active-flow polling.
  - Onboarding failures promoted into shared UI status/error surfaces through `getStatusPresentation` and `getVisibleWorkspaceError`.
observability_surfaces:
  - `/api/boot` and `/api/onboarding`
  - `web/lib/gsd-workspace-store.tsx` onboarding request state, terminal seed lines, and shared status helpers
  - Browser-visible test ids on the locked shell gate (`onboarding-gate`, `onboarding-validation-message`, `terminal-command-input`)
duration: 3h 39m
verification_result: partial
completed_at: 2026-03-14T23:40:56Z
blocker_discovered: false
---

# T03: Wire the locked onboarding shell and prove the first-run browser flow

**Added a real locked onboarding overlay inside the preserved shell, wired the client store to onboarding routes and phases, and extended runtime coverage up to the point where fresh-profile `gsd --web` startup still blocks the final browser proof.**

## What Happened

The web workspace store now owns onboarding request state in addition to boot state. It can refresh onboarding state, save/validate API keys, start or continue provider flows, cancel flows, merge locked-command responses back into boot state, and poll active browser-auth flows until they settle. Successful setup paths resync the full boot payload so the shell picks up refreshed bridge/session state without a manual restart.

The shell itself stayed intact. Instead of replacing the route, I added `web/components/gsd/onboarding-gate.tsx` as a blocking overlay that keeps the existing header/sidebar/status bar visible behind it. The gate renders required-provider selection, API-key validation, browser-sign-in flow state, redacted validation feedback, bridge-refresh failure feedback, and explicitly skippable optional integrations. Terminal input is now disabled while onboarding is locked, and the shared status/error surfaces in the header/sidebar/status bar now reflect onboarding lock, validation failure, and bridge-refresh failure instead of only bridge/client errors.

For proof, I extended `src/tests/integration/web-mode-onboarding.test.ts` with a real-browser/runtime case and added a test-only validator seam (`GSD_WEB_TEST_FAKE_API_KEY_VALIDATION=1`) in `src/web/onboarding-service.ts` so child-process runtime tests can drive failed-then-successful browser validation deterministically without real provider secrets. The new browser/runtime test is written, but the fresh-profile `gsd --web` child process still times out before emitting the web startup line, so the final end-to-end browser proof is not yet green.

## Verification

Passed:

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- `npm run build:web-host`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
  - route/runtime harness checks still pass:
    - `successful browser onboarding restarts the stale bridge child and unlocks the first prompt`
    - `refresh failures keep the workspace locked and expose the failed bridge-refresh reason`

Still failing:

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
  - new browser/runtime proof `fresh gsd --web browser onboarding stays locked on failed validation and unlocks after a successful retry`
  - failure mode: the fresh-profile `gsd --web` child process times out before printing `[gsd] Web mode startup: status=started ...`, so the test never reaches the browser assertions.

Manual fresh-profile browser pass was not completed for the same launcher-startup reason.

## Diagnostics

Inspect later via:

- `GET /api/boot` → `onboarding`, `onboardingNeeded`, `onboarding.lockReason`, `onboarding.lastValidation`, `onboarding.bridgeAuthRefresh`
- `GET /api/onboarding` / `POST /api/onboarding` → provider state, flow state, redacted validation results
- `web/lib/gsd-workspace-store.tsx`
  - `refreshOnboarding`, `saveApiKey`, `startProviderFlow`, `submitProviderFlowInput`, `cancelProviderFlow`
  - `getOnboardingPresentation`, `getVisibleWorkspaceError`
- Browser surfaces:
  - `[data-testid="onboarding-gate"]`
  - `[data-testid="onboarding-validation-message"]`
  - `[data-testid="terminal-command-input"]`
  - `[data-testid="workspace-connection-status"]`
- `src/tests/integration/web-mode-onboarding.test.ts` for the new runtime-launch/browser proof scaffold and its current timeout point

## Deviations

- Added the test-only env seam `GSD_WEB_TEST_FAKE_API_KEY_VALIDATION=1` in `src/web/onboarding-service.ts` so child-process runtime/browser tests can deterministically exercise failed and successful validation without real secrets.

## Known Issues

- Fresh-profile `gsd --web` launch from the integration/browser harness still times out before the CLI emits its `status=started` web-mode line. This currently blocks the final automated browser proof and the requested fresh-profile manual browser pass.
- Because of that launch timeout, slice-level verification is only partial even though the client onboarding shell/store wiring and route-level coverage are in place.

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — added onboarding request/actions, active-flow polling, status/error helpers, and locked-command onboarding state merge logic.
- `web/components/gsd/onboarding-gate.tsx` — added the blocking onboarding overlay with required-provider setup, browser-flow UI, and optional-integration presentation.
- `web/components/gsd/app-shell.tsx` — mounted the onboarding gate over the preserved shell and switched shell error handling to the shared visible-error helper.
- `web/components/gsd/status-bar.tsx` — surfaced onboarding validation/refresh failures through the shared error helper.
- `web/components/gsd/sidebar.tsx` — surfaced onboarding validation/refresh failures through the shared error helper.
- `web/components/gsd/terminal.tsx` — disabled terminal input while locked, added onboarding-aware placeholder text, and exposed a stable command-input test id.
- `src/web/onboarding-service.ts` — added the test-only fake API-key validator seam for browser/runtime proof.
- `src/tests/integration/web-mode-onboarding.test.ts` — added the real `gsd --web` browser/runtime proof scaffold and current failing launch check.
