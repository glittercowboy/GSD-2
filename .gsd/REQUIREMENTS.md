# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R045 — A SQLite abstraction layer that tries `node:sqlite` (Node 22.5+), falls back to `better-sqlite3`, then to null. A thin `DbAdapter` interface normalizes API differences. Schema init creates decisions, requirements, artifacts tables plus filtered views. WAL mode on file-backed databases.
- Class: core-capability
- Status: active
- Description: A SQLite abstraction layer that tries `node:sqlite` (Node 22.5+), falls back to `better-sqlite3`, then to null. A thin `DbAdapter` interface normalizes API differences. Schema init creates decisions, requirements, artifacts tables plus filtered views. WAL mode on file-backed databases.
- Why it matters: The foundation for surgical context injection. Without a queryable store, prompts must dump entire files.
- Source: execution (memory-db port)
- Primary owning slice: M004/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Port from memory-db worktree `gsd-db.ts`. Tiered provider chain proven on Node 22.20.0. `node:sqlite` returns null-prototype rows — DbAdapter normalizes via spread.

### R046 — When no SQLite provider loads, all query functions return empty results and all prompt builders fall back to `inlineGsdRootFile` filesystem loading. No crash, no visible error.
- Class: continuity
- Status: active
- Description: When no SQLite provider loads, all query functions return empty results and all prompt builders fall back to `inlineGsdRootFile` filesystem loading. No crash, no visible error.
- Why it matters: SQLite must be optional. Users on exotic platforms or old Node versions must not be blocked.
- Source: execution (memory-db port)
- Primary owning slice: M004/S01
- Supporting slices: M004/S03
- Validation: unmapped
- Notes: Every query function guards with `isDbAvailable()` + try/catch. Every prompt builder falls back to existing `inlineGsdRootFile`.

### R047 — When auto-mode starts on a project with `.gsd/` markdown files but no `gsd.db`, silently import all artifact types into a fresh DB. Idempotent — safe to re-run.
- Class: core-capability
- Status: active
- Description: When auto-mode starts on a project with `.gsd/` markdown files but no `gsd.db`, silently import all artifact types into a fresh DB. Idempotent — safe to re-run.
- Why it matters: Existing projects must transparently gain DB benefits without manual migration.
- Source: execution (memory-db port)
- Primary owning slice: M004/S02
- Supporting slices: M004/S01
- Validation: unmapped
- Notes: Port from memory-db `md-importer.ts`. Custom parsers for DECISIONS.md pipe-table format and REQUIREMENTS.md section/bullet format. Hierarchy walker for milestones → slices → tasks.

### R048 — Importing markdown into DB and regenerating markdown produces field-identical output. No data loss, no format drift.
- Class: quality-attribute
- Status: active
- Description: Importing markdown into DB and regenerating markdown produces field-identical output. No data loss, no format drift.
- Why it matters: Dual-write means DB→markdown generation must be faithful. Format drift corrupts the human-readable artifacts.
- Source: execution (memory-db port)
- Primary owning slice: M004/S02
- Supporting slices: M004/S06
- Validation: unmapped
- Notes: Port from memory-db. Custom parsers and generators must produce/consume identical formats.

### R049 — All prompt builders in `auto-prompts.ts` use scoped DB queries instead of whole-file `inlineGsdRootFile` for decisions, requirements, and project context. Decisions filtered by milestone, requirements filtered by slice ownership.
- Class: core-capability
- Status: active
- Description: All prompt builders in `auto-prompts.ts` use scoped DB queries instead of whole-file `inlineGsdRootFile` for decisions, requirements, and project context. Decisions filtered by milestone, requirements filtered by slice ownership.
- Why it matters: This is the core value — smaller, more relevant prompts mean better agent reasoning and fewer wasted tokens.
- Source: user
- Primary owning slice: M004/S03
- Supporting slices: M004/S01, M004/S02
- Validation: unmapped
- Notes: Port from memory-db DB-aware helpers. Must be rewired into current `auto-prompts.ts` (not the old monolithic auto.ts). 19 `inlineGsdRootFile` calls to replace across 11 prompt builders.

### R050 — After each dispatch unit completes and auto-commits, re-import modified markdown files into the DB. Structured LLM tools write to DB first, then regenerate markdown. Both directions stay synchronized.
- Class: continuity
- Status: active
- Description: After each dispatch unit completes and auto-commits, re-import modified markdown files into the DB. Structured LLM tools write to DB first, then regenerate markdown. Both directions stay synchronized.
- Why it matters: Markdown files are the human-readable source of truth. The DB is the query index. They must agree.
- Source: execution (memory-db port)
- Primary owning slice: M004/S03
- Supporting slices: M004/S06
- Validation: unmapped
- Notes: Re-import in `handleAgentEnd` after auto-commit. DB-first write in structured tools triggers markdown generation.

### R051 — `promptCharCount` and `baselineCharCount` fields added to `UnitMetrics`. Measurement wired into all `snapshotUnitMetrics` call sites. Baseline = full markdown content. Prompt = DB-scoped content. Difference = token savings.
- Class: operability
- Status: active
- Description: `promptCharCount` and `baselineCharCount` fields added to `UnitMetrics`. Measurement wired into all `snapshotUnitMetrics` call sites. Baseline = full markdown content. Prompt = DB-scoped content. Difference = token savings.
- Why it matters: Proves the ≥30% savings claim with real data. Enables ongoing monitoring of prompt efficiency.
- Source: execution (memory-db port)
- Primary owning slice: M004/S04
- Supporting slices: M004/S03
- Validation: unmapped
- Notes: Port from memory-db. Module-scoped measurement vars reset at top of `dispatchNextUnit`.

### R052 — `deriveState()` queries the artifacts table for file content when DB is available, replacing the batch file-parse step. File discovery still uses disk. Falls back to filesystem when DB unavailable.
- Class: core-capability
- Status: active
- Description: `deriveState()` queries the artifacts table for file content when DB is available, replacing the batch file-parse step. File discovery still uses disk. Falls back to filesystem when DB unavailable.
- Why it matters: Faster state derivation on large projects. Consistent with DB-first architecture.
- Source: execution (memory-db port)
- Primary owning slice: M004/S04
- Supporting slices: M004/S01, M004/S02
- Validation: unmapped
- Notes: Port from memory-db. File discovery (which milestones/slices/tasks exist) stays on disk. Only content loading switches to DB.

### R053 — When a worktree is created, copy `gsd.db` from the source project into the worktree's `.gsd/` directory. Skip WAL/SHM files. Non-fatal on failure.
- Class: integration
- Status: active
- Description: When a worktree is created, copy `gsd.db` from the source project into the worktree's `.gsd/` directory. Skip WAL/SHM files. Non-fatal on failure.
- Why it matters: Worktrees need their own DB with the project's current state. Without a copy, the worktree starts with no DB context.
- Source: execution (memory-db port)
- Primary owning slice: M004/S05
- Supporting slices: M004/S01
- Validation: unmapped
- Notes: Port from memory-db `copyWorktreeDb`. Keep `createWorktree` synchronous — `copyFileSync` is sufficient. Guard with `isDbAvailable()`.

### R054 — When a worktree merges back (slice or milestone), ATTACH the worktree's DB and reconcile rows: INSERT OR REPLACE in a transaction with conflict detection by content column comparison.
- Class: integration
- Status: active
- Description: When a worktree merges back (slice or milestone), ATTACH the worktree's DB and reconcile rows: INSERT OR REPLACE in a transaction with conflict detection by content column comparison.
- Why it matters: The worktree may have added decisions, requirements, or artifacts that the main DB doesn't have.
- Source: execution (memory-db port)
- Primary owning slice: M004/S05
- Supporting slices: M004/S01
- Validation: unmapped
- Notes: Port from memory-db `reconcileWorktreeDb`. ATTACH/DETACH pattern with try/finally for cleanup.

### R055 — Three tools registered: `gsd_save_decision` (auto-assigns D-numbers, writes to DB + regenerates DECISIONS.md), `gsd_update_requirement` (verifies existence, updates DB + regenerates REQUIREMENTS.md), `gsd_save_summary` (writes artifact to DB + disk).
- Class: core-capability
- Status: active
- Description: Three tools registered: `gsd_save_decision` (auto-assigns D-numbers, writes to DB + regenerates DECISIONS.md), `gsd_update_requirement` (verifies existence, updates DB + regenerates REQUIREMENTS.md), `gsd_save_summary` (writes artifact to DB + disk).
- Why it matters: Eliminates the markdown-then-parse roundtrip. LLM writes structured data directly, guaranteeing parseable output.
- Source: execution (memory-db port)
- Primary owning slice: M004/S06
- Supporting slices: M004/S03
- Validation: unmapped
- Notes: Port from memory-db. DB-first write pattern: upsert → fetch all → generate markdown → write file.

### R056 — A `/gsd inspect` slash command that dumps schema version, table row counts, and recent entries from each table.
- Class: operability
- Status: active
- Description: A `/gsd inspect` slash command that dumps schema version, table row counts, and recent entries from each table.
- Why it matters: When things go wrong, the user needs visibility into DB state without running raw SQL.
- Source: execution (memory-db port)
- Primary owning slice: M004/S06
- Supporting slices: M004/S01
- Validation: unmapped
- Notes: Port from memory-db. Autocomplete for subcommands (decisions, requirements, artifacts, all).

### R057 — Surgical prompt injection delivers ≥30% fewer prompt characters compared to whole-file loading, measured on mature projects with multiple milestones, decisions, and requirements.
- Class: quality-attribute
- Status: active
- Description: Surgical prompt injection delivers ≥30% fewer prompt characters compared to whole-file loading, measured on mature projects with multiple milestones, decisions, and requirements.
- Why it matters: The primary user-visible value of the entire DB architecture. If savings aren't real, the complexity isn't justified.
- Source: user
- Primary owning slice: M004/S07
- Supporting slices: M004/S03, M004/S04
- Validation: unmapped
- Notes: Memory-db proved: 52.2% plan-slice, 66.3% decisions-only, 32.2% research composite, 42.4% lifecycle. Must re-prove against current codebase.

### R065 — Each verified claim produces a durable annotation file containing the claim ID, verdict, evidence, citations, corrected value when refuted, and impact classification.
- Class: core-capability
- Status: active
- Description: Each verified claim produces a durable annotation file containing the claim ID, verdict, evidence, citations, corrected value when refuted, and impact classification.
- Why it matters: Refutations need a durable evidence trail that later planners, executors, and completers can inspect rather than relying on ephemeral session state.
- Source: user
- Primary owning slice: M006-tbhsp8/S01
- Supporting slices: M006-tbhsp8/S02
- Validation: mapped
- Notes: Per-claim annotations are the evidence record; they should not double as the runtime control artifact.

### R066 — Fact-check outcomes are summarized into a machine-readable aggregate status artifact that the runtime can inspect for routing and cycle control.
- Class: integration
- Status: active
- Description: Fact-check outcomes are summarized into a machine-readable aggregate status artifact that the runtime can inspect for routing and cycle control.
- Why it matters: The runtime needs a deterministic control surface. Scattered per-claim files are not enough for planner reinvocation decisions.
- Source: inferred
- Primary owning slice: M006-tbhsp8/S01
- Supporting slices: M006-tbhsp8/S02, M006-tbhsp8/S04
- Validation: mapped
- Notes: JSON should be the source of truth; add a markdown mirror later only if debugging proves it necessary.

### R067 — Scout execution is configurable through preferences and agent selection rather than hardcoded to a specific model family.
- Class: operability
- Status: active
- Description: Scout execution is configurable through preferences and agent selection rather than hardcoded to a specific model family.
- Why it matters: The user explicitly does not want "haiku scouts" hardcoded. The verification path should adapt to available agents/models and future tuning.
- Source: user
- Primary owning slice: M006-tbhsp8/S02
- Supporting slices: none
- Validation: mapped
- Notes: Existing `models.subagent` preference should be reused unless a dedicated fact-check model phase proves necessary later.

### R069 — REFUTED claims marked as slice- or milestone-impacting trigger planner reinvocation with corrected evidence before execution proceeds, bounded by a configured cycle limit.
- Class: core-capability
- Status: validated
- Description: REFUTED claims marked as slice- or milestone-impacting trigger planner reinvocation with corrected evidence before execution proceeds, bounded by a configured cycle limit.
- Why it matters: Advisory refutations are not enough. The planner must get another turn when corrected facts change planning inputs.
- Source: user
- Primary owning slice: M006-tbhsp8/S04
- Supporting slices: M006-tbhsp8/S03
- Validation: Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` and the full `factcheck-*.test.ts` suite. Dispatch reroutes to `plan-slice` when `FACTCHECK-STATUS.json` reports `planImpacting=true`, and the final audit report records `dispatchAction={action:"dispatch",unitType:"plan-slice",unitId:"M999-PROOF/S01"}` before stale execution continues.
- Notes: This is real runtime behavior, not a prompt suggestion.

### R070 — Revision routing is explicit: pre-execution fact-check corrections rerun `plan-slice` or `plan-milestone` by impact scope, while `replan-slice` remains reserved for execution-discovered blockers.
- Class: integration
- Status: validated
- Description: Revision routing is explicit: pre-execution fact-check corrections rerun `plan-slice` or `plan-milestone` by impact scope, while `replan-slice` remains reserved for execution-discovered blockers.
- Why it matters: Overloading `replan-slice` would blur two different workflows and make the control loop harder to reason about and debug.
- Source: inferred
- Primary owning slice: M006-tbhsp8/S04
- Supporting slices: M006-tbhsp8/S01
- Validation: Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` and `factcheck-final-audit.test.ts`. Runtime revision routing is explicit: plan-impacting slice refutations dispatch `plan-slice`; negative tests prove the special rule falls through when status is missing or `planImpacting=false`, preserving normal planning/recovery semantics.
- Notes: Preserve existing semantics of `replan-slice` as blocker-driven recovery.

### R071 — Slice and milestone completion summaries report claims checked, verdict counts, revision cycles, unresolved inconclusive claims, and whether corrected facts were absorbed before execution.
- Class: failure-visibility
- Status: validated
- Description: Slice and milestone completion summaries report claims checked, verdict counts, revision cycles, unresolved inconclusive claims, and whether corrected facts were absorbed before execution.
- Why it matters: The user wants to review how this behaves in the real world. Completion artifacts need to show whether the loop actually worked.
- Source: user
- Primary owning slice: M006-tbhsp8/S05
- Supporting slices: M006-tbhsp8/S04
- Validation: Milestone closeout now includes durable fact-check outcome reporting via `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` plus the M007 milestone summary. The final audit test writes and schema-validates the report with refuted count, reroute target, corrected evidence presence, dispatch action, and proof artifacts; re-verified with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` (3/3 pass).
- Notes: This is part of the observability needed before telemetry/experiments in later milestones.

### R072 — Planner artifacts for runtime-control milestones explicitly name actors, observable triggers, decision conditions, state-changing outputs, feedback loops, and terminal states so lower-end worker agents can execute them without interpretation.
- Class: quality-attribute
- Status: active
- Description: Planner artifacts for runtime-control milestones explicitly name actors, observable triggers, decision conditions, state-changing outputs, feedback loops, and terminal states so lower-end worker agents can execute them without interpretation.
- Why it matters: Vague control prose creates wiggle room that weaker worker models will interpret inconsistently. The planner must remove that ambiguity structurally.
- Source: inferred
- Primary owning slice: M006-tbhsp8/S01
- Supporting slices: M006-tbhsp8/S03
- Validation: mapped
- Notes: Folded in from process-design discussion; this is a durable planning rule, not just a style preference.

## Validated

### R001 — When a milestone is planned, the LLM analyzes slices for external service dependencies and writes a secrets manifest listing every predicted API key with setup guidance.
- Class: core-capability
- Status: validated
- Description: When a milestone is planned, the LLM analyzes slices for external service dependencies and writes a secrets manifest listing every predicted API key with setup guidance.
- Why it matters: Without forecasting, auto-mode discovers missing keys mid-execution and blocks for hours waiting for user input.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: plan-milestone.md Secret Forecasting section (line 62) instructs LLM to write manifest. Parser round-trip tested in parsers.test.ts.
- Notes: The plan-milestone prompt has forecasting instructions. The manifest format and parser are implemented and tested.

### R002 — The secrets manifest is a durable markdown file at `.gsd/milestones/M00x/M00x-SECRETS.md` that survives session boundaries and can be re-read by any future unit.
- Class: continuity
- Status: validated
- Description: The secrets manifest is a durable markdown file at `.gsd/milestones/M00x/M00x-SECRETS.md` that survives session boundaries and can be re-read by any future unit.
- Why it matters: Collection may happen in a different session than planning. The manifest must persist on disk.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: parseSecretsManifest/formatSecretsManifest round-trip tested (parsers.test.ts), resolveMilestoneFile(base, mid, "SECRETS") resolves path.
- Notes: Parser/formatter implemented in files.ts. Template exists at templates/secrets-manifest.md.

### R003 — Each secret in the manifest includes numbered steps for obtaining the key (navigate to dashboard → create project → generate key → copy), a dashboard URL, and a format hint.
- Class: primary-user-loop
- Status: validated
- Description: Each secret in the manifest includes numbered steps for obtaining the key (navigate to dashboard → create project → generate key → copy), a dashboard URL, and a format hint.
- Why it matters: Users shouldn't have to figure out where to find each key. The guidance makes collection self-service.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S01
- Validation: collectOneSecret renders numbered dim-styled guidance steps with wrapping (collect-from-manifest.test.ts tests 6-8).
- Notes: Guidance quality is LLM-dependent and best-effort.

### R004 — Before collecting secrets one-by-one, show a read-only summary screen listing all needed keys with their status (pending / already set / skipped). Auto-skip keys that already exist in the environment.
- Class: primary-user-loop
- Status: validated
- Description: Before collecting secrets one-by-one, show a read-only summary screen listing all needed keys with their status (pending / already set / skipped). Auto-skip keys that already exist in the environment.
- Why it matters: The user needs to see the full picture before entering keys. Already-set keys should not require re-entry.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: showSecretsSummary() renders read-only ctx.ui.custom screen with status indicators via makeUI().progressItem() (collect-from-manifest.test.ts tests 4-5).
- Notes: Read-only with auto-skip — no interactive deselection.

### R005 — Before prompting for a key, check `.env` and `process.env`. If the key already exists, mark it as "already set" in the summary and skip collection.
- Class: primary-user-loop
- Status: validated
- Description: Before prompting for a key, check `.env` and `process.env`. If the key already exists, mark it as "already set" in the summary and skip collection.
- Why it matters: Users shouldn't re-enter keys they've already configured. Prevents frustration and errors.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: getManifestStatus cross-references checkExistingEnvKeys, categorizes env-present keys as existing (manifest-status.test.ts tests 4,7). collectSecretsFromManifest skips them (collect-from-manifest.test.ts tests 1-2).
- Notes: `checkExistingEnvKeys()` implemented in get-secrets-from-user.ts.

### R006 — Automatically detect whether secrets should go to .env, Vercel, or Convex based on project file presence (vercel.json → Vercel, convex/ dir → Convex, default → .env).
- Class: integration
- Status: validated
- Description: Automatically detect whether secrets should go to .env, Vercel, or Convex based on project file presence (vercel.json → Vercel, convex/ dir → Convex, default → .env).
- Why it matters: Users shouldn't have to specify the destination manually. The system should do the right thing.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: collectSecretsFromManifest calls detectDestination() for destination inference. applySecrets() routes to dotenv/vercel/convex accordingly.
- Notes: `detectDestination()` implemented in get-secrets-from-user.ts.

### R007 — When the user runs `/gsd auto`, check for a secrets manifest with pending keys. If found, collect them before dispatching the first slice. Collection happens once at the entry point, not as a dispatch unit.
- Class: core-capability
- Status: validated
- Description: When the user runs `/gsd auto`, check for a secrets manifest with pending keys. If found, collect them before dispatching the first slice. Collection happens once at the entry point, not as a dispatch unit.
- Why it matters: This is the primary integration point — auto-mode must not start execution with uncollected secrets.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S01, M001/S02
- Validation: startAuto() secrets gate at auto.ts:479. auto-secrets-gate.test.ts — 3/3 pass covering null manifest, pending keys, and no-pending-keys paths.
- Notes: Collection at entry point (startAuto), not as a separate unit type in dispatchNextUnit. D001 satisfied.

### R008 — After milestone planning in the guided `/gsd` flow, trigger secret collection if a manifest exists with pending keys.
- Class: core-capability
- Status: validated
- Description: After milestone planning in the guided `/gsd` flow, trigger secret collection if a manifest exists with pending keys.
- Why it matters: Users who plan via the wizard should also get prompted for secrets before auto-mode begins.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S01, M001/S02
- Validation: guided-flow.ts calls startAuto() directly (lines 52, 486, 647, 794) — all guided flow paths that start auto-mode inherit the secrets gate.
- Notes: The guided flow dispatches to startAuto after planning. Collection is inherited via the gate.

### R009 — The plan-milestone prompt template includes instructions for the LLM to analyze slices for external service dependencies and write the secrets manifest.
- Class: integration
- Status: validated
- Description: The plan-milestone prompt template includes instructions for the LLM to analyze slices for external service dependencies and write the secrets manifest.
- Why it matters: Without prompt instructions, the LLM won't know to forecast secrets.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: plan-milestone.md has Secret Forecasting section at line 62 with instructions to write {{secretsOutputPath}} with H3 sections per key.
- Notes: Implemented in plan-milestone.md.

### R010 — The secure_env_collect TUI renders multi-line guidance steps above the masked input field on the same page, so the user sees setup instructions while entering the key.
- Class: primary-user-loop
- Status: validated
- Description: The secure_env_collect TUI renders multi-line guidance steps above the masked input field on the same page, so the user sees setup instructions while entering the key.
- Why it matters: Without visible guidance, the user has to find keys on their own despite the LLM having generated instructions.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: collectOneSecret accepts guidance parameter, renders numbered dim-styled lines with wrapTextWithAnsi above masked input (collect-from-manifest.test.ts tests 6-8).
- Notes: The guidance field is rendered in collectOneSecret().

### R015 — The monolithic browser-tools index.ts (~5000 lines) is split into focused modules: shared infrastructure, tool groups, and browser-side utilities. All 43 existing tools continue to work identically.
- Class: quality-attribute
- Status: validated
- Description: The monolithic browser-tools index.ts (~5000 lines) is split into focused modules: shared infrastructure, tool groups, and browser-side utilities. All 43 existing tools continue to work identically.
- Why it matters: A 5000-line file is unmaintainable and makes targeted changes risky. Module boundaries enable safe refactoring and new tool development.
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: none
- Validation: Extension loads via jiti, 43 tools register, browser navigate/snapshot/click work against real page, index.ts is 47-line orchestrator with zero registerTool calls, 9 tool files under tools/.
- Notes: core.js already exists with ~1000 lines of shared utilities. The split extends this pattern.

### R016 — Common functions duplicated across page.evaluate boundaries (cssPath, simpleHash, isVisible, isEnabled, inferRole, accessibleName) are injected once and referenced from all evaluate callbacks.
- Class: quality-attribute
- Status: validated
- Description: Common functions duplicated across page.evaluate boundaries (cssPath, simpleHash, isVisible, isEnabled, inferRole, accessibleName) are injected once and referenced from all evaluate callbacks.
- Why it matters: Currently buildRefSnapshot and resolveRefTarget each redeclare ~100 lines of identical utility code. Deduplication reduces payload size, improves maintainability, and ensures consistency.
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: none
- Validation: window.__pi contains all 9 functions, survives navigation, refs.ts has zero inline redeclarations, close/reopen re-injects via addInitScript correctly.
- Notes: Uses context.addInitScript under window.__pi namespace.

### R017 — The before-state capture, after-state capture, post-action summary, and recent-error check are consolidated into fewer page.evaluate calls per action.
- Class: core-capability
- Status: validated
- Description: The before-state capture, after-state capture, post-action summary, and recent-error check are consolidated into fewer page.evaluate calls per action.
- Why it matters: Every action tool currently runs 3-4 separate page.evaluate calls for state capture. Consolidating them reduces latency on every single browser interaction.
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: M002/S01
- Validation: postActionSummary eliminated from action tools, countOpenDialogs removed from ToolDeps, consolidated capture pattern. Build passes.
- Notes: captureCompactPageState and postActionSummary merged into single evaluate.

### R018 — Body text capture (includeBodyText: true) is skipped for low-signal actions (scroll, hover, Tab key press) and enabled for high-signal actions (navigate, click, type, submit).
- Class: core-capability
- Status: validated
- Description: Body text capture (includeBodyText: true) is skipped for low-signal actions (scroll, hover, Tab key press) and enabled for high-signal actions (navigate, click, type, submit).
- Why it matters: Capturing 4000 chars of body text on every scroll or hover is wasteful. Conditional capture reduces evaluate overhead.
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: explicit includeBodyText true/false per tool signal level in interaction.ts. Classification codified in D017. Build passes.
- Notes: Requires classifying each tool as high-signal or low-signal.

### R019 — settleAfterActionAdaptive short-circuits with a smaller quiet window when no mutation observer fires in the first 60ms.
- Class: core-capability
- Status: validated
- Description: settleAfterActionAdaptive short-circuits with a smaller quiet window when no mutation observer fires in the first 60ms.
- Why it matters: Many SPA interactions produce no DOM changes. Short-circuiting saves time on the most common case.
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: zero_mutation_shortcut settle reason in state.ts type union and settle.ts return path. 60ms/30ms thresholds codified in D019. Build passes.
- Notes: Track whether any mutation fired at all; if zero after 60ms, use a shorter quiet window.

### R020 — constrainScreenshot uses the sharp Node library for image resizing instead of bouncing buffers through page canvas context.
- Class: core-capability
- Status: validated
- Description: constrainScreenshot uses the sharp Node library for image resizing instead of bouncing buffers through page canvas context.
- Why it matters: Faster, no page dependency for image processing.
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: M002/S01
- Validation: constrainScreenshot uses sharp(buffer).metadata() and sharp(buffer).resize(). Zero page.evaluate calls in capture.ts. Build passes.
- Notes: sharp added as a dependency.

### R021 — browser_navigate does not capture or return a screenshot by default. An explicit parameter opts in to screenshot capture.
- Class: core-capability
- Status: validated
- Description: browser_navigate does not capture or return a screenshot by default. An explicit parameter opts in to screenshot capture.
- Why it matters: Significant token savings — the screenshot payload is large and often unnecessary.
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: none
- Validation: browser_navigate has screenshot parameter default false. Capture gated. Build passes.
- Notes: Default is off. The agent can still use browser_screenshot explicitly.

### R022 — A browser_analyze_form tool that returns field inventory including labels, names, types, required status, current values, validation state, and submit controls.
- Class: core-capability
- Status: validated
- Description: A browser_analyze_form tool that returns field inventory including labels, names, types, required status, current values, validation state, and submit controls.
- Why it matters: Collapses 3-8 tool calls for form analysis into one.
- Source: user
- Primary owning slice: M002/S04
- Supporting slices: M002/S01
- Validation: 7-level label resolution, form auto-detection, fieldset grouping, submit button discovery. Verified end-to-end against 12-field test form. Build passes.
- Notes: Must handle label association via for/id, wrapping label, aria-label, aria-labelledby, and placeholder.

### R023 — A browser_fill_form tool that maps labels/names/placeholders to inputs and fills them with type-aware Playwright APIs.
- Class: core-capability
- Status: validated
- Description: A browser_fill_form tool that maps labels/names/placeholders to inputs and fills them with type-aware Playwright APIs.
- Why it matters: Collapses 3-5 tool calls for form filling into one.
- Source: user
- Primary owning slice: M002/S04
- Supporting slices: M002/S01
- Validation: 5-strategy field resolution, type-aware fill via Playwright APIs, verified end-to-end with 10 fields. Build passes.
- Notes: Returns matched fields, unmatched values, fields skipped, and validation state.

### R024 — A browser_find_best tool that returns scored candidates using deterministic heuristic ranking for 8 semantic intents.
- Class: core-capability
- Status: validated
- Description: A browser_find_best tool that returns scored candidates using deterministic heuristic ranking for 8 semantic intents.
- Why it matters: Cuts a round trip and reduces reasoning tokens for common element-finding tasks.
- Source: user
- Primary owning slice: M002/S05
- Supporting slices: M002/S01
- Validation: 8 intents implemented with 4-dimension scoring. Verified via Playwright tests. Build passes, tool count = 47.
- Notes: Deterministic heuristics only. No hidden LLM calls.

### R025 — A browser_act tool that resolves the top candidate for a semantic intent and executes the action in one call.
- Class: core-capability
- Status: validated
- Description: A browser_act tool that resolves the top candidate for a semantic intent and executes the action in one call.
- Why it matters: Collapses 2-4 tool calls for common micro-tasks into one.
- Source: user
- Primary owning slice: M002/S05
- Supporting slices: M002/S04
- Validation: Resolves via same scoring engine as browser_find_best. Executes via Playwright locator. Returns before/after diff. Build passes, tool count = 47.
- Notes: Builds on browser_find_best for element selection. Bounded — does not loop or retry.

### R026 — Test suite covers shared browser-side utilities, settle logic, screenshot resizing, form tools, and intent ranking.
- Class: quality-attribute
- Status: validated
- Description: Test suite covers shared browser-side utilities, settle logic, screenshot resizing, form tools, and intent ranking.
- Why it matters: Regression protection for refactored and new features.
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: all M002 slices
- Validation: 108 tests (63 unit + 45 integration) passing via `npm run test:browser-tools`.
- Notes: Test what's unit-testable without a browser. Integration tests with Playwright for tools that need a page.

### R029 — When auto-mode starts a new milestone, it automatically creates a git worktree under `.gsd/worktrees/<MID>/` with branch `milestone/<MID>`, `chdir`s into it, and dispatches all units from within the worktree. The user never runs a git command.
- Class: core-capability
- Status: validated
- Description: When auto-mode starts a new milestone, it automatically creates a git worktree under `.gsd/worktrees/<MID>/` with branch `milestone/<MID>`, `chdir`s into it, and dispatches all units from within the worktree. The user never runs a git command.
- Why it matters: Worktree isolation gives each milestone its own `.gsd/` directory, eliminating the entire category of `.gsd/` merge conflicts that have caused ~15 separate bug fixes to date.
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: S01 createAutoWorktree creates worktree with milestone/<MID> branch, chdir, dispatches from within. 21 assertions in auto-worktree.test.ts. S07 e2e lifecycle test proves full create-execute-merge-teardown.
- Notes: Handles fresh milestone, resumed milestone, and coexists with manual `/worktree` command.

### R030 — When a milestone completes, the milestone branch is squash-merged to main with a rich commit message, the worktree is removed, and `process.chdir` returns to the main project root. Main receives exactly one commit per milestone.
- Class: core-capability
- Status: validated
- Description: When a milestone completes, the milestone branch is squash-merged to main with a rich commit message, the worktree is removed, and `process.chdir` returns to the main project root. Main receives exactly one commit per milestone.
- Why it matters: Main stays clean and always represents completed, working milestones. One commit per milestone is individually revertable.
- Source: user
- Primary owning slice: M003/S03
- Supporting slices: M003/S01
- Validation: mergeMilestoneToMain with 23 assertions in auto-worktree-milestone-merge.test.ts. S07 e2e verifies single squash commit on main with worktree removed and branch deleted.
- Notes: Handles dirty worktree (auto-commit), auto-push, and worktree/branch cleanup.

### R031 — Completed slices merge into the milestone branch via `--no-ff` merge instead of squash. This preserves the full per-task commit history on the milestone branch, with merge commits providing natural slice boundaries.
- Class: core-capability
- Status: validated
- Description: Completed slices merge into the milestone branch via `--no-ff` merge instead of squash. This preserves the full per-task commit history on the milestone branch, with merge commits providing natural slice boundaries.
- Why it matters: The commit history is a diary of the agent's work. `--no-ff` merge commits give clean slice boundaries while keeping all commits.
- Source: user
- Primary owning slice: M003/S02
- Supporting slices: M003/S01
- Validation: mergeSliceToMilestone with 21 assertions in auto-worktree-merge.test.ts proving merge commits, distinct boundaries, branch deletion. S07 e2e verifies both slice titles in final squash commit.
- Notes: Default for worktree-isolated mode. Branch-per-slice retains existing squash default.

### R032 — When a milestone squash-merges to main, the commit message summarizes all slices and their key outcomes. Format: conventional commit subject + slice task list body + branch metadata.
- Class: core-capability
- Status: validated
- Description: When a milestone squash-merges to main, the commit message summarizes all slices and their key outcomes. Format: conventional commit subject + slice task list body + branch metadata.
- Why it matters: Main's git log should read like a changelog. Each milestone commit should tell the full story of what was built.
- Source: user
- Primary owning slice: M003/S03
- Supporting slices: none
- Validation: S03 tests verify feat(MID) conventional commit format with slice listing. S07 e2e confirms both slice titles present in squash commit message.

### R035 — When git operations fail during auto-mode (merge conflict, checkout failure, corrupt state), the system automatically attempts repair: abort incomplete merges, reset working tree, retry the operation. Only truly unresolvable conflicts pause auto-mode.
- Class: core-capability
- Status: validated
- Description: When git operations fail during auto-mode (merge conflict, checkout failure, corrupt state), the system automatically attempts repair: abort incomplete merges, reset working tree, retry the operation. Only truly unresolvable conflicts pause auto-mode.
- Why it matters: Git errors are the #1 cause of auto-mode halting. Self-healing eliminates most of those stops.
- Source: user
- Primary owning slice: M003/S05
- Supporting slices: M003/S01, M003/S02, M003/S03
- Validation: git-self-heal.ts with abortAndReset, withMergeHeal, recoverCheckout, formatGitError. 14 assertions against real broken git repos. Wired into auto-worktree.ts merge/checkout paths. S07 e2e self-heal group (4 assertions).
- Notes: Real conflicts escalate immediately (no retry). Transient failures get abort+reset+retry.

### R036 — `.gsd/` conflict resolution code bypassed in worktree merge path and annotated as branch-mode-only in git-service.ts.
- Class: quality-attribute
- Status: validated
- Description: `.gsd/` conflict resolution code bypassed in worktree merge path and annotated as branch-mode-only in git-service.ts.
- Why it matters: Dead conflict resolution code is maintenance burden. Worktree isolation makes it structurally unnecessary.
- Source: inferred
- Primary owning slice: M003/S02
- Supporting slices: M003/S06
- Validation: mergeSliceToMilestone has zero .gsd/ conflict resolution code. git-service.ts conflict resolution annotated as branch-mode-only. D038 documents structural impossibility of .gsd/ conflicts in worktree mode.
- Notes: Branch-mode path preserved for git.isolation: "branch" users per R038.

### R037 — Users with zero git knowledge should never see a git error message during auto-mode. All git operations are invisible. If something fails, the system self-heals or presents a non-technical explanation with a clear action.
- Class: primary-user-loop
- Status: validated
- Description: Users with zero git knowledge should never see a git error message during auto-mode. All git operations are invisible. If something fails, the system self-heals or presents a non-technical explanation with a clear action.
- Why it matters: Vibe coders are the primary market. Git errors destroy trust.
- Source: user
- Primary owning slice: M003/S05
- Supporting slices: all M003 slices
- Validation: formatGitError translates all git errors to non-technical messages with /gsd doctor suggestion. Self-heal handles transient failures silently. Only real code conflicts surface to user.

### R038 — Existing projects that use the branch-per-slice model continue working exactly as they do today. No migration required.
- Class: continuity
- Status: validated
- Description: Existing projects that use the branch-per-slice model continue working exactly as they do today. No migration required.
- Why it matters: Breaking existing users' workflows would destroy trust.
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: none
- Validation: shouldUseWorktreeIsolation detects legacy gsd/* branches and defaults to branch mode. 291 unit tests pass with zero regressions. mergeSliceToMain in git-service.ts untouched.

### R039 — Manual `/worktree` command coexists with auto-mode's milestone worktrees via different naming conventions (milestone/ vs worktree/ branches).
- Class: integration
- Status: validated
- Description: Manual `/worktree` command coexists with auto-mode's milestone worktrees via different naming conventions (milestone/ vs worktree/ branches).
- Why it matters: Manual worktrees are a valuable exploration tool.
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: S01 uses milestone/<MID> branches for auto-worktrees, worktree/<name> for manual. Integration test proves coexistence without branch collisions.

### R040 — `/gsd doctor` detects and optionally fixes git-related issues: orphaned auto-worktrees, stale milestone branches, corrupt merge state (MERGE_HEAD/SQUASH_MSG), tracked runtime files.
- Class: operability
- Status: validated
- Description: `/gsd doctor` detects and optionally fixes git-related issues: orphaned auto-worktrees, stale milestone branches, corrupt merge state (MERGE_HEAD/SQUASH_MSG), tracked runtime files.
- Why it matters: When things do go wrong, users need a one-command fix.
- Source: inferred
- Primary owning slice: M003/S06
- Supporting slices: M003/S05
- Validation: 4 DoctorIssueCode values with detection and fix logic in checkGitHealth. 6 integration tests (17 assertions) in doctor-git.test.ts covering detect/fix/verify cycle for all codes plus safety guards.

### R041 — Test suite covers auto-worktree create/teardown, --no-ff slice merge, milestone squash, preference switching, self-heal, doctor checks. All existing git tests pass.
- Class: quality-attribute
- Status: validated
- Description: Test suite covers auto-worktree create/teardown, --no-ff slice merge, milestone squash, preference switching, self-heal, doctor checks. All existing git tests pass.
- Why it matters: The git system is the most bug-prone part of GSD. Tests prevent regressions.
- Source: inferred
- Primary owning slice: M003/S07
- Supporting slices: all M003 slices
- Validation: worktree-e2e.test.ts — 20 assertions across 5 groups (lifecycle, preference gating, merge mode, self-heal, doctor). 291 unit tests pass with zero regressions.

### R060 — Research prompts produce an unknowns inventory where every implementation-affecting claim is classified by evidence basis (observed, training-data, inferred, assumption, unknown). Each non-observed claim has a typed resolution path (check-docs, read-code, experiment, ask-user, fetch-reference, search). Training data recall is explicitly classified as unverified.
- Class: core-capability
- Status: validated
- Description: Research prompts produce an unknowns inventory where every implementation-affecting claim is classified by evidence basis (observed, training-data, inferred, assumption, unknown). Each non-observed claim has a typed resolution path (check-docs, read-code, experiment, ask-user, fetch-reference, search). Training data recall is explicitly classified as unverified.
- Why it matters: Without evidence classification, training-data recall is treated as fact. The agent states `actions/checkout@v4` with confidence and it's wrong. The unknowns inventory makes the gap visible and gives it a resolution path. This addresses the [process gap failure mode](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/README.md#the-hallucination-pivot-point) from ARL research.
- Source: user, informed by [hallucination-detector](https://github.com/bitflight-devops/hallucination-detector) evidence classification and [ARL R1 Information Completeness gate](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/README.md#the-10-gates)
- Primary owning slice: M005-8pv12q/S01
- Supporting slices: none
- Validation: templates/research.md has Unknowns Inventory section with evidence basis classification. research-milestone.md and research-slice.md step 7 instruct researchers to classify implementation-affecting claims. Delivered in commit 01059a8.
- Notes: Research output template gains `## Unknowns Inventory` section. Research prompts gain evidence classification instructions.

### R061 — Plan prompts read the unknowns inventory from research and build resolution steps into task plans. Each unresolved unknown becomes a concrete step. When an unknown is resolved, its impact on existing assumptions is validated before proceeding.
- Class: core-capability
- Status: validated
- Description: Plan prompts read the unknowns inventory from research and build resolution steps into task plans. Each unresolved unknown becomes a concrete step. When an unknown is resolved, its impact on existing assumptions is validated before proceeding.
- Why it matters: The planner is where unknowns become actionable. Without this, the unknowns inventory is information that goes nowhere. With it, a task with 20 unknowns naturally gets 20 resolution steps — same pipeline, longer list.
- Source: user, informed by [planner-rt-ica skill](https://github.com/Jamie-BitFlight/claude_skills/tree/main/plugins/development-harness/skills/planner-rt-ica)
- Primary owning slice: M005-8pv12q/S02
- Supporting slices: M005-8pv12q/S01
- Validation: plan-slice.md step 6 and plan-milestone.md step 6 convert unresolved unknowns to concrete resolution steps; prohibition on silently dropping them is explicit. Delivered in commit 01059a8.
- Notes: Plan prompt changes. Tasks gain resolution steps. Impact validation: resolved unknowns checked against existing assumptions.

### R062 — Execute-task prompt contains a verification protocol: before acting on an inferred or training-data claim, verify it first. The executor names the claim, checks if it's observed, and if not — verifies before proceeding. Bug-fix tasks additionally follow reproduce → define success → apply → verify.
- Class: core-capability
- Status: validated
- Description: Execute-task prompt contains a verification protocol: before acting on an inferred or training-data claim, verify it first. The executor names the claim, checks if it's observed, and if not — verifies before proceeding. Bug-fix tasks additionally follow reproduce → define success → apply → verify.
- Why it matters: Execution is where unverified claims become committed code. The verification protocol catches training-data assumptions at the last moment before they become implementation. Informed by [verification-gate skill](https://github.com/Jamie-BitFlight/claude_skills/tree/main/plugins/verification-gate/skills/verification-gate) and [validation-protocol skill](https://github.com/Jamie-BitFlight/claude_skills/tree/main/plugins/development-harness/skills/validation-protocol).
- Source: user, informed by [ARL Principle 1: Structure Over Instruction](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/autonomous-loop-principles.md#principle-1-structure-over-instruction)
- Primary owning slice: M005-8pv12q/S03
- Supporting slices: M005-8pv12q/S02
- Validation: execute-task.md step 3 (evidence check before acting) and step 4 (bug-fix protocol) present as numbered execution steps. Delivered in commit 01059a8.
- Notes: Execute-task prompt changes. Verification is part of execution flow, not a separate ceremony.

### R063 — Complete-slice prompt checks that all unknowns from the plan are resolved with evidence. Reports which claims moved from unverified to observed. Reports any items that remain unresolved.
- Class: core-capability
- Status: validated
- Description: Complete-slice prompt checks that all unknowns from the plan are resolved with evidence. Reports which claims moved from unverified to observed. Reports any items that remain unresolved.
- Why it matters: Completion is the accountability gate. Without it, unknowns can be silently dropped. With it, the completer explicitly confirms the knowledge set is complete.
- Source: user
- Primary owning slice: M005-8pv12q/S04
- Supporting slices: M005-8pv12q/S02
- Validation: complete-slice.md step 6 checks unknowns resolution status, reports N/M count, notes REFUTED adjustments, flags unresolved items. Delivered in commit 01059a8.
- Notes: Complete-slice prompt changes. Structural: if unknowns existed in the plan, report their resolution status.

### R064 — After `research-milestone` and `research-slice` units complete, a fact-check coordinator evaluates unresolved verifiable claims and initiates independent verification work.
- Class: core-capability
- Status: validated
- Description: After `research-milestone` and `research-slice` units complete, a fact-check coordinator evaluates unresolved verifiable claims and initiates independent verification work.
- Why it matters: M005-8pv12q only made claims visible. Without a coordinator, the same planning inputs still flow forward unverified.
- Source: user
- Primary owning slice: M006-tbhsp8/S02
- Supporting slices: M006-tbhsp8/S01
- Validation: Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` (42/42 pass). Live proof path shows research-triggered fact-check artifacts are produced and consumed through the runtime harness; S01 fixture + S02/S03 integration tests and M007-VALIDATION-REPORT.json provide durable evidence.
- Notes: Coordinator should be implemented as a dedicated hook agent rather than a long inline hook prompt.

### R068 — Planner prompt assembly includes aggregate fact-check status and relevant REFUTED claim annotations so corrected evidence becomes a direct planning input.
- Class: core-capability
- Status: validated
- Description: Planner prompt assembly includes aggregate fact-check status and relevant REFUTED claim annotations so corrected evidence becomes a direct planning input.
- Why it matters: Evidence that never reaches the planner cannot change the plan. This is where corrected facts become actionable.
- Source: user
- Primary owning slice: M006-tbhsp8/S03
- Supporting slices: M006-tbhsp8/S01, M006-tbhsp8/S02
- Validation: Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` (42/42 pass) and `npx tsx --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` (3/3 pass). Prompt assembly includes `## Fact-Check Evidence`, REFUTED claim C001, and corrected value `5.2.0`; durable proof captured in `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`.
- Notes: Planning context should include aggregate status plus only the necessary REFUTED claims to control prompt size.

## Deferred

### R011 — Forecast secrets across all planned milestones, not just the active one.
- Class: core-capability
- Status: deferred
- Description: Forecast secrets across all planned milestones, not just the active one.
- Why it matters: Would provide a complete picture of all secrets needed for the project.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — single-milestone forecasting is sufficient for now.

### R012 — Track secret age and remind users when keys may need rotation.
- Class: operability
- Status: deferred
- Description: Track secret age and remind users when keys may need rotation.
- Why it matters: Security best practice, but not essential for the core workflow.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — out of scope for initial release.

### R027 — Keep a warm browser instance across rapid successive agent contexts to avoid ~2-3s Chrome cold-start per session.
- Class: core-capability
- Status: deferred
- Description: Keep a warm browser instance across rapid successive agent contexts to avoid ~2-3s Chrome cold-start per session.
- Why it matters: Would eliminate Chrome launch latency in auto-mode.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — skip completely per user direction.

### R042 — Run multiple milestones simultaneously in separate worktrees with independent auto-mode sessions.
- Class: core-capability
- Status: deferred
- Description: Run multiple milestones simultaneously in separate worktrees with independent auto-mode sessions.
- Why it matters: Natural extension of worktree-per-milestone architecture. Would enable parallel work streams.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — ship sequential milestone execution first. The worktree infrastructure naturally supports this later.

### R043 — Extend the Rust/libgit2 native module to cover write operations (commit, merge, checkout) in addition to the current read-only queries.
- Class: quality-attribute
- Status: deferred
- Description: Extend the Rust/libgit2 native module to cover write operations (commit, merge, checkout) in addition to the current read-only queries.
- Why it matters: Would eliminate execSync overhead for git writes on the hot path.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — execSync writes are functional. Optimize later if profiling shows it matters.

### R073 — Prioritize which unresolved claims get verified first based on risk, likely impact, or verification cost.
- Class: operability
- Status: deferred
- Description: Prioritize which unresolved claims get verified first based on risk, likely impact, or verification cost.
- Why it matters: Useful once the basic correction loop exists, but not necessary for the first structurally correct version.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Defer until real-world usage shows verification cost or latency problems.

### R074 — Add a first-class `models.factcheck` preference instead of reusing hook `model` plus `models.subagent` for coordinator/scout execution.
- Class: operability
- Status: deferred
- Description: Add a first-class `models.factcheck` preference instead of reusing hook `model` plus `models.subagent` for coordinator/scout execution.
- Why it matters: Could improve tuning and separation of concerns later, but existing model-routing surfaces are enough for the first version.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Defer unless configuration pressure proves current model-routing surfaces insufficient.

## Out of Scope

### R013 — A static database of known services with pre-written guidance for each API key.
- Class: anti-feature
- Status: out-of-scope
- Description: A static database of known services with pre-written guidance for each API key.
- Why it matters: Prevents scope creep. LLM-generated guidance is sufficient and stays current without maintenance.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: LLM generates guidance dynamically.

### R014 — Detect missing secrets during task execution and collect them inline.
- Class: anti-feature
- Status: out-of-scope
- Description: Detect missing secrets during task execution and collect them inline.
- Why it matters: Prevents scope confusion. M001 is about proactive collection, not reactive.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Existing secure_env_collect already handles reactive collection.

### R028 — Using hidden LLM calls inside browser_find_best or browser_act for intent resolution.
- Class: anti-feature
- Status: out-of-scope
- Description: Using hidden LLM calls inside browser_find_best or browser_act for intent resolution.
- Why it matters: Prevents unpredictable latency and cost.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: browser_find_best and browser_act use scoring heuristics, not LLM inference.

### R044 — Adding rebase as a merge strategy option alongside squash and --no-ff merge.
- Class: anti-feature
- Status: out-of-scope
- Description: Adding rebase as a merge strategy option alongside squash and --no-ff merge.
- Why it matters: Rebase rewrites history, which conflicts with the "commit diary" philosophy. It also introduces more failure modes (rebase conflicts are harder to auto-resolve than merge conflicts).
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: --no-ff merge + squash covers all needed use cases without history rewriting.

### R075 — Add telemetry, experiment fixtures, baseline comparison harness, or outcome analysis directly inside M006.
- Class: anti-feature
- Status: out-of-scope
- Description: Add telemetry, experiment fixtures, baseline comparison harness, or outcome analysis directly inside M006.
- Why it matters: Prevents M006 from ballooning into M007/M008 work before the correction loop itself exists.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Observation and experiments belong to later milestones.

### R076 — Write the public report, reproducibility package, or publication workflow as part of M006.
- Class: anti-feature
- Status: out-of-scope
- Description: Write the public report, reproducibility package, or publication workflow as part of M006.
- Why it matters: Keeps M006 focused on building the runtime system rather than documenting future results.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: This belongs to M009.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | validated | M001/S01 | none | plan-milestone.md Secret Forecasting section (line 62) instructs LLM to write manifest. Parser round-trip tested in parsers.test.ts. |
| R002 | continuity | validated | M001/S01 | none | parseSecretsManifest/formatSecretsManifest round-trip tested (parsers.test.ts), resolveMilestoneFile(base, mid, "SECRETS") resolves path. |
| R003 | primary-user-loop | validated | M001/S02 | M001/S01 | collectOneSecret renders numbered dim-styled guidance steps with wrapping (collect-from-manifest.test.ts tests 6-8). |
| R004 | primary-user-loop | validated | M001/S02 | none | showSecretsSummary() renders read-only ctx.ui.custom screen with status indicators via makeUI().progressItem() (collect-from-manifest.test.ts tests 4-5). |
| R005 | primary-user-loop | validated | M001/S02 | none | getManifestStatus cross-references checkExistingEnvKeys, categorizes env-present keys as existing (manifest-status.test.ts tests 4,7). collectSecretsFromManifest skips them (collect-from-manifest.test.ts tests 1-2). |
| R006 | integration | validated | M001/S02 | none | collectSecretsFromManifest calls detectDestination() for destination inference. applySecrets() routes to dotenv/vercel/convex accordingly. |
| R007 | core-capability | validated | M001/S03 | M001/S01, M001/S02 | startAuto() secrets gate at auto.ts:479. auto-secrets-gate.test.ts — 3/3 pass covering null manifest, pending keys, and no-pending-keys paths. |
| R008 | core-capability | validated | M001/S03 | M001/S01, M001/S02 | guided-flow.ts calls startAuto() directly (lines 52, 486, 647, 794) — all guided flow paths that start auto-mode inherit the secrets gate. |
| R009 | integration | validated | M001/S01 | none | plan-milestone.md has Secret Forecasting section at line 62 with instructions to write {{secretsOutputPath}} with H3 sections per key. |
| R010 | primary-user-loop | validated | M001/S02 | none | collectOneSecret accepts guidance parameter, renders numbered dim-styled lines with wrapTextWithAnsi above masked input (collect-from-manifest.test.ts tests 6-8). |
| R011 | core-capability | deferred | none | none | unmapped |
| R012 | operability | deferred | none | none | unmapped |
| R013 | anti-feature | out-of-scope | none | none | n/a |
| R014 | anti-feature | out-of-scope | none | none | n/a |
| R015 | quality-attribute | validated | M002/S01 | none | Extension loads via jiti, 43 tools register, browser navigate/snapshot/click work against real page, index.ts is 47-line orchestrator with zero registerTool calls, 9 tool files under tools/. |
| R016 | quality-attribute | validated | M002/S01 | none | window.__pi contains all 9 functions, survives navigation, refs.ts has zero inline redeclarations, close/reopen re-injects via addInitScript correctly. |
| R017 | core-capability | validated | M002/S02 | M002/S01 | postActionSummary eliminated from action tools, countOpenDialogs removed from ToolDeps, consolidated capture pattern. Build passes. |
| R018 | core-capability | validated | M002/S02 | none | explicit includeBodyText true/false per tool signal level in interaction.ts. Classification codified in D017. Build passes. |
| R019 | core-capability | validated | M002/S02 | none | zero_mutation_shortcut settle reason in state.ts type union and settle.ts return path. 60ms/30ms thresholds codified in D019. Build passes. |
| R020 | core-capability | validated | M002/S03 | M002/S01 | constrainScreenshot uses sharp(buffer).metadata() and sharp(buffer).resize(). Zero page.evaluate calls in capture.ts. Build passes. |
| R021 | core-capability | validated | M002/S03 | none | browser_navigate has screenshot parameter default false. Capture gated. Build passes. |
| R022 | core-capability | validated | M002/S04 | M002/S01 | 7-level label resolution, form auto-detection, fieldset grouping, submit button discovery. Verified end-to-end against 12-field test form. Build passes. |
| R023 | core-capability | validated | M002/S04 | M002/S01 | 5-strategy field resolution, type-aware fill via Playwright APIs, verified end-to-end with 10 fields. Build passes. |
| R024 | core-capability | validated | M002/S05 | M002/S01 | 8 intents implemented with 4-dimension scoring. Verified via Playwright tests. Build passes, tool count = 47. |
| R025 | core-capability | validated | M002/S05 | M002/S04 | Resolves via same scoring engine as browser_find_best. Executes via Playwright locator. Returns before/after diff. Build passes, tool count = 47. |
| R026 | quality-attribute | validated | M002/S06 | all M002 slices | 108 tests (63 unit + 45 integration) passing via `npm run test:browser-tools`. |
| R027 | core-capability | deferred | none | none | unmapped |
| R028 | anti-feature | out-of-scope | none | none | n/a |
| R029 | core-capability | validated | M003/S01 | none | S01 createAutoWorktree creates worktree with milestone/<MID> branch, chdir, dispatches from within. 21 assertions in auto-worktree.test.ts. S07 e2e lifecycle test proves full create-execute-merge-teardown. |
| R030 | core-capability | validated | M003/S03 | M003/S01 | mergeMilestoneToMain with 23 assertions in auto-worktree-milestone-merge.test.ts. S07 e2e verifies single squash commit on main with worktree removed and branch deleted. |
| R031 | core-capability | validated | M003/S02 | M003/S01 | mergeSliceToMilestone with 21 assertions in auto-worktree-merge.test.ts proving merge commits, distinct boundaries, branch deletion. S07 e2e verifies both slice titles in final squash commit. |
| R032 | core-capability | validated | M003/S03 | none | S03 tests verify feat(MID) conventional commit format with slice listing. S07 e2e confirms both slice titles present in squash commit message. |
| R035 | core-capability | validated | M003/S05 | M003/S01, M003/S02, M003/S03 | git-self-heal.ts with abortAndReset, withMergeHeal, recoverCheckout, formatGitError. 14 assertions against real broken git repos. Wired into auto-worktree.ts merge/checkout paths. S07 e2e self-heal group (4 assertions). |
| R036 | quality-attribute | validated | M003/S02 | M003/S06 | mergeSliceToMilestone has zero .gsd/ conflict resolution code. git-service.ts conflict resolution annotated as branch-mode-only. D038 documents structural impossibility of .gsd/ conflicts in worktree mode. |
| R037 | primary-user-loop | validated | M003/S05 | all M003 slices | formatGitError translates all git errors to non-technical messages with /gsd doctor suggestion. Self-heal handles transient failures silently. Only real code conflicts surface to user. |
| R038 | continuity | validated | M003/S04 | none | shouldUseWorktreeIsolation detects legacy gsd/* branches and defaults to branch mode. 291 unit tests pass with zero regressions. mergeSliceToMain in git-service.ts untouched. |
| R039 | integration | validated | M003/S01 | none | S01 uses milestone/<MID> branches for auto-worktrees, worktree/<name> for manual. Integration test proves coexistence without branch collisions. |
| R040 | operability | validated | M003/S06 | M003/S05 | 4 DoctorIssueCode values with detection and fix logic in checkGitHealth. 6 integration tests (17 assertions) in doctor-git.test.ts covering detect/fix/verify cycle for all codes plus safety guards. |
| R041 | quality-attribute | validated | M003/S07 | all M003 slices | worktree-e2e.test.ts — 20 assertions across 5 groups (lifecycle, preference gating, merge mode, self-heal, doctor). 291 unit tests pass with zero regressions. |
| R042 | core-capability | deferred | none | none | unmapped |
| R043 | quality-attribute | deferred | none | none | unmapped |
| R044 | anti-feature | out-of-scope | none | none | n/a |
| R045 | core-capability | active | M004/S01 | none | unmapped |
| R046 | continuity | active | M004/S01 | M004/S03 | unmapped |
| R047 | core-capability | active | M004/S02 | M004/S01 | unmapped |
| R048 | quality-attribute | active | M004/S02 | M004/S06 | unmapped |
| R049 | core-capability | active | M004/S03 | M004/S01, M004/S02 | unmapped |
| R050 | continuity | active | M004/S03 | M004/S06 | unmapped |
| R051 | operability | active | M004/S04 | M004/S03 | unmapped |
| R052 | core-capability | active | M004/S04 | M004/S01, M004/S02 | unmapped |
| R053 | integration | active | M004/S05 | M004/S01 | unmapped |
| R054 | integration | active | M004/S05 | M004/S01 | unmapped |
| R055 | core-capability | active | M004/S06 | M004/S03 | unmapped |
| R056 | operability | active | M004/S06 | M004/S01 | unmapped |
| R057 | quality-attribute | active | M004/S07 | M004/S03, M004/S04 | unmapped |
| R060 | core-capability | validated | M005-8pv12q/S01 | none | templates/research.md has Unknowns Inventory section with evidence basis classification. research-milestone.md and research-slice.md step 7 instruct researchers to classify implementation-affecting claims. Delivered in commit 01059a8. |
| R061 | core-capability | validated | M005-8pv12q/S02 | M005-8pv12q/S01 | plan-slice.md step 6 and plan-milestone.md step 6 convert unresolved unknowns to concrete resolution steps; prohibition on silently dropping them is explicit. Delivered in commit 01059a8. |
| R062 | core-capability | validated | M005-8pv12q/S03 | M005-8pv12q/S02 | execute-task.md step 3 (evidence check before acting) and step 4 (bug-fix protocol) present as numbered execution steps. Delivered in commit 01059a8. |
| R063 | core-capability | validated | M005-8pv12q/S04 | M005-8pv12q/S02 | complete-slice.md step 6 checks unknowns resolution status, reports N/M count, notes REFUTED adjustments, flags unresolved items. Delivered in commit 01059a8. |
| R064 | core-capability | validated | M006-tbhsp8/S02 | M006-tbhsp8/S01 | Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` (42/42 pass). Live proof path shows research-triggered fact-check artifacts are produced and consumed through the runtime harness; S01 fixture + S02/S03 integration tests and M007-VALIDATION-REPORT.json provide durable evidence. |
| R065 | core-capability | active | M006-tbhsp8/S01 | M006-tbhsp8/S02 | mapped |
| R066 | integration | active | M006-tbhsp8/S01 | M006-tbhsp8/S02, M006-tbhsp8/S04 | mapped |
| R067 | operability | active | M006-tbhsp8/S02 | none | mapped |
| R068 | core-capability | validated | M006-tbhsp8/S03 | M006-tbhsp8/S01, M006-tbhsp8/S02 | Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-*.test.ts` (42/42 pass) and `npx tsx --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` (3/3 pass). Prompt assembly includes `## Fact-Check Evidence`, REFUTED claim C001, and corrected value `5.2.0`; durable proof captured in `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`. |
| R069 | core-capability | validated | M006-tbhsp8/S04 | M006-tbhsp8/S03 | Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` and the full `factcheck-*.test.ts` suite. Dispatch reroutes to `plan-slice` when `FACTCHECK-STATUS.json` reports `planImpacting=true`, and the final audit report records `dispatchAction={action:"dispatch",unitType:"plan-slice",unitId:"M999-PROOF/S01"}` before stale execution continues. |
| R070 | integration | validated | M006-tbhsp8/S04 | M006-tbhsp8/S01 | Re-verified at milestone closeout with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` and `factcheck-final-audit.test.ts`. Runtime revision routing is explicit: plan-impacting slice refutations dispatch `plan-slice`; negative tests prove the special rule falls through when status is missing or `planImpacting=false`, preserving normal planning/recovery semantics. |
| R071 | failure-visibility | validated | M006-tbhsp8/S05 | M006-tbhsp8/S04 | Milestone closeout now includes durable fact-check outcome reporting via `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` plus the M007 milestone summary. The final audit test writes and schema-validates the report with refuted count, reroute target, corrected evidence presence, dispatch action, and proof artifacts; re-verified with `npx tsx --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` (3/3 pass). |
| R072 | quality-attribute | active | M006-tbhsp8/S01 | M006-tbhsp8/S03 | mapped |
| R073 | operability | deferred | none | none | unmapped |
| R074 | operability | deferred | none | none | unmapped |
| R075 | anti-feature | out-of-scope | none | none | n/a |
| R076 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 20
- Mapped to slices: 20
- Validated: 42 (R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R015, R016, R017, R018, R019, R020, R021, R022, R023, R024, R025, R026, R029, R030, R031, R032, R035, R036, R037, R038, R039, R040, R041, R060, R061, R062, R063, R064, R068, R069, R070, R071)
- Unmapped active requirements: 0
