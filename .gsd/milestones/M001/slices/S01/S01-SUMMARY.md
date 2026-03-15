---
id: S01
parent: M001
milestone: M001
provides:
  - Browser-only `gsd --web` launch, packaged standalone host staging, same-origin boot/command/SSE bridge routes, and a shared browser workspace store wired to real current-project/session state
requires: []
affects:
  - S02
  - S03
  - S04
key_files:
  - src/cli-web-branch.ts
  - src/web-mode.ts
  - src/web/bridge-service.ts
  - src/resources/extensions/env-key-utils.ts
  - scripts/stage-web-standalone.cjs
  - web/app/api/boot/route.ts
  - web/app/api/session/command/route.ts
  - web/app/api/session/events/route.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/sidebar.tsx
  - web/app/layout.tsx
  - src/tests/web-mode-cli.test.ts
  - src/tests/web-bridge-contract.test.ts
  - src/tests/integration/web-mode-runtime.test.ts
key_decisions:
  - D007
  - D008
  - D009
patterns_established:
  - `gsd --web` branches before TUI startup and only reports `status=started` after `/api/boot` is reachable with a ready bridge
  - One project-scoped bridge singleton owns boot state, command forwarding, and SSE fanout for the browser host
  - The browser shell mounts through one shared workspace store that owns `/api/boot`, `/api/session/events`, and `/api/session/command`
observability_surfaces:
  - `[gsd] Web mode startup: status=started|failed ...`
  - `/api/boot`
  - `/api/session/events`
  - launch-critical `data-testid` surfaces in the shell
  - src/tests/integration/web-mode-runtime.test.ts
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T03-SUMMARY.md
duration: ~1 working day
verification_result: passed
completed_at: 2026-03-14T21:45:00-04:00
---

# S01: Web host + agent bridge

**`gsd --web` now launches a real current-project browser workspace backed by a live same-origin bridge, and the preserved shell hydrates against boot/SSE state without opening the TUI.**

## What Happened

T01 made the browser entrypoint real. `src/cli-web-branch.ts` now handles `--web` before any interactive startup path, preserves current-cwd scoping, and hands off to `src/web-mode.ts`. The launcher stages and resolves a concrete standalone host, reuses the existing browser opener, and emits structured launch diagnostics.

During slice completion, the packaged host path was corrected so the staged standalone is rooted at `dist/web/standalone/server.js` instead of silently falling back to `next dev`. The launcher now waits for `/api/boot` to be reachable with a ready bridge before it reports `status=started`, which makes launch diagnostics honest and keeps the browser from opening against a half-started host.

T02 added the project-scoped bridge and same-origin browser contract. `src/web/bridge-service.ts` now owns one current-project subprocess, safe boot payload assembly, command forwarding, and SSE fanout. `web/app/api/boot/route.ts`, `web/app/api/session/command/route.ts`, and `web/app/api/session/events/route.ts` expose that contract to the browser. Boot payloads now include current cwd/session-dir scope, resumable-session metadata, onboarding-needed state, and an inspectable bridge snapshot without leaking secrets.

T03 replaced the launch-time mocks in the preserved shell with one shared client store. `web/lib/gsd-workspace-store.tsx` now owns boot loading, SSE subscription, command posting, and launch-critical terminal/status/session state. The sidebar, status bar, and terminal read that shared state instead of isolated local placeholders.

The remaining work on this slice was mostly runtime hardening driven by the real integration test:

- extracted the env-key detection helper so boot-time workspace parsing no longer drags the secure-env TUI stack into the web host
- flattened standalone staging so packaged launches actually use the staged host contract
- changed the bridge subprocess entrypoint to the root GSD loader in RPC mode for repo-checkout correctness
- moved workspace indexing for `/api/boot` to a one-shot child-process TS loader seam instead of in-host jiti loading
- fixed the standalone client crash in `web/components/gsd/sidebar.tsx` where the Lucide `Map` icon shadowed the global `Map` constructor inside a `useMemo`
- removed local Vercel Analytics injection from the standalone layout so the local host stays focused on the actual product contract

With those fixes in place, the launch/runtime proof is now green end-to-end: `gsd --web` exits cleanly, the host answers `/api/boot` with a ready bridge session, SSE emits `bridge_status`, and the browser-visible shell renders the live connection/scope/session surfaces instead of an exception screen.

## Verification

Passed:

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts src/tests/web-bridge-contract.test.ts src/tests/integration/web-mode-runtime.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts --test-name-pattern "launch failure"`
- `npm run build:web-host`
- manual temp-home runtime repro:
  - `HOME=<temp> PATH=<fake-open>:$PATH node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/loader.ts --web`
  - verified clean exit plus `[gsd] Web mode startup: status=started ...`
- manual backend checks against a fresh standalone host:
  - `GET /api/boot` returned `bridge.phase === "ready"` and a non-empty `activeSessionId`
  - `GET /api/session/events` emitted `bridge_status` and live session state
- manual browser validation on a fresh standalone host after the final sidebar fix:
  - the page rendered the preserved shell instead of the generic client-side exception screen
  - the connection pill, sidebar scope, terminal banner, and status bar unit all reflected live bridge/current-project state

## Requirements Advanced

- R004 — S01 now provides the live boot/command/SSE browser bridge that the later browser-only workflow slices will build on.
- R009 — launch startup reporting is now gated on real boot readiness instead of process spawn alone.

## Requirements Validated

- R001 — Verified by the CLI launch-path tests plus the real temp-home `gsd --web` runtime repro: browser mode starts, auto-opens the workspace, and does not launch the TUI.
- R003 — Verified by `/api/boot` and the runtime test: launch enters the current project’s browser workspace with the correct cwd-scoped session directory and active workspace state.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- The staged standalone host had to be flattened to match Next’s real output instead of the originally assumed copy layout.
- The bridge subprocess entrypoint had to move up to the root GSD loader in RPC mode rather than the lower-level `pi-coding-agent` CLI.
- Workspace indexing for `/api/boot` now runs through a one-shot child-process TS loader seam instead of in-host runtime loading.

## Known Limitations

- Auto dashboard data still uses the empty/default shape at boot; S01 proves launch + bridge state, not full auto dashboard fidelity.
- Route-contract tests still emit a non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning from `web/package.json`.
- Browser onboarding, focused interrupt handling, broader live view-model replacement, workflow controls, and continuity/recovery still belong to later slices.

## Follow-ups

- S02: add the browser onboarding gate and credential validation flow on top of the now-working launch/bridge foundation.
- S03: replace the remaining focused prompt/terminal interaction gaps with the live request/response surface already exposed by the bridge.
- Optional cleanup later: replace the workspace-index child-process seam with a lighter shared parser path once the web-mode runtime shape settles.

## Files Created/Modified

- `src/resources/extensions/env-key-utils.ts` — extracted a lightweight env-key helper so boot-time parsing stays out of the secure-env TUI graph.
- `src/resources/extensions/get-secrets-from-user.ts` — now imports/re-exports the extracted env-key helper.
- `src/resources/extensions/gsd/files.ts` — now depends on the lightweight env-key helper.
- `src/resources/extensions/gsd/milestone-id-utils.ts` — extracted pure milestone helpers used by workspace/state parsing.
- `src/resources/extensions/gsd/state.ts` — switched to the pure milestone helper module.
- `src/resources/extensions/gsd/workspace-index.ts` — switched to the pure milestone helper module.
- `src/web-mode.ts` — now waits for boot readiness before reporting launch success.
- `src/web/bridge-service.ts` — now shells out once for workspace indexing, uses the root GSD loader as the repo-checkout RPC subprocess entrypoint, and hardens bridge startup for real temp-home launches.
- `scripts/stage-web-standalone.cjs` — now stages a flattened standalone host rooted at `dist/web/standalone/server.js`.
- `web/package.json` — corrected the raw standalone script path for local web builds.
- `web/app/layout.tsx` — removed local Vercel Analytics injection from the standalone host layout.
- `web/components/gsd/sidebar.tsx` — fixed the `Map` icon/global `Map` constructor collision that caused the standalone client crash.
- `src/tests/web-mode-cli.test.ts` — aligned launch tests with boot-readiness waiting and the corrected standalone script path.
- `src/tests/integration/web-mode-runtime.test.ts` — updated the runtime assertions to check the live current milestone/slice contract instead of stale hard-coded task scope.
- `.gsd/DECISIONS.md` — recorded D009 for the bridge subprocess entrypoint.

## Forward Intelligence

### What the next slice should know
- The launch/bridge backend is now the solid part of web mode. `/api/boot`, `/api/session/events`, and `/api/session/command` are real and exercised by the runtime test.
- The preserved shell can now render against that live state; S02 can build on the real workspace instead of another mock bootstrap.

### What's fragile
- The bridge still computes workspace index through a one-shot child process. It works, but it is not the final elegance pass.
- The web package still emits a module-type warning in route tests. It is harmless today but noisy.

### Authoritative diagnostics
- `src/tests/integration/web-mode-runtime.test.ts` — best end-to-end proof of launch + boot + SSE + browser hydration.
- `/api/boot` — best backend truth source for current-project scope and bridge lifecycle state.
- `[gsd] Web mode startup: status=...` — best launch-layer signal for whether web mode really became usable.

### What assumptions changed
- “Process spawned” is not a sufficient definition of web-mode startup — the launcher now waits for a ready boot contract.
- “The raw `pi-coding-agent` RPC CLI is the right bridge subprocess” — false in this repo checkout; the GSD loader’s RPC path is the stable runtime seam here.
