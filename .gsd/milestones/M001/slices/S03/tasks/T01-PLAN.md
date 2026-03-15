---
estimated_steps: 4
estimated_files: 3
---

# T01: Extend context-store with artifact/project queries and open DB at session start

**Slice:** S03 — Core Hierarchy + Full Query Layer + Prompt Rewiring
**Milestone:** M001

## Description

The DB is currently only opened during auto-migration (when `gsd.db` doesn't exist yet). If a project already has `gsd.db` from a previous run, the DB is never opened — `isDbAvailable()` returns false for the entire session and all DB queries silently return empty. This task fixes that gap and adds the missing query functions for hierarchy artifacts and PROJECT.md.

## Steps

1. Add `queryArtifact(path: string): string | null` to `context-store.ts`. Guards with `isDbAvailable()` + try/catch. Queries `SELECT full_content FROM artifacts WHERE path = :path`. Returns the `full_content` string or null if not found/unavailable.

2. Add `queryProject(): string | null` to `context-store.ts`. Calls `queryArtifact('PROJECT.md')` — PROJECT.md is stored with this relative path by the importer.

3. In `startAuto()` in `auto.ts`, after the auto-migration block (line ~640), add a new block: if `gsd.db` exists AND `!isDbAvailable()`, dynamically import `gsd-db.js` and call `openDatabase(gsdDbPath)`. Wrap in try/catch for D003 graceful degradation. This handles: (a) existing DB from prior run, (b) DB that was just created by migration (migration already opens it, so `isDbAvailable()` is true and this block is skipped).

4. Add unit tests to `context-store.test.ts`: test `queryArtifact` returns correct content for an inserted artifact, returns null for missing path, returns null when DB unavailable. Test `queryProject` returns PROJECT.md content.

## Must-Haves

- [ ] `queryArtifact(path)` returns `full_content` from artifacts table or null
- [ ] `queryProject()` returns PROJECT.md content or null
- [ ] DB opens at session start when `gsd.db` already exists
- [ ] All functions degrade gracefully (return null when DB unavailable)
- [ ] Existing context-store tests still pass

## Verification

- `npm run test:unit -- --test-name-pattern "context-store"` — all assertions pass including new ones
- `npx tsc --noEmit` — clean compilation

## Inputs

- `src/resources/extensions/gsd/gsd-db.ts` — `isDbAvailable()`, `_getAdapter()`, `openDatabase()`, `insertArtifact()` from S01/S02
- `src/resources/extensions/gsd/context-store.ts` — existing query functions from S01
- `src/resources/extensions/gsd/auto.ts` — `startAuto()` function with auto-migration block from S02

## Expected Output

- `src/resources/extensions/gsd/context-store.ts` — extended with `queryArtifact`, `queryProject` exports
- `src/resources/extensions/gsd/auto.ts` — DB open block added after auto-migration in `startAuto()`
- `src/resources/extensions/gsd/tests/context-store.test.ts` — new test assertions for artifact queries

## Observability Impact

- **New signal:** `isDbAvailable()` returns true after `startAuto()` completes when `gsd.db` exists on disk — previously returned false for pre-existing DBs.
- **Failure shape:** DB open failure in `startAuto()` writes `gsd-db: failed to open existing database: <message>` to stderr. Non-fatal — auto-mode continues with `isDbAvailable() === false` and all query functions return null/empty.
- **Inspection:** Call `queryArtifact('PROJECT.md')` or `queryProject()` after session start to verify DB is live. Returns null when DB unavailable, string content when available.
- **Future agent use:** Downstream prompt builders (T02) will call `queryArtifact`/`queryProject` — null return triggers transparent fallback to `inlineGsdRootFile`.
