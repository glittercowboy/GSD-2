---
estimated_steps: 3
estimated_files: 2
---

# T03: Wire dual-write re-import in handleAgentEnd

**Slice:** S03 — Core Hierarchy + Full Query Layer + Prompt Rewiring
**Milestone:** M001

## Description

After each dispatch unit completes, the LLM may have written or modified DECISIONS.md, REQUIREMENTS.md, or other markdown files. The DB must re-import these changes so the next unit's prompt builder queries return up-to-date data. This task hooks `migrateFromMarkdown` into `handleAgentEnd` after the auto-commit + doctor cycle.

## Steps

1. In `handleAgentEnd` in `auto.ts`, after the `rebuildState` + auto-commit block (around line 855) but before the post-unit hooks section, add a DB re-sync block:
   ```
   if (isDbAvailable from dynamic import) {
     try {
       const { migrateFromMarkdown } = await import("./md-importer.js");
       migrateFromMarkdown(basePath);
     } catch (err) {
       process.stderr.write(`gsd-db: re-import failed: ${(err as Error).message}\n`);
     }
   }
   ```
   Use the same dynamic import pattern as the migration block (D014). The `migrateFromMarkdown` call is idempotent (INSERT OR REPLACE) and fast (<5ms for typical file sets). Failure is non-fatal — logged to stderr, doesn't block dispatch.

2. The `isDbAvailable` check needs a dynamic import of `gsd-db.js` — follow the same pattern used in `startAuto()`. Consider caching the import at module level since `handleAgentEnd` is called frequently (once per unit).

3. Add a test in `prompt-db.test.ts`: create an in-memory DB, insert initial decisions, then "modify" the source markdown (write a temp file with additional decisions), call the re-import function, verify the DB now has the updated data.

## Must-Haves

- [ ] `handleAgentEnd` re-imports markdown into DB after auto-commit
- [ ] Re-import uses `migrateFromMarkdown` (idempotent, proven by S02)
- [ ] Re-import failure is non-fatal (try/catch, stderr log)
- [ ] Dynamic import pattern preserved (D014)
- [ ] Test proves DB updates when source markdown changes

## Verification

- `npm run test:unit -- --test-name-pattern "prompt-db"` — re-import test passes
- `npx tsc --noEmit` — clean compilation
- `npm run test:unit` — full suite passes, no regressions

## Observability Impact

- Signals added/changed: stderr message on re-import failure (`gsd-db: re-import failed: <message>`)
- How a future agent inspects this: query DB tables after `handleAgentEnd` to verify rows match current markdown files
- Failure state exposed: re-import failure message on stderr; DB may have stale data but next `handleAgentEnd` retries

## Inputs

- `src/resources/extensions/gsd/auto.ts` — `handleAgentEnd` function from existing code
- `src/resources/extensions/gsd/md-importer.ts` — `migrateFromMarkdown` from S02
- `src/resources/extensions/gsd/gsd-db.ts` — `isDbAvailable` from S01
- T01 output — DB opens at session start, so `isDbAvailable()` returns true during `handleAgentEnd`

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — dual-write block added in `handleAgentEnd`
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — re-import test added
