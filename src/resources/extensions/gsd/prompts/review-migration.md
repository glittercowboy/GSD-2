## Review Migrated .gsd Directory

A `/gsd migrate` command just wrote a `.gsd/` directory from an old `.planning` source. Your job is to audit the output and verify it meets GSD-2 standards before the user starts working with it. This review is read-only: report issues and recommended fixes, but do not edit files in place.

### Source
- Old `.planning` directory: `{{sourcePath}}`
- Written `.gsd` directory: `{{gsdPath}}`

### Migration Stats
{{previewStats}}

### Review Checklist

Work through each check. Report PASS/FAIL with specifics. Do not fix files in place; migration repairs must go through DB-backed migration repair paths.

#### 1. Structure Validation
- Run `deriveState()` on the `.gsd` directory (import from `state.ts`, pass the **project root** as basePath)
- Confirm it returns a coherent phase (not `pre-planning` unless the project is truly empty)
- Confirm activeMilestone, activeSlice, activeTask are sensible for the project's completion state
- Confirm progress counts match the migration preview stats

#### 2. Roadmap Quality
- Read `M001-ROADMAP.md` (and any other milestone roadmaps)
- Confirm slice entries have meaningful titles (not file paths or garbled text)
- Confirm `[x]`/`[ ]` completion markers are correct relative to the old roadmap
- Confirm vision statement is present and meaningful (not empty or "Migration")

#### 3. Content Spot-Check
- Pick 2-3 slices with the most tasks and read their plan files
- Confirm task titles and descriptions carry over meaningfully from the old plans
- Confirm summary files exist for completed tasks and contain relevant content
- Check that research files (if present) contain consolidated content, not empty stubs

#### 4. Requirements (if any)
- Read REQUIREMENTS.md
- Confirm requirement IDs are present and non-duplicate
- Confirm statuses make sense: completed old requirements should be `validated`, in-progress should be `active`

#### 5. PROJECT.md
- Read the written PROJECT.md
- Confirm it contains the old project's description, not boilerplate
- Confirm it reads like a useful project summary

#### 6. Decisions
- If DECISIONS.md was written, confirm it contains extracted decisions from old summaries (or is empty if no decisions existed)

### Output Format

Summarize your findings as:

```
Migration Review: <project name>
================================
Structure:     PASS/FAIL — <details>
Roadmap:       PASS/FAIL — <details>
Content:       PASS/FAIL — <details>
Requirements:  PASS/FAIL/SKIP — <details>
Project:       PASS/FAIL — <details>
Decisions:     PASS/FAIL/SKIP — <details>

Overall: PASS / PASS WITH NOTES / FAIL
Issues: <list any problems found>
Recommended fixes: <list any fixes needed>
```

If the overall result is FAIL, explain what needs manual attention. If PASS WITH NOTES, explain what's imperfect but acceptable. If PASS, confirm the `.gsd` directory is ready for GSD-2 auto-mode.
