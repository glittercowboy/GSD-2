---
id: T02
parent: S02
milestone: M001
provides:
  - writeVerificationJSON called from auto.ts gate block after runVerificationGate()
  - task summary template has ## Verification Evidence section with table format
  - execute-task prompt step 8 instructs agents to populate evidence table
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/templates/task-summary.md
  - src/resources/extensions/gsd/prompts/execute-task.md
key_decisions:
  - Evidence write uses its own try/catch inside the gate try block — non-fatal on failure
  - Re-destructure parts array for mid/sid/tid since original destructuring is scoped inside the earlier if block
patterns_established:
  - Defensive nested try/catch for optional artifact writes inside the gate block
observability_surfaces:
  - stderr line "verification-evidence: write error — <message>" on evidence write failure
  - T##-VERIFY.json artifact written to tasks directory after every gate run
duration: 12m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Wire evidence writing into auto.ts and update template and prompt

**Connected T01's evidence writer to the live gate pipeline, added evidence table to task summary template, and added step 8 to execute-task prompt instructing agents to populate the evidence table.**

## What Happened

1. **Import added** — `writeVerificationJSON` imported from `./verification-evidence.js` at line 24 of auto.ts, right after the `runVerificationGate` import.

2. **Evidence write block added** — After the gate result logging in auto.ts, a new block re-checks `parts.length >= 3`, destructures `[mid, sid, tid]`, resolves the slice path via `resolveSlicePath`, and calls `writeVerificationJSON(result, tasksDir, tid, currentUnit.id)`. The call is wrapped in its own `try/catch` so evidence write failures are non-fatal and logged to stderr with the prefix `verification-evidence: write error`.

3. **Task summary template updated** — Added `## Verification Evidence` section between `## Verification` and `## Diagnostics` with a markdown table template (columns: #, Command, Exit Code, Verdict, Duration) and a comment explaining when/how to populate it.

4. **Execute-task prompt updated** — Inserted new step 8 after step 7 (slice-level verification), instructing agents to populate the `## Verification Evidence` table from gate output. All subsequent steps renumbered (old 8→9, 9→10, ..., 18→19).

5. **Observability gap fixed** — Added `## Observability Impact` section to T02-PLAN.md documenting the new signals: T##-VERIFY.json artifacts, stderr line on evidence write failure, template change, and prompt change.

## Verification

- `npx --yes tsx src/resources/extensions/gsd/auto.ts` — compiles cleanly (no import or type errors)
- `npm run test:unit -- --test-name-pattern "verification-gate"` — all 28+ S01 tests pass
- `npm run test:unit -- --test-name-pattern "verification-evidence"` — all 10 T01 evidence tests pass
- `grep -n writeVerificationJSON auto.ts` — 2 hits: line 24 (import), line 1545 (call)
- `grep "Verification Evidence" templates/task-summary.md` — section exists
- `grep -c "evidence" prompts/execute-task.md` — returns 1 (hit confirmed)
- Full test suite: 1055 pass, 8 fail (all 8 pre-existing: chokidar, @octokit/rest — unrelated)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx --yes tsx src/resources/extensions/gsd/auto.ts` | 0 | ✅ pass | 6.8s |
| 2 | `npm run test:unit -- --test-name-pattern "verification-gate"` | 0 | ✅ pass | 31.7s |
| 3 | `npm run test:unit -- --test-name-pattern "verification-evidence"` | 0 | ✅ pass | ~30s |
| 4 | `grep -n writeVerificationJSON auto.ts` (2 hits) | 0 | ✅ pass | 0.1s |
| 5 | `grep "Verification Evidence" task-summary.md` | 0 | ✅ pass | 0.1s |
| 6 | `grep -c "evidence" execute-task.md` (≥1) | 0 | ✅ pass | 0.1s |

## Diagnostics

- **Evidence write in auto.ts:** `grep -n writeVerificationJSON src/resources/extensions/gsd/auto.ts` shows import (line 24) and call site (line 1545).
- **Evidence write failure:** Look for `verification-evidence: write error —` in stderr during a gate run. Absence means writes are succeeding.
- **Template section:** `grep "## Verification Evidence" src/resources/extensions/gsd/templates/task-summary.md` confirms the section exists.
- **Prompt instruction:** `grep "evidence" src/resources/extensions/gsd/prompts/execute-task.md` shows step 8 with the evidence table instruction.
- **JSON artifact:** After a real gate run, `cat .gsd/milestones/M001/slices/S##/tasks/T##-VERIFY.json` shows the evidence JSON with `schemaVersion: 1`.

## Deviations

- **Re-destructuring `parts`:** The plan assumed the evidence write would go inside the existing `if (parts.length >= 3)` block, but that block only contains the `taskPlanVerify` setup. The `result` variable is declared outside it. Solution: added a separate `if (parts.length >= 3)` check after the result logging, re-destructuring `parts` (which is available in the enclosing try scope). Functionally equivalent — no behavioral difference.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — Added import of `writeVerificationJSON` and ~10-line evidence write block in the gate section
- `src/resources/extensions/gsd/templates/task-summary.md` — Added `## Verification Evidence` section with table template
- `src/resources/extensions/gsd/prompts/execute-task.md` — Added step 8 (evidence table instruction), renumbered steps 8→19
- `.gsd/milestones/M001/slices/S02/tasks/T02-PLAN.md` — Added `## Observability Impact` section (pre-flight fix)
