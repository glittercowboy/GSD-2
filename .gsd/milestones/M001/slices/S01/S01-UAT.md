# S01: Web host + agent bridge — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed
- Why this mode is sufficient: S01 needed both contract-level proof (`/api/boot`, command route, SSE, launch diagnostics) and a real browser proof that the preserved shell renders against live current-project/bridge state without client-side exceptions.

## Preconditions

- Run from the project root: `/Users/sn0w/Documents/dev/GSD-2`
- `npm run build:web-host` has completed successfully so `dist/web/standalone/server.js` exists
- Use a fresh temp HOME or equivalent first-run profile when reproducing launch behavior
- No other `gsd --web` host is already listening on the chosen loopback port

## Smoke Test

1. From the project root, run `gsd --web`.
2. Open the reported loopback URL in a browser.
3. **Expected:**
   - the command exits without opening the TUI
   - stderr includes one structured startup line beginning with `[gsd] Web mode startup: status=started`
   - the browser renders the preserved GSD shell (not the generic application-error screen)
   - the connection pill shows `Bridge connected`

## Test Cases

### 1. Browser-only launch path uses the packaged standalone host

1. Run `gsd --web` from the project root.
2. Capture stderr.
3. **Expected:** stderr contains `status=started`, a loopback URL, and `host=.../dist/web/standalone/server.js`.

### 2. Current-project boot payload is real and project-scoped

1. After launch, request `GET /api/boot` from the reported loopback URL.
2. Inspect the JSON payload.
3. **Expected:**
   - `project.cwd` equals the current project root
   - `project.sessionsDir` is the cwd-scoped `.gsd/sessions/...` path
   - `workspace.active.milestoneId` is `M001`
   - `workspace.active.sliceId` is present
   - `bridge.phase` is `ready`
   - `bridge.activeSessionId` is a non-empty string
   - no secret values appear anywhere in the payload

### 3. SSE bridge stream reports live bridge status

1. Open `GET /api/session/events` with `Accept: text/event-stream`.
2. Read the first event payload.
3. **Expected:** the first event is `bridge_status` and includes `bridge.phase === "ready"` plus a non-empty `activeSessionId`.

### 4. Browser shell renders live launch-critical state

1. Navigate a browser to the reported loopback URL.
2. Wait for the shell to render.
3. **Expected:**
   - the connection pill shows `Bridge connected`
   - the sidebar current-scope block shows the active `M001/S..` scope instead of placeholder data
   - the terminal session banner is no longer stuck on `Waiting for live session`
   - the status bar unit reflects the active GSD scope rather than mock content
   - browser console remains free of client-side exceptions during initial render

### 5. Bridge failure state is inspectable

1. Force a broken bridge subprocess entry or simulate a bridge-start failure.
2. Reload `/api/boot`.
3. **Expected:**
   - `/api/boot` still responds with a bridge snapshot
   - `bridge.phase` is `failed`
   - `bridge.lastError.message` is present and redacted
   - the browser shell surfaces the failure state visibly instead of silently hanging

## Edge Cases

### Fresh temp-home launch

1. Launch `gsd --web` with a fresh temp HOME and a fake browser opener.
2. **Expected:**
   - launch still reports `status=started`
   - `/api/boot` still reaches a ready bridge session
   - `onboardingNeeded` may be `true`, but the host/bridge contract still comes up

### Source checkout without packaged fallback drift

1. Re-run `npm run build:web-host` and confirm the staged output is rooted at `dist/web/standalone/server.js`.
2. **Expected:** the launcher uses the packaged standalone host instead of silently falling back to `next dev`.

## Failure Signals

- `gsd --web` prints `status=failed` or never prints a structured startup line
- `/api/boot` is unreachable, returns non-JSON, or returns `bridge.phase !== "ready"` during the happy path
- `/api/session/events` never emits an initial `bridge_status` event
- the browser shows `Application error: a client-side exception has occurred while loading 127.0.0.1`
- the connection pill never reaches `Bridge connected`
- the sidebar/status bar show placeholder or mock startup data
- browser console records client-side exceptions during initial shell render

## Requirements Proved By This UAT

- R001 — browser-only `--web` launch path with auto-open and no TUI startup
- R003 — launch opens into the current project/cwd workspace
- partial support for R004 — the live browser bridge and rendered shell are now real; later slices still need onboarding, focused interrupts, and broader workflow controls

## Not Proven By This UAT

- R002 — browser onboarding validation is deferred to S02
- R005 — full live replacement of the broader dashboard/files/activity surfaces is deferred to later slices
- R006 / R007 / R010 — focused interrupt handling, continuity, and richer recovery are later-slice work

## Notes for Tester

- The strongest backend truth source is `/api/boot`; the strongest end-to-end truth source is `src/tests/integration/web-mode-runtime.test.ts`.
- If the generic application-error screen reappears, check `web/components/gsd/sidebar.tsx` first; S01 closed with a real client-bundle bug there (`Map` icon shadowing the global `Map` constructor).
