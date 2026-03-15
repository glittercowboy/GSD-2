---
id: T01
parent: S01
milestone: M001
provides:
  - Browser-only `gsd --web` launch branching with current-cwd session scoping, packaged host resolution, and pre-open failure diagnostics
key_files:
  - src/cli.ts
  - src/cli-web-branch.ts
  - src/web-mode.ts
  - package.json
  - web/next.config.mjs
  - src/tests/web-mode-cli.test.ts
key_decisions:
  - D007: packaged web launches resolve to `dist/web/standalone/server.js` with repo-only source fallback and `GSD_WEB_*` scope handoff
patterns_established:
  - Explicit web-branch handoff before interactive startup via `runWebCliBranch(...)`
  - Standalone-host staging script plus source-dev fallback resolver for local versus packaged launches
  - Structured `[gsd] Web mode startup: status=...` diagnostics emitted before browser open
observability_surfaces:
  - `[gsd] Web mode startup: status=started|failed cwd=... port=... host=... kind=... url=...`
  - `src/tests/web-mode-cli.test.ts`
  - `build:web-host` / `stage:web-host`
duration: ~1h15m
verification_result: passed
completed_at: 2026-03-14T14:01:59-04:00
blocker_discovered: false
---

# T01: Add the browser-only `--web` launch path and host bootstrap

**Added an explicit `gsd --web` startup branch that never falls into TUI startup, launches a concrete web host path for the current project, and emits inspectable launch/failure status before browser open.**

## What Happened

I split the web launch contract out of the general CLI startup path so it can branch before onboarding/model registry/TUI construction. `src/cli-web-branch.ts` now owns explicit `--web` parsing, current-cwd session scoping, legacy flat-session migration reuse, and the web-launch handoff used by `src/cli.ts`.

`src/web-mode.ts` is the new launcher. It resolves a packaged standalone host at `dist/web/standalone/server.js` when present, falls back to the repo-local `web/` dev host for checkout-based work, reserves a localhost port, syncs/reloads GSD resources, passes project scope through `GSD_WEB_*` env vars, reuses `openBrowser(...)` from `src/onboarding.ts`, and emits structured startup/failure status before browser open.

To make the packaged host path concrete, I added standalone output to `web/next.config.mjs`, a staging script at `scripts/stage-web-standalone.cjs`, root scripts `stage:web-host` / `build:web-host`, and a standalone start script in `web/package.json`.

Because this is the first task in the slice, I also created the remaining slice verification files now: `src/tests/web-bridge-contract.test.ts` and `src/tests/integration/web-mode-runtime.test.ts` intentionally fail until T02/T03 land.

I also applied the pre-flight plan fix by adding an explicit failure-path verification step to `.gsd/milestones/M001/slices/S01/S01-PLAN.md`.

## Verification

- Passed: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts`
- Passed: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts --test-name-pattern "launch failure"`
- Partial slice verification run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts src/tests/web-bridge-contract.test.ts src/tests/integration/web-mode-runtime.test.ts`
  - `src/tests/web-mode-cli.test.ts`: passed
  - `src/tests/web-bridge-contract.test.ts`: fails intentionally pending T02
  - `src/tests/integration/web-mode-runtime.test.ts`: fails intentionally pending T03

## Diagnostics

- Launch success/failure is emitted by `src/web-mode.ts` as structured stderr lines beginning with `[gsd] Web mode startup:`.
- Failure states include the resolved host kind/path when available plus the failure reason (`bootstrap:`, `launch:`, `browser-open:`, or missing host resolution).
- The launcher passes `GSD_WEB_HOST`, `GSD_WEB_PORT`, `GSD_WEB_PROJECT_CWD`, `GSD_WEB_PROJECT_SESSIONS_DIR`, `GSD_WEB_PACKAGE_ROOT`, and `GSD_WEB_HOST_KIND` into the host process for later bridge/runtime inspection.
- The startup contract is pinned in `src/tests/web-mode-cli.test.ts`.

## Deviations

- Added `src/cli-web-branch.ts` as a small extraction from `src/cli.ts` so the web launch branch can be tested without requiring the full built agent package graph.
- Created the T02/T03 slice test files now, as failing placeholders, to satisfy the first-task test-frontier requirement.
- Added a failure-path verification bullet to `S01-PLAN.md` before implementation per the pre-flight instruction.

## Known Issues

- `build:web-host` assumes the `web/` app dependencies are installed before it is run; this task defines the staging path but does not yet wire bridge/runtime behavior into the host.
- Full slice verification remains red until T02 and T03 replace the placeholder failing tests with real bridge/runtime coverage.

## Files Created/Modified

- `src/cli.ts` — moved `--web` handling ahead of interactive startup and delegated that path to the new web-branch helper.
- `src/cli-web-branch.ts` — added explicit `--web` parsing/session-scope handling and a testable web launch handoff.
- `src/web-mode.ts` — added host resolution, port reservation, resource bootstrap, env handoff, structured launch diagnostics, and browser open reuse.
- `src/onboarding.ts` — exported `openBrowser(...)` so web mode reuses the existing cross-platform opener.
- `package.json` — added staged web-host scripts and explicit packaged host file inclusion.
- `web/next.config.mjs` — enabled standalone output traced from the repo root.
- `web/package.json` — added `start:standalone` for source-built standalone host startup.
- `scripts/stage-web-standalone.cjs` — stages the Next standalone output into `dist/web/standalone`.
- `src/tests/web-mode-cli.test.ts` — added startup contract coverage for explicit parsing, early branching, packaged resolution, opener reuse, and launch failure diagnostics.
- `src/tests/web-bridge-contract.test.ts` — created the pending T02 bridge-contract test placeholder.
- `src/tests/integration/web-mode-runtime.test.ts` — created the pending T03 runtime test placeholder.
- `.gsd/milestones/M001/slices/S01/S01-PLAN.md` — added failure-path verification and marked T01 complete.
- `.gsd/DECISIONS.md` — recorded the packaged-host resolution decision for downstream web work.
