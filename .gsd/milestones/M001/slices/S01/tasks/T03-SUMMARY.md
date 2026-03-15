---
id: T03
parent: S01
milestone: M001
provides:
  - Shared live workspace client/store plus launch-critical shell wiring for `/api/boot`, `/api/session/events`, and `/api/session/command`; runtime launch proof still pending because the spawned host never became reachable under the integration harness
key_files:
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/app-shell.tsx
  - web/app/page.tsx
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/status-bar.tsx
  - web/components/gsd/terminal.tsx
  - src/web/bridge-service.ts
  - src/project-sessions.ts
  - src/cli-web-branch.ts
  - src/tests/integration/web-mode-runtime.test.ts
  - web/package.json
key_decisions:
  - none
patterns_established:
  - One browser-scoped workspace store owns boot fetch, SSE connection state, terminal event summarization, and command posting instead of per-component transport glue
  - The browser-only shell is now mounted through a client-only `app-shell` wrapper so the preserved skin does not go through Next prerender/SSR paths it does not need
  - Bridge fallback loading now uses a runtime loader seam plus a small extracted project-session-path helper so the Next route bundle does not import the CLI web branch directly
observability_surfaces:
  - Visible shell status surfaces: header connection pill, sidebar scope/error block, terminal session banner/log, and status bar unit/error fields
  - `data-testid` markers on the launch-critical shell for runtime/browser verification
  - `src/tests/integration/web-mode-runtime.test.ts`
duration: ~3h
verification_result: partial
completed_at: 2026-03-14T17:23:00-04:00
blocker_discovered: false
---

# T03: Connect the existing shell to the live bridge and prove runtime launch

**Wired the preserved shell to a shared live bridge client and made the web host buildable again, but the real `gsd --web` launch proof is still red because the launched host never became reachable at `/api/boot` during the runtime test.**

## What Happened

I added `web/lib/gsd-workspace-store.tsx` as the browser transport/state seam for S01. It loads `/api/boot`, owns the `EventSource` connection to `/api/session/events`, posts `/api/session/command`, tracks boot/connection/error/session state, and records a live terminal log without replaying raw message contents from the bridge.

The preserved shell now consumes that shared state on the launch-critical surfaces called out in the task plan. `web/components/gsd/sidebar.tsx` renders the real workspace index and active scope, `web/components/gsd/status-bar.tsx` renders live branch/model/unit/error state, and `web/components/gsd/terminal.tsx` renders live bridge/session events and sends commands through the shared store instead of the old local simulation. The page shell was moved into `web/components/gsd/app-shell.tsx`, and `web/app/page.tsx` now mounts that browser-only shell through a client-only wrapper so the integrated web workspace no longer fails during Next prerender.

While getting the host/build path working, I had to clean up two server-side seams from T02 so the Next app could actually build again: `src/project-sessions.ts` now owns the project-session-dir helper that had previously lived only in `src/cli-web-branch.ts`, and `src/web/bridge-service.ts` now runtime-loads the GSD source modules for auto/workspace indexing without forcing the Next bundle to statically resolve that whole graph through the route handlers.

The remaining gap is the runtime proof. The integration test was upgraded from the placeholder to a real launcher/boot/SSE/browser flow, but it still fails. After the package graph and standalone web host are built, `gsd --web` emits a successful startup line with a port/URL, yet `/api/boot` never becomes reachable before the timeout. I stopped here per the hard timeout instruction rather than keep debugging without leaving durable state.

## Must-Haves Status

- [x] The browser shell reads shared live state instead of isolated local startup/session mocks for the launch path.
- [x] Connection and bridge failure state are visible in-browser on the launch-critical surfaces touched here.
- [ ] A real runtime test proves `gsd --web` launches the host, serves the current project, and attaches the shell to live bridge state.

## Verification

- Passed: `npm --prefix web run build`
- Passed: `npm run build:web-host`
- Failed: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-runtime.test.ts`
  - Current failure: the test times out waiting for `http://127.0.0.1:<port>/api/boot` after the launcher reports `status=started`
  - Earlier failure on the same test path: source-loader launch could not resolve `@gsd/pi-coding-agent/dist/index.js` until the package graph bootstrap in the test was narrowed to `build:pi`
- Not rerun: slice-level combined verification command, because the task-level runtime proof remains red

## Diagnostics

- The shell now exposes launch-critical runtime state visibly in-browser:
  - header: `data-testid="workspace-connection-status"`, `workspace-project-cwd`, `workspace-scope-label`
  - sidebar: `data-testid="sidebar-current-scope"`, `sidebar-bridge-error`
  - terminal: `data-testid="terminal-session-banner"`, `terminal-line`
  - status bar: `data-testid="status-bar-unit"`, `status-bar-error`
- The packaged standalone host stages successfully at `dist/web/standalone/server.js`
- The current runtime failure signature is: launcher reports success on stderr, but the host never serves `/api/boot` before the integration timeout
- The recovery entrypoint for finishing this task is `src/tests/integration/web-mode-runtime.test.ts` plus the launch path in `src/web-mode.ts`

## Deviations

- Added `web/components/gsd/app-shell.tsx` and changed `web/app/page.tsx` to a thin client-only wrapper so the browser-only shell avoids the Next prerender path
- Added `src/project-sessions.ts` and rewired `src/cli-web-branch.ts` / `src/web/bridge-service.ts` to share that helper without importing the CLI web branch into the Next route bundle
- `web/lib/gsd-workspace-store.ts` from the task plan became `web/lib/gsd-workspace-store.tsx` because it owns the React provider/context in addition to the store implementation

## Known Issues

- `src/tests/integration/web-mode-runtime.test.ts` is still failing because the launched host never becomes reachable at `/api/boot` despite the launcher reporting `status=started`
- Slice-level verification was not rerun after the task-level runtime proof failed
- T03 is not complete yet; the checkbox in `S01-PLAN.md` remains unchecked intentionally
- Most likely next step: instrument or otherwise prove actual host readiness in `src/web-mode.ts` / the packaged standalone path before trusting the `status=started` launch signal in the integration test

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — added the shared browser workspace store/provider, boot fetch, SSE lifecycle, command posting, and live terminal/event state
- `web/components/gsd/app-shell.tsx` — added the browser-only shell wrapper that wires the preserved skin to the shared store
- `web/app/page.tsx` — reduced the route entrypoint to a client-only wrapper for the browser shell
- `web/components/gsd/sidebar.tsx` — replaced mock milestone/task data with live workspace index, scope, and error state
- `web/components/gsd/status-bar.tsx` — replaced placeholder branch/model/unit metrics with live workspace/bridge state
- `web/components/gsd/terminal.tsx` — replaced simulated terminal output with live bridge status/event lines and command posting
- `src/project-sessions.ts` — extracted the project-scoped session-dir helper from the CLI branch
- `src/cli-web-branch.ts` — now imports the extracted session-dir helper instead of owning it inline
- `src/web/bridge-service.ts` — stopped importing the CLI web branch directly and added runtime-loaded fallback seams so the Next host can build
- `src/tests/integration/web-mode-runtime.test.ts` — replaced the placeholder with the real launcher/boot/SSE/browser integration proof that currently exposes the remaining host-reachability failure
- `web/package.json` — added the runtime loader dependency needed by the bridge fallback seam
