---
estimated_steps: 4
estimated_files: 3
---

# T02: Wire evidence writing into auto.ts and update template and prompt

**Slice:** S02 — Structured Evidence Format
**Milestone:** M001

## Description

Connect T01's evidence writer to the live pipeline. After `runVerificationGate()` returns in auto.ts, call `writeVerificationJSON()` to persist the JSON artifact. Also update the task summary template to include a `## Verification Evidence` section, and update the execute-task prompt to instruct agents to populate the evidence table from gate output.

Key constraints from S01 Forward Intelligence:
- The gate block in auto.ts (~line 1490) already has parsed `mid`, `sid`, `tid` from `parts = currentUnit.id.split("/")`
- `writeFileSync`, `mkdirSync`, `existsSync`, `join` are already imported in auto.ts
- `resolveSlicePath` is already imported from paths.ts
- The gate block is inside a `try/catch` so errors are non-fatal

## Steps

1. Add import of `writeVerificationJSON` from `./verification-evidence.js` at the top of `auto.ts` (near line 23 where `runVerificationGate` is imported).

2. In the gate block in `auto.ts` (inside the `if (parts.length >= 3)` guard, after the `runVerificationGate()` call and its result logging), add:
   ```typescript
   // Write verification evidence JSON artifact
   try {
     const sDir = resolveSlicePath(basePath, mid, sid);
     if (sDir) {
       const tasksDir = join(sDir, "tasks");
       writeVerificationJSON(result, tasksDir, tid, currentUnit.id);
     }
   } catch (evidenceErr) {
     process.stderr.write(`verification-evidence: write error — ${(evidenceErr as Error).message}\n`);
   }
   ```
   This goes right after the existing notify/stderr logging for the gate result, still inside the outer `if (parts.length >= 3)` block. The `writeVerificationJSON` call itself creates the tasks dir if needed, but we resolve the path first to get the correct location. The extra try/catch is defensive — evidence write failures should not crash the gate.

3. Update `src/resources/extensions/gsd/templates/task-summary.md` — add a `## Verification Evidence` section. Insert it between the existing `## Verification` and `## Diagnostics` sections:
   ```markdown
   ## Verification Evidence

   <!-- Populated from verification gate output. If the gate ran, fill in the table below.
        If no gate ran (e.g., no verification commands discovered), note that. -->

   | # | Command | Exit Code | Verdict | Duration |
   |---|---------|-----------|---------|----------|
   | {{row}} | {{command}} | {{exitCode}} | {{verdict}} | {{duration}} |
   ```

4. Update `src/resources/extensions/gsd/prompts/execute-task.md` — add instruction after step 7 (the slice-level verification step) telling the agent to populate the evidence table:
   ```
   8. After the verification gate runs (you'll see gate results in stderr/notify output), populate the `## Verification Evidence` table in your task summary with the check results. Use the `formatEvidenceTable` format: one row per check with command, exit code, verdict (✅ pass / ❌ fail), and duration. If no verification commands were discovered, note that in the section.
   ```
   Renumber subsequent steps accordingly (current 8 becomes 9, etc.).

## Must-Haves

- [ ] `writeVerificationJSON` is imported and called from the gate block in auto.ts
- [ ] Evidence write is inside a defensive try/catch (non-fatal on failure)
- [ ] Task summary template has `## Verification Evidence` section with table format
- [ ] Execute-task prompt instructs agent to populate evidence table from gate output

## Verification

- `npx --yes tsx src/resources/extensions/gsd/auto.ts` — compiles cleanly (no import or type errors)
- `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 S01 tests still pass
- `grep -n "writeVerificationJSON" src/resources/extensions/gsd/auto.ts` — shows 2 hits (1 import, 1 call)
- `grep "Verification Evidence" src/resources/extensions/gsd/templates/task-summary.md` — section exists
- `grep -c "evidence" src/resources/extensions/gsd/prompts/execute-task.md` — at least 1 hit

## Inputs

- `src/resources/extensions/gsd/verification-evidence.ts` — T01's module with `writeVerificationJSON` export
- `src/resources/extensions/gsd/auto.ts` — gate block at ~line 1490–1540
- `src/resources/extensions/gsd/templates/task-summary.md` — current template (has `## Verification` and `## Diagnostics` but no `## Verification Evidence`)
- `src/resources/extensions/gsd/prompts/execute-task.md` — current prompt (73 lines)
- S01 summary: gate block already has `mid`, `sid`, `tid` parsed, `resolveSlicePath` imported, `writeFileSync`/`mkdirSync`/`join` imported

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — modified with import + ~8-line evidence write block inside the gate
- `src/resources/extensions/gsd/templates/task-summary.md` — modified with `## Verification Evidence` section
- `src/resources/extensions/gsd/prompts/execute-task.md` — modified with evidence table instruction

## Observability Impact

- **New signal: T##-VERIFY.json artifacts.** After every execute-task gate run, a JSON file is written to the task's directory (e.g., `.gsd/milestones/M001/slices/S02/tasks/T03-VERIFY.json`). Future agents can `cat` this file to inspect `schemaVersion`, `passed`, and per-check `verdict` fields without re-running the gate.
- **New stderr line on evidence write failure.** If `writeVerificationJSON` fails (e.g., disk full, bad path), the message `verification-evidence: write error — <message>` appears in stderr. The gate still completes — evidence write failures are non-fatal.
- **Template change.** Task summaries now include a `## Verification Evidence` section with a table. Agents populate this from gate output. Absence of this section in a summary is detectable by downstream validators.
- **Prompt change.** Step 8 in execute-task.md instructs agents to fill the evidence table. This is visible in the prompt text itself — `grep "evidence" prompts/execute-task.md` confirms.
- **Inspection:** `grep -n writeVerificationJSON auto.ts` shows 2 hits (import + call). `ls tasks/T##-VERIFY.json` after a gate run confirms artifact creation.
