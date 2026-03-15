---
id: T03
parent: S03
milestone: M001
provides:
  - DB dual-write re-import in handleAgentEnd after auto-commit cycle
  - Re-import test proving DB updates when source markdown changes
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/prompt-db.test.ts
key_decisions:
  - Uses static isDbAvailable import (already present from T01) — no additional dynamic import needed for the guard
  - migrateFromMarkdown dynamically imported via D014 pattern (same as startAuto migration block)
patterns_established:
  - Dual-write re-import pattern: isDbAvailable() guard → dynamic import md-importer → migrateFromMarkdown(basePath) → try/catch with stderr log
observability_surfaces:
  - stderr message on re-import failure: "gsd-db: re-import failed: <message>"
  - migrateFromMarkdown also emits its own stderr log with import counts
duration: 8m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Wire dual-write re-import in handleAgentEnd

**Added `migrateFromMarkdown` call in `handleAgentEnd` after auto-commit+doctor+rebuildState cycle, keeping DB in sync with markdown changes made by each dispatch unit.**

## What Happened

1. Added a DB dual-write block in `handleAgentEnd` at line 871, after the `rebuildState` + auto-commit block and before the post-unit hooks section. The block:
   - Guards with `isDbAvailable()` (static import already present from T01)
   - Dynamically imports `md-importer.js` and calls `migrateFromMarkdown(basePath)`
   - Wraps in try/catch — failure logs to stderr but doesn't block dispatch

2. Added a re-import test to `prompt-db.test.ts` that:
   - Creates a temp dir with `.gsd/DECISIONS.md` containing 2 decisions
   - Opens an in-memory DB and imports via `migrateFromMarkdown`
   - Verifies initial state (2 decisions)
   - Writes an updated DECISIONS.md with 3 decisions (simulating LLM modification)
   - Calls `migrateFromMarkdown` again (simulating the handleAgentEnd re-import)
   - Verifies DB now has 3 decisions with correct data
   - Verifies scoped query picks up the new decision

## Verification

- `npx tsc --noEmit` — clean compilation
- `npm run test:unit -- --test-name-pattern "prompt-db"` — 52 assertions passed (7 test sections including new re-import test)
- `npm run test:unit -- --test-name-pattern "context-store"` — all pass
- `npm run test:unit` — 285 tests pass, 0 fail

### Slice-level verification status (final task — all must pass)

- [x] `npx tsc --noEmit` — clean
- [x] `npm run test:unit -- --test-name-pattern "context-store"` — pass
- [x] `npm run test:unit -- --test-name-pattern "prompt-db"` — pass (52 assertions, 0 failures)
- [x] `npm run test:unit` — 285 pass, 0 fail
- [x] Diagnostic: `isDbAvailable()` static import used for guard; DB re-import failure logs to stderr with `gsd-db: re-import failed:` prefix

## Diagnostics

- **Re-import failure**: stderr message `gsd-db: re-import failed: <message>` — non-fatal, DB may have stale data but next `handleAgentEnd` retries
- **Successful re-import**: `migrateFromMarkdown` emits its own stderr log with import counts (`gsd-migrate: imported X decisions, Y requirements, Z artifacts`)
- **Future inspection**: query DB tables after `handleAgentEnd` to verify rows match current markdown files

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — Added 9-line DB dual-write re-import block in `handleAgentEnd` (lines 871-879)
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — Added re-import test section with 8 assertions proving DB updates when source markdown changes
