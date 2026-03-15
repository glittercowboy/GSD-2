---
id: T02
parent: S01
milestone: M001
provides:
  - Project-scoped RPC bridge singleton with same-origin boot, command, and SSE event endpoints for the current web host runtime
key_files:
  - src/web/bridge-service.ts
  - web/app/api/boot/route.ts
  - web/app/api/session/command/route.ts
  - web/app/api/session/events/route.ts
  - src/tests/web-bridge-contract.test.ts
key_decisions:
  - D008: the web host owns one project-scoped RPC subprocess resumed from the project session dir and surfaces its state through boot plus SSE snapshots
patterns_established:
  - Singleton bridge registry keyed by the current `GSD_WEB_*` project scope instead of route-local process startup
  - Boot payloads expose safe resumable-session metadata plus live bridge/session diagnostics without message previews or secret-bearing error text
  - SSE streams deliver synthetic `bridge_status` snapshots alongside agent and `extension_ui_request` events from the authoritative RPC stdout contract
observability_surfaces:
  - /api/boot
  - /api/session/events
  - src/tests/web-bridge-contract.test.ts
  - .gsd/DECISIONS.md
duration: ~1h50m
verification_result: passed
completed_at: 2026-03-14T15:51:48-04:00
blocker_discovered: false
---

# T02: Implement the project-scoped bridge service and same-origin API contract

**Added a single project-scoped bridge service that resumes the current project’s RPC session, powers `/api/boot`, forwards `/api/session/command`, streams `/api/session/events`, and exposes inspectable bridge failure state without leaking secrets.**

## What Happened

I added `src/web/bridge-service.ts` as the server-side seam for browser mode. It resolves the current `GSD_WEB_*` project scope, spawns one long-lived RPC subprocess for that project, resumes from the project session directory with `--continue --session-dir`, tracks the active session snapshot, and records bridge lifecycle state, connection count, last command, and the last sanitized error.

`web/app/api/boot/route.ts` now returns a real boot payload for the current project. It includes project scope, workspace metadata, auto-dashboard data, onboarding-needed state, safe resumable-session metadata, and the live bridge/session snapshot. The resumable-session seam intentionally excludes session text previews so boot payloads do not leak message content or credentials.

`web/app/api/session/command/route.ts` now forwards browser requests to the bridge and returns real RPC responses. `web/app/api/session/events/route.ts` opens an SSE stream that emits synthetic `bridge_status` updates together with agent and `extension_ui_request` events coming from the RPC subprocess.

I replaced the T02 placeholder with a real contract test in `src/tests/web-bridge-contract.test.ts`. The test exercises boot payload shape, singleton bridge reuse, command forwarding, SSE delivery, and failure-state redaction using a fake RPC child process so the contract is pinned without requiring a live model.

## Verification

- Passed: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts`
- Passed: task contract assertions inside `src/tests/web-bridge-contract.test.ts` for:
  - `/api/boot` payload shape and safe resumable-session metadata
  - singleton bridge lifecycle reuse across requests
  - `/api/session/command` request/response forwarding
  - `/api/session/events` SSE delivery of `bridge_status`, agent events, and `extension_ui_request`
  - bridge error/failure redaction and after-session-attachment state
- Partial slice verification run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts src/tests/web-bridge-contract.test.ts src/tests/integration/web-mode-runtime.test.ts`
  - `src/tests/web-mode-cli.test.ts`: passed
  - `src/tests/web-bridge-contract.test.ts`: passed
  - `src/tests/integration/web-mode-runtime.test.ts`: still intentionally failing pending T03
- Passed: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts --test-name-pattern "launch failure"`

## Diagnostics

- `/api/boot` exposes bridge phase, active session id/file, connection count, last command type, session snapshot, and the last sanitized bridge error.
- `/api/session/events` emits `bridge_status` snapshots on connect/disconnect/state changes, plus streamed agent and `extension_ui_request` events.
- `src/tests/web-bridge-contract.test.ts` is the contract map for boot shape, SSE semantics, singleton reuse, and failure redaction.
- Bridge failures record whether they happened before or after session attachment via `bridge.lastError.afterSessionAttachment`.

## Deviations

- I made workspace-index and auto-dashboard resolution lazy inside `src/web/bridge-service.ts` so the contract tests can execute without a prebuilt `@gsd/pi-coding-agent/dist` tree. Runtime behavior still uses the real modules when available, but the bridge no longer hard-imports those stacks at module load.

## Known Issues

- Full slice verification is still red until T03 replaces `src/tests/integration/web-mode-runtime.test.ts` with the real host/runtime integration check.
- Direct Node imports of the web route files emit a non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning during tests because `web/package.json` does not declare `"type": "module"`. The route contract still passes under the current test harness.

## Files Created/Modified

- `src/web/bridge-service.ts` — added the project-scoped bridge singleton, RPC subprocess lifecycle, boot payload builder, safe session listing, SSE event fanout, and failure-state tracking.
- `web/app/api/boot/route.ts` — added the same-origin boot endpoint backed by the bridge service.
- `web/app/api/session/command/route.ts` — added the same-origin command forwarding endpoint backed by the bridge service.
- `web/app/api/session/events/route.ts` — added the SSE event endpoint for bridge status, agent events, and extension UI requests.
- `src/tests/web-bridge-contract.test.ts` — replaced the T02 placeholder with real bridge contract coverage.
- `.gsd/DECISIONS.md` — recorded the bridge lifecycle/session-dir ownership decision as D008.
- `.gsd/milestones/M001/slices/S01/S01-PLAN.md` — marked T02 complete.
- `.gsd/STATE.md` — advanced the next action to T03.
