---
id: T01
parent: S03
milestone: M001
provides:
  - queryArtifact and queryProject functions in context-store.ts
  - DB open at session start for pre-existing gsd.db files
key_files:
  - src/resources/extensions/gsd/context-store.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/context-store.test.ts
key_decisions:
  - Static import of isDbAvailable in auto.ts (lightweight check, avoids second dynamic import)
  - queryArtifact returns null for empty-string full_content (treats empty as absent)
patterns_established:
  - Artifact query pattern: guard with isDbAvailable() + _getAdapter() + try/catch, return null on any failure
observability_surfaces:
  - stderr log "gsd-db: failed to open existing database:" when DB open fails at session start
  - queryArtifact/queryProject return null when DB unavailable (silent fallback per D003)
  - isDbAvailable() returns true after startAuto() when gsd.db exists on disk
duration: 12m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Extend context-store with artifact/project queries and open DB at session start

**Added `queryArtifact(path)` and `queryProject()` to context-store, and wired DB open in `startAuto()` for pre-existing `gsd.db` files.**

## What Happened

1. Added `queryArtifact(path: string): string | null` to `context-store.ts`. Guards with `isDbAvailable()` + `_getAdapter()` + try/catch. Queries `SELECT full_content FROM artifacts WHERE path = :path`. Returns the content string or null if not found/unavailable. Returns null for empty-string content (treats empty as absent).

2. Added `queryProject(): string | null` — delegates to `queryArtifact('PROJECT.md')`.

3. In `startAuto()` in `auto.ts`, added a new block after the auto-migration section: if `gsd.db` exists on disk and `!isDbAvailable()`, dynamically imports `gsd-db.js` and calls `openDatabase(gsdDbPath)`. Wrapped in try/catch with stderr logging for D003 graceful degradation. Added static import of `isDbAvailable` from `gsd-db.js` (lightweight module-level state check).

4. Added 6 new test assertions to `context-store.test.ts`: queryArtifact returns content for existing path, returns null for missing path, returns null when DB unavailable; queryProject returns PROJECT.md content, returns null when no PROJECT.md, returns null when DB unavailable.

## Verification

- `npx tsc --noEmit` — clean, no errors
- `npm run test:unit -- --test-name-pattern "context-store"` — 56 passed, 0 failed (50 existing + 6 new)
- `npm run test:unit` — full suite 284 passed, 0 failed, no regressions

### Slice-level verification status (T01 of 3):
- ✅ `npx tsc --noEmit` — clean
- ✅ `npm run test:unit -- --test-name-pattern "context-store"` — all pass
- ⏳ `npm run test:unit -- --test-name-pattern "prompt-db"` — test file not yet created (T02)
- ✅ `npm run test:unit` — full suite passes
- ⏳ Diagnostic check for DB open at session start — observable but not runtime-tested (integration behavior)

## Diagnostics

- `isDbAvailable()` returns true after `startAuto()` completes when `gsd.db` exists on disk
- DB open failure logs: `gsd-db: failed to open existing database: <message>` to stderr
- `queryArtifact('PROJECT.md')` or `queryProject()` can be called to verify DB is live (returns null when unavailable)

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/context-store.ts` — added `queryArtifact()` and `queryProject()` exports
- `src/resources/extensions/gsd/auto.ts` — added `isDbAvailable` import and DB open block after auto-migration in `startAuto()`
- `src/resources/extensions/gsd/tests/context-store.test.ts` — added 6 new test assertions for artifact/project queries
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — pre-flight: added diagnostic verification step
- `.gsd/milestones/M001/slices/S03/tasks/T01-PLAN.md` — pre-flight: added Observability Impact section
