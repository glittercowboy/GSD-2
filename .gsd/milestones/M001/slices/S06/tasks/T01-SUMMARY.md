---
id: T01
parent: S06
milestone: M001
provides:
  - generateDecisionsMd — generates DECISIONS.md from Decision[]
  - generateRequirementsMd — generates REQUIREMENTS.md from Requirement[]
  - nextDecisionId — auto-assigns next D-number from DB state
  - saveDecisionToDb — upserts decision to DB + regenerates DECISIONS.md
  - updateRequirementInDb — updates requirement in DB + regenerates REQUIREMENTS.md
  - saveArtifactToDb — writes artifact to DB + disk
key_files:
  - src/resources/extensions/gsd/db-writer.ts
  - src/resources/extensions/gsd/tests/db-writer.test.ts
key_decisions:
  - All DB queries in write helpers use _getAdapter() directly for full table scans (decisions and requirements) since getActiveDecisions/getActiveRequirements filter out superseded rows, but DECISIONS.md contains ALL rows and REQUIREMENTS.md contains all non-superseded rows
patterns_established:
  - DB-first write pattern: upsert to DB → fetch all rows → generate markdown → write file via saveFile()
  - Dynamic import of gsd-db.js inside async functions with try/catch (D014 compliance)
observability_surfaces:
  - stderr gsd-db: prefix on all write helper failures
  - nextDecisionId returns D001 as safe fallback when DB unavailable
duration: 25m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T01: Markdown generators + DB-first write helpers

**Created db-writer.ts with 6 exports for DB→markdown generation and DB-first write helpers, with proven round-trip fidelity through existing parsers**

## What Happened

Built `db-writer.ts` implementing the missing DB→markdown direction that S06's structured LLM tools need. The module provides:

1. **generateDecisionsMd** — takes Decision[] and produces the full DECISIONS.md file content with H1 header, HTML comment block, table header/separator, and data rows. Pipe characters in cell values are escaped.

2. **generateRequirementsMd** — takes Requirement[] and groups by status into ## Active/Validated/Deferred/Out of Scope sections, each with ### RXXX — Description headings and bullet fields. Only emits sections with content. Appends Traceability table and Coverage Summary.

3. **nextDecisionId** — queries MAX(CAST(SUBSTR(id, 2) AS INTEGER)) from decisions via dynamic import. Returns D001 if empty, zero-pads to 3 digits.

4. **saveDecisionToDb** — auto-assigns ID, upserts to DB, fetches all decisions, regenerates DECISIONS.md, writes to disk. Returns {id}.

5. **updateRequirementInDb** — fetches existing requirement, merges updates, upserts, fetches all non-superseded requirements, regenerates REQUIREMENTS.md, writes to disk. Throws if requirement not found.

6. **saveArtifactToDb** — inserts artifact to DB, writes content to basePath/.gsd/path on disk.

All DB imports are dynamic inside try/catch per D014. The critical invariant — round-trip fidelity — was proven: generateDecisionsMd → parseDecisionsTable and generateRequirementsMd → parseRequirementsSections both produce field-identical results.

## Verification

- `npx tsc --noEmit` — clean compilation, no errors
- `npm run test:unit -- --test-name-pattern "db-writer"` — 127 assertions passed, 0 failed
- `npm run test:unit` — full suite 289 tests passed, 0 failed, no regressions
- Round-trip decisions: generate → parse → all 7 fields match for 3 sample decisions
- Round-trip requirements: generate → parse → all fields match for 4 sample requirements across all 4 status sections
- nextDecisionId: returns D001 when empty, D006 after D005 inserted
- saveDecisionToDb: writes to DB + generates DECISIONS.md that parses back correctly
- updateRequirementInDb: merges updates, preserves untouched fields, generates REQUIREMENTS.md
- saveArtifactToDb: writes to DB with correct metadata, creates file on disk at computed path

### Slice-level verification status (T01 of 3):
- ✅ `npm run test:unit -- --test-name-pattern "db-writer"` — passes
- ⬜ `npm run test:unit -- --test-name-pattern "gsd-tools"` — test file not yet created (T02)
- ⬜ `npm run test:unit -- --test-name-pattern "gsd-inspect"` — test file not yet created (T03)
- ✅ `npm run test:unit` — full suite passes
- ✅ `npx tsc --noEmit` — clean

## Diagnostics

- All write helpers log to stderr with `gsd-db:` prefix on failure
- `nextDecisionId` degrades to D001 when DB unavailable (no crash)
- `updateRequirementInDb` throws with descriptive message when requirement ID not found
- Generated markdown files can be inspected on disk at `.gsd/DECISIONS.md` and `.gsd/REQUIREMENTS.md`

## Deviations

- Used `_getAdapter()` directly for fetching all decisions/requirements instead of `getActiveDecisions()`/`getActiveRequirements()`, because DECISIONS.md contains ALL rows (including superseded) and REQUIREMENTS.md needs all non-superseded rows. The active_* views filter too aggressively for full file regeneration.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/db-writer.ts` — new module with 6 exports: generateDecisionsMd, generateRequirementsMd, nextDecisionId, saveDecisionToDb, updateRequirementInDb, saveArtifactToDb
- `src/resources/extensions/gsd/tests/db-writer.test.ts` — 127 assertions covering round-trip fidelity, next-ID computation, DB write helpers, and error cases
- `.gsd/milestones/M001/slices/S06/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M001/slices/S06/S06-PLAN.md` — marked T01 as done
- `.gsd/STATE.md` — updated active task to T02
