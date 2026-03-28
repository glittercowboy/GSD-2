---
phase: quick
plan: 260328-uzr
subsystem: auth
tags: [bug-fix, auth, session, tailscale]
dependency_graph:
  requires: []
  provides: [correct-password-hash-read, session-secret-rotation, removed-security-hole]
  affects: [src/web-mode.ts, src/app-paths.ts, web/app/api/settings/password/route.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src/app-paths.ts
    - src/web-mode.ts
    - web/app/api/settings/password/route.ts
  deleted:
    - web/app/api/auth/set-password/route.ts
decisions:
  - webAuthPath added to app-paths.ts as canonical path for ~/.gsd/web-auth.json
  - process.env.GSD_WEB_SESSION_SECRET updated inline after rotateSessionSecret to avoid stale proxy secret
  - /api/auth/set-password deleted — unauthenticated endpoint superseded by /api/settings/password
metrics:
  duration: ~3 minutes
  completed: 2026-03-28
  tasks_completed: 3
  files_changed: 3
---

# Quick Task 260328-uzr: Fix 3 Integration Gaps from v1.0 Audit Summary

**One-liner:** Fixed three auth integration gaps: wrong file for password hash lookup, stale session secret after rotation, and orphaned unauthenticated set-password endpoint.

## Objective

Fix 3 integration gaps discovered in the v1.0 audit that would cause the Tailscale password gate to silently fail, allow old session secrets to remain valid after password changes, and leave an unauthenticated security hole.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Fix readPasswordHashFromPrefs to read web-auth.json | 310dd23d | src/app-paths.ts, src/web-mode.ts |
| 2 | Update process.env.GSD_WEB_SESSION_SECRET after secret rotation | 8fe5cbf7 | web/app/api/settings/password/route.ts |
| 3 | Delete orphaned unauthenticated set-password route | 35603098 | web/app/api/auth/set-password/route.ts (deleted) |

## Changes Made

### Task 1: Fix password hash file path

`src/app-paths.ts` — added `webAuthPath` export:
```typescript
export const webAuthPath = join(appRoot, 'web-auth.json')
```

`src/web-mode.ts` — updated import to include `webAuthPath as defaultWebAuthPath` and changed `readPasswordHashFromPrefs` default parameter from `defaultWebPreferencesPath` to `defaultWebAuthPath`. The Tailscale password gate now reads from the correct file (`~/.gsd/web-auth.json`) where `setPassword()` stores the hash, rather than `web-preferences.json` which never contained a password hash.

### Task 2: Propagate rotated secret to running proxy

`web/app/api/settings/password/route.ts` — added one line after `getOrCreateSessionSecret()`:
```typescript
process.env.GSD_WEB_SESSION_SECRET = newSecret;
```

This ensures the proxy middleware (which reads `process.env.GSD_WEB_SESSION_SECRET` at request time) immediately uses the new secret after a password change, without requiring a server restart. Aligns the authenticated settings route with the pattern already present in the now-deleted set-password route.

### Task 3: Remove orphaned unauthenticated endpoint

Deleted `web/app/api/auth/set-password/route.ts` and its containing directory. This endpoint lived under `/api/auth/*` which the middleware exempts from session checks, making it callable without authentication. It was an early prototype superseded by `/api/settings/password` (which requires auth). No component referenced it.

## Verification Results

1. `grep -rn "web-preferences" src/web-mode.ts` — no match (wrong path reference removed)
2. `grep -n "GSD_WEB_SESSION_SECRET" web/app/api/settings/password/route.ts` — one match at line 44
3. `test ! -f web/app/api/auth/set-password/route.ts` — file does not exist
4. TypeScript: pre-existing monorepo environment errors only (missing workspace packages not installed in dev); no new errors introduced by these changes

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- src/app-paths.ts — modified, exports webAuthPath
- src/web-mode.ts — modified, imports defaultWebAuthPath, uses as default param
- web/app/api/settings/password/route.ts — modified, assigns GSD_WEB_SESSION_SECRET
- web/app/api/auth/set-password/route.ts — deleted
- Commits: 310dd23d, 8fe5cbf7, 35603098 — all present in git log
