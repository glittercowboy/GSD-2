# S02 (Browser Update UI) — Research

**Date:** 2026-03-18

## Summary

This slice adds browser-visible update notification and an in-app update trigger for GSD. The existing `src/update-check.ts` provides `compareSemver()` and the npm registry fetch logic. The existing `src/update-cmd.ts` uses synchronous `execSync` which cannot be used in the browser context (D082). The web server process inherits `GSD_VERSION` from the loader (set in `src/loader.ts:93`), so the current version is available via `process.env.GSD_VERSION` in API routes.

The implementation needs four artifacts: a server-side update service, a GET/POST API route pair, an `UpdateBanner` component, and a one-line integration into `app-shell.tsx`. The version check is a simple npm registry fetch; the update trigger spawns `npm install -g gsd-pi@latest` as a child process with in-memory status tracking. No SSE streaming is needed — the banner can poll the GET endpoint during an active update.

## Recommendation

Build a thin `src/web/update-service.ts` that re-implements the version check inline rather than importing from `src/update-check.ts`. The update-check module uses `.js` extension imports (`import { appRoot } from './app-paths.js'`) which may cause Turbopack resolution issues per the project knowledge base. The version check is ~20 lines (fetch npm registry, compare semver) and avoids any import chain risk. For `compareSemver()`, it's a pure function — copy it or import it directly since it has no transitive imports.

Track update status with a module-level singleton object in the update service (`idle | running | success | error`). The GET endpoint returns version info + update status; the POST endpoint spawns the child process and returns 202 immediately. The banner polls GET while status is `running`.

## Implementation Landscape

### Key Files

- `src/update-check.ts` — Has `compareSemver()` (pure, no deps — safe to import) and `checkForUpdates()` with npm registry fetch pattern. Cache logic (`~/.gsd/.update-check`) is useful but not required for the web UI since the banner checks on page load, not every 24h.
- `src/update-cmd.ts` — Has `runUpdate()` using `execSync('npm install -g gsd-pi@latest')`. This is the **anti-pattern** for web — shows what NOT to do. The web version must use `spawn()` async.
- `src/web/bridge-service.ts` — `resolveBridgeRuntimeConfig()` provides `packageRoot` for reading `package.json`. API route pattern: import from `../../../../src/web/<service>.ts`, use `resolveProjectCwd(request)`.
- `web/app/api/doctor/route.ts` — Clean GET/POST API route pattern to follow. Uses `runtime = "nodejs"`, `dynamic = "force-dynamic"`, try/catch with 500 error responses.
- `web/components/gsd/app-shell.tsx` — `WorkspaceChrome()` is the main layout. The error banner (`workspace-error-banner`) at line ~210 shows the exact insertion point — the update banner goes between the header and the error banner (or just below the header). The component already imports from `@/lib/gsd-workspace-store` and uses `toast` from sonner.
- `web/lib/settings-types.ts` — Browser-safe type pattern. Update types are simple enough to colocate in the service or a small type file.
- `src/loader.ts:90-94` — Sets `process.env.GSD_VERSION` from `package.json`. This env var is inherited by the web server process via `src/web-mode.ts:577` (`...(deps.env ?? process.env)`).
- `src/web-mode.ts:576-590` — Shows env propagation to web server. `GSD_VERSION` flows through because the web server inherits the parent process env.

### Build Order

1. **`src/web/update-service.ts`** — Core logic: `checkForUpdate()` (fetch npm registry, return `{ currentVersion, latestVersion, updateAvailable }`), `triggerUpdate()` (spawn child process, track status), `getUpdateStatus()` (return current state). Import `compareSemver` from `../update-check.ts` (it's a pure function with zero transitive deps). Module-level state for the in-flight update process. This unblocks both the route and the component.

2. **`web/app/api/update/route.ts`** — GET returns version check + update status JSON. POST triggers update, returns 202. Follow the doctor route pattern. This unblocks the component.

3. **`web/components/gsd/update-banner.tsx`** — Client component. Fetches `GET /api/update` on mount. Conditionally renders a banner when `updateAvailable=true`. "Update" button fires `POST /api/update`, then polls GET every 2-3s until status leaves `running`. Shows success/error feedback inline.

4. **Wire into `app-shell.tsx`** — Import `UpdateBanner`, render it between the `<header>` and the error banner div. One-line addition.

### Verification Approach

- `npm run build:web-host` exits 0 — confirms no type errors or import issues
- Manual browser verification: navigate to running web mode, confirm banner appears (or doesn't if on latest)
- To force-test: temporarily hardcode a lower `currentVersion` in the service and confirm banner renders
- POST trigger: click Update, confirm status transitions through `running → success` or `running → error`
- Check that the GET endpoint returns correct JSON shape: `{ currentVersion: string, latestVersion: string, updateAvailable: boolean, updateStatus: string, error?: string }`

## Constraints

- `compareSemver` from `src/update-check.ts` is safe to import directly — it's a pure function with no transitive dependencies. But `checkForUpdates()` imports `appRoot` from `./app-paths.js` (`.js` extension) — don't import the full module in components, only in the Node.js API route service.
- The update service (`src/web/update-service.ts`) runs only in API routes (`runtime = "nodejs"`) — it must NOT be imported by any client component. The component fetches via `fetch('/api/update')`.
- `npm install -g` may require elevated permissions on some systems. The service should capture stderr and surface meaningful error messages rather than generic "update failed".
- The update process singleton must be module-level (not per-request) so status persists across GET polls while the child process runs.

## Common Pitfalls

- **Importing update-check.ts into client components** — The module uses Node.js `fs` and `path`. Only the API route service should touch it. The banner component must use `fetch()` exclusively.
- **Blocking on child process** — `execSync` would freeze the Next.js server. Must use `spawn()` from `child_process` with event listeners on `close`/`error`. The POST handler returns 202 immediately; status is tracked in-memory.
- **Multiple concurrent update triggers** — If the user clicks "Update" twice, the service should reject the second POST with a 409 if an update is already `running`.
- **Version after update** — After `npm install -g` completes, `process.env.GSD_VERSION` still holds the old version (it was set at process startup). The service should note that a restart is needed to pick up the new version. The banner should show "Update complete — restart GSD to use vX.Y.Z" rather than re-checking the registry.
