You are executing GSD auto-mode.

## UNIT: Plan Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

All relevant context has been preloaded below — start working immediately without re-reading these files.

{{inlinedContext}}

### Dependency Slice Summaries

Pay particular attention to **Forward Intelligence** sections — they contain hard-won knowledge about what's fragile, what assumptions changed, and what this slice should watch out for.

{{dependencySummaries}}

Then:
0. If `REQUIREMENTS.md` was preloaded above, identify which Active requirements the roadmap says this slice owns or supports. These are the requirements this plan must deliver — every owned requirement needs at least one task that directly advances it, and verification must prove the requirement is met.
1. Read the templates:
   - `~/.gsd/agent/extensions/gsd/templates/plan.md`
   - `~/.gsd/agent/extensions/gsd/templates/task-plan.md`
2. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow during planning, without overriding required plan formatting
3. Define slice-level verification first — the objective stopping condition for this slice:
   - For non-trivial slices: plan actual test files with real assertions. Name the files. The first task creates them (initially failing). Remaining tasks make them pass.
   - For simple slices: executable commands or script assertions are fine.
   - If the project is non-trivial and has no test framework, the first task should set one up.
   - If this slice establishes a boundary contract, verification must exercise that contract.
4. Plan observability and diagnostics explicitly:
   - For non-trivial backend, integration, async, stateful, or UI slices, include an `Observability / Diagnostics` section in the slice plan.
   - Define how a future agent will inspect state, detect failure, and localize the problem.
   - Prefer structured logs/events, stable error codes/types, status surfaces, and persisted failure state over ad hoc debug text.
   - Include at least one verification check for a diagnostic or failure-path signal when relevant.
5. Fill the `Proof Level` and `Integration Closure` sections truthfully:
   - State whether the slice proves contract, integration, operational, or final-assembly behavior.
   - Say whether real runtime or human/UAT is required.
   - Name the wiring introduced in this slice and what still remains before the milestone is truly usable end-to-end.
6. Decompose the slice into tasks, each fitting one context window
7. Every task in the slice plan should be written as an executable increment with:
   - a concrete, action-oriented title
   - the inline task entry fields defined in the plan.md template (Why / Files / Do / Verify / Done when)
   - a matching task plan containing description, steps, must-haves, verification, observability impact, inputs, and expected output
8. Each task needs: title, description, steps, must-haves, verification, observability impact, inputs, and expected output
9. If verification includes test files, ensure the first task includes creating them with expected assertions (they should fail initially — that's correct)
10. Write `{{outputPath}}`
11. Write individual task plans in `{{sliceAbsPath}}/tasks/`: `T01-PLAN.md`, `T02-PLAN.md`, etc.
12. **Self-audit the plan before continuing.** Walk through each check — if any fail, fix the plan files before moving on:
    - **Completion semantics:** If every task were completed exactly as written, the slice goal/demo should actually be true at the claimed proof level. Do not allow a task plan that only scaffolds toward a future working state.
    - **Requirement coverage:** Every must-have in the slice maps to at least one task. No must-have is orphaned.
    - **Task completeness:** Every task has steps, must-haves, verification, observability impact, inputs, and expected output — none are blank or vague.
    - **Dependency correctness:** Task ordering is consistent. No task references work from a later task.
    - **Key links planned:** For every pair of artifacts that must connect (component → API, API → database, form → handler), there is an explicit step that wires them — not just "create X" and "create Y" in separate tasks with no connection step.
    - **Scope sanity:** Target 2–5 steps and 3–8 files per task. 6–8 steps or 8–10 files is a warning — consider splitting. 10+ steps or 12+ files — must split. Each task must be completable in a single fresh context window.
    - **Context compliance:** If context/research artifacts or `.gsd/DECISIONS.md` exist, the plan honors locked decisions and doesn't include deferred or out-of-scope items.
    - **Requirement coverage:** If `REQUIREMENTS.md` exists, every Active requirement this slice owns (per the roadmap) maps to at least one task with verification that proves the requirement is met. No owned requirement is left without a task. No task claims to satisfy a requirement that is Deferred or Out of Scope.
    - **Proof honesty:** The `Proof Level` and `Integration Closure` sections match what this slice will actually prove, and they do not imply live end-to-end completion if only fixture or contract proof is planned.
    - **Feature completeness:** Every task produces real, user-facing progress — not just internal scaffolding. If the slice has a UI surface, at least one task builds the real UI (not a placeholder). If the slice has an API, at least one task connects it to a real data source (not hardcoded returns). If every task were completed and you showed the result to a non-technical stakeholder, they should see real product progress, not developer artifacts.
13. If planning produced structural decisions (e.g. verification strategy, observability strategy, technology choices, patterns to follow), append them to `.gsd/DECISIONS.md`
14. Commit: `docs({{sliceId}}): add slice plan`
15. Update `.gsd/STATE.md`

The slice directory and tasks/ subdirectory already exist. Do NOT mkdir. You are on the slice branch; all work stays here.

**You MUST write the file `{{outputAbsPath}}` before finishing.**

When done, say: "Slice {{sliceId}} planned."
