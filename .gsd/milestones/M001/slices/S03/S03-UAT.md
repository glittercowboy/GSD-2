# S03: Core Hierarchy + Full Query Layer + Prompt Rewiring — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All behavior is verifiable through unit tests, compilation checks, and grep-based diagnostics. No runtime UI or user interaction surfaces were introduced. The prompt builders produce string output that is fully testable without running a live auto-mode session.

## Preconditions

- Working directory is the memory-db worktree: `.gsd/worktrees/memory-db/`
- Node.js available with `npx` and `npm` in PATH
- Dependencies installed (`node_modules` exists)
- Existing test database infrastructure from S01/S02 is intact

## Smoke Test

Run `npx tsc --noEmit && npm run test:unit` — should compile clean and pass 285 tests with 0 failures.

## Test Cases

### 1. TypeScript compilation is clean

1. Run `npx tsc --noEmit`
2. **Expected:** Zero errors, zero warnings, exit code 0

### 2. Context-store tests pass including new artifact/project queries

1. Run `npm run test:unit -- --test-name-pattern "context-store"`
2. **Expected:** All tests pass (≥56 assertions). Specifically:
   - `queryArtifact` returns content for existing artifact path
   - `queryArtifact` returns null for missing path
   - `queryArtifact` returns null when DB unavailable
   - `queryProject` returns PROJECT.md content
   - `queryProject` returns null when no PROJECT.md exists
   - `queryProject` returns null when DB unavailable

### 3. Prompt-db tests pass including DB-aware helpers and re-import

1. Run `npm run test:unit -- --test-name-pattern "prompt-db"`
2. **Expected:** All tests pass (≥52 assertions). Specifically:
   - DB-scoped decisions return filtered content (by milestone)
   - DB-scoped requirements return filtered content (by slice)
   - DB project content retrieval works
   - Fallback behavior produces output when DB unavailable
   - Scoped filtering produces less content than unscoped
   - Re-import test shows DB updates when source markdown changes

### 4. Full test suite passes with zero regressions

1. Run `npm run test:unit`
2. **Expected:** 285 tests pass, 0 fail, 0 skipped

### 5. Zero direct inlineGsdRootFile usage in prompt builders

1. Run `grep -c "inlineGsdRootFile" src/resources/extensions/gsd/auto.ts`
2. **Expected:** Exactly 7 (1 function definition + 3 fallback calls inside DB-aware helpers + 3 JSDoc comment references)
3. Run `grep -n "inlineGsdRootFile" src/resources/extensions/gsd/auto.ts`
4. **Expected:** No matches inside any `build*Prompt` function body. All matches are either the function definition, inside `inlineDecisionsFromDb`/`inlineRequirementsFromDb`/`inlineProjectFromDb` helper fallbacks, or JSDoc comments.

### 6. DB-aware helper functions exist with correct signatures

1. Run `grep -n "async function inlineDecisionsFromDb\|async function inlineRequirementsFromDb\|async function inlineProjectFromDb" src/resources/extensions/gsd/auto.ts`
2. **Expected:** Three matches showing all three helpers defined in auto.ts

### 7. DB open at session start is wired

1. Run `grep -A5 "failed to open existing database" src/resources/extensions/gsd/auto.ts`
2. **Expected:** Shows the DB open block in `startAuto()` that opens pre-existing `gsd.db` files with `openDatabase()` call and try/catch with stderr logging

### 8. Dual-write re-import is wired in handleAgentEnd

1. Run `grep -A5 "re-import failed" src/resources/extensions/gsd/auto.ts`
2. **Expected:** Shows the re-import block in `handleAgentEnd` that calls `migrateFromMarkdown` with try/catch and stderr logging

### 9. isDbAvailable is statically imported

1. Run `grep "import.*isDbAvailable" src/resources/extensions/gsd/auto.ts`
2. **Expected:** One static import line: `import { isDbAvailable } from "./gsd-db.js";`

## Edge Cases

### DB unavailable fallback produces valid output

1. In `prompt-db.test.ts`, the test suite includes cases where `isDbAvailable()` returns false
2. **Expected:** All three DB-aware helpers fall back to `inlineGsdRootFile` and return non-empty content (the filesystem-loaded markdown)

### Empty DB content treated as absent

1. In `context-store.test.ts`, `queryArtifact` is tested with empty-string `full_content`
2. **Expected:** Returns null (treats empty content as absent, triggering fallback)

### Re-import is idempotent

1. In `prompt-db.test.ts`, the re-import test calls `migrateFromMarkdown` twice on the same data
2. **Expected:** No errors, no duplicate rows. INSERT OR REPLACE handles idempotent re-import.

### Re-import failure is non-fatal

1. The `handleAgentEnd` re-import block wraps `migrateFromMarkdown` in try/catch
2. **Expected:** If re-import throws, error logs to stderr with `gsd-db: re-import failed:` prefix but dispatch continues

## Failure Signals

- `npx tsc --noEmit` produces errors → compilation regression
- Any test failure in `npm run test:unit` → functional regression
- `grep -c "inlineGsdRootFile" auto.ts` returns more than 7 → someone added direct inlineGsdRootFile calls bypassing DB queries
- `grep -c "inlineGsdRootFile" auto.ts` returns fewer than 7 → fallback paths were removed (breaks D003 graceful degradation)
- Missing `import { isDbAvailable }` in auto.ts → DB guard won't work
- Missing `re-import failed` error handler in auto.ts → re-import failures could crash dispatch

## Requirements Proved By This UAT

- R007 — Context store query layer for all dispatch unit types: test cases 2 and 3 prove scoped queries work for decisions, requirements, and artifacts across all builder types
- R008 — Prompt builder rewiring: test cases 3, 5, and 6 prove all builders use DB-aware helpers with zero direct inlineGsdRootFile usage
- R009 — Dual-write: test case 8 and edge case "re-import is idempotent" prove handleAgentEnd re-imports markdown into DB
- R002 — Graceful fallback (S03 supporting role): test cases 3 and edge case "DB unavailable fallback" prove every query site degrades to filesystem

## Not Proven By This UAT

- R016 (≥30% token reduction) — requires S04 token measurement infrastructure to quantify
- R019 (no regression in output quality) — requires S07 full auto-mode cycle on a real project
- Live runtime behavior of DB open in `startAuto()` — verified by code inspection and compilation, not by actually running auto-mode with a pre-existing gsd.db
- Actual handleAgentEnd re-import during a real dispatch cycle — tested in isolation, not in a live auto-commit flow

## Notes for Tester

- All test cases are artifact-driven and can be run via CLI commands. No server or runtime environment needed beyond Node.js.
- The test count (285) may increase if other slices have added tests. The key assertion is 0 failures, not the exact total.
- The `prompt-db.test.ts` file uses in-memory SQLite databases — it does not create or modify any on-disk gsd.db.
- `buildExecuteTaskPrompt` was intentionally not touched — it doesn't use `inlineGsdRootFile` and gets context through different mechanisms.
