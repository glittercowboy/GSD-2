---
phase: 16
plan: 02
subsystem: auth
tags: [typescript, tauri, oauth, hooks, keychain]
dependency_graph:
  requires: [16-01]
  provides: [auth-api, useAuthGuard, useTokenRefresh]
  affects: [App.tsx, provider-picker]
tech_stack:
  added: ["@tauri-apps/api@2.10.1"]
  patterns: [dynamic-import-tauri, isTauri-guard, ref-based-closure-fix]
key_files:
  created:
    - packages/mission-control/src/auth/auth-api.ts
    - packages/mission-control/src/auth/useAuthGuard.ts
    - packages/mission-control/src/auth/useTokenRefresh.ts
    - packages/mission-control/src/auth/index.ts
  modified:
    - packages/mission-control/package.json
decisions:
  - "@tauri-apps/api was missing from package.json — added v2.10.1 (Rule 3 auto-fix, required for all auth/ imports)"
  - "useRef-based pendingProvider tracks in-flight OAuth provider so the oauth-callback closure never reads a stale value"
  - "oauth-callback event listener placed in useAuthGuard (not useTokenRefresh) — auth state ownership"
  - "Dynamic import('@tauri-apps/api/core') used so bundlers can tree-shake Tauri internals when building browser bundle"
  - "Pre-existing tsc errors in server/, AppShell, ChatView, SliceView left untouched — out of scope for auth/ tasks"
metrics:
  duration_seconds: 162
  completed_date: "2026-03-13"
  tasks_completed: 4
  files_created: 5
---

# Phase 16 Plan 02: TypeScript Auth API Layer + Hooks Summary

**One-liner:** Tauri IPC bridge + useAuthGuard/useTokenRefresh hooks with isTauri guards, oauth-callback listener, and @tauri-apps/api dependency.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 16-02-01 | Create auth-api.ts with 7 IPC functions + safe fallbacks | 4264f34 |
| 16-02-02 | Create useAuthGuard.ts (keychain check + oauth-callback listener) | c2ad718 |
| 16-02-03 | Create useTokenRefresh.ts (silent token refresh on mount) | 2c901eb |
| 16-02-04 | Create index.ts barrel + add @tauri-apps/api to package.json | 3d75b4b |

## What Was Built

### auth-api.ts
Wraps all 7 Rust commands from Plan 16-01:
- `getActiveProvider` — returns stored provider name or null
- `startOAuth(provider)` — initiates OAuth flow, returns URL + CSRF state
- `completeOAuth(provider, code, state)` — exchanges callback code for tokens
- `saveApiKey(provider, key)` — stores raw API key in OS keychain
- `getProviderStatus()` — reads expiry/refresh metadata from keychain
- `changeProvider()` — clears credentials so user can repick
- `checkAndRefreshToken()` — silently refreshes near-expiry tokens

Each function: uses dynamic `import("@tauri-apps/api/core")` for tree-shaking, guards with `isTauri()`, returns a safe fallback in the catch block.

### useAuthGuard.ts
Returns `{ state, setAuthenticated, setPendingProvider, pendingProvider }`:
- `state` begins as `"checking"`, resolves to `"authenticated"` or `"needs_picker"`
- Calls `getActiveProvider()` on mount
- Sets up `listen("oauth-callback", ...)` — when Rust emits the callback, calls `completeOAuth` then `setAuthenticated`
- Uses `useRef` to avoid stale closure on `pendingProvider`
- Cleanup: `unlistenFn()` on unmount

### useTokenRefresh.ts
Returns `{ checked, needsReauth, provider }`:
- Runs `checkAndRefreshToken()` once on mount
- `needsReauth: true` signals App.tsx to show re-auth prompt

### index.ts
Barrel re-exports all public API from all three modules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Dependency] @tauri-apps/api not in package.json**
- **Found during:** Task 16-02-04 verification
- **Issue:** `@tauri-apps/api` was absent from `package.json` — all `auth/` imports would fail at build time
- **Fix:** `bun add @tauri-apps/api` — installed v2.10.1
- **Files modified:** `packages/mission-control/package.json`
- **Commit:** 3d75b4b

### Out-of-scope discoveries (not fixed)

Pre-existing TypeScript errors in `AppShell.tsx`, `ChatView.tsx`, `SliceView.tsx`, `server/*.ts` — all pre-date this plan, none caused by auth/ additions. Logged for future pass.

## Verification

1. `packages/mission-control/src/auth/` — 4 files present: auth-api.ts, useAuthGuard.ts, useTokenRefresh.ts, index.ts
2. `auth-api.ts` exports all 7 required functions
3. Each function has non-Tauri fallback
4. `useAuthGuard` returns 4-property object: `{ state, setAuthenticated, setPendingProvider, pendingProvider }`
5. `tsc --noEmit` — zero errors in `src/auth/` directory

## Self-Check: PASSED
