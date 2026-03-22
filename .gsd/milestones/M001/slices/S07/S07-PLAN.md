# S07: CLI Surface + Dashboard Integration

**Goal:** `/gsd workflow new|run|list|pause|resume|validate` commands work with tab completion; custom workflow engine state renders in the TUI progress widget and dashboard overlay.
**Demo:** Run `/gsd workflow validate <name>` to validate a definition, `/gsd workflow run <name>` to create a run and start auto-mode, `/gsd workflow list` to see runs, `/gsd workflow pause` to pause. The dashboard overlay shows "Workflow Step" for `custom-step` units and the progress widget updates during custom engine execution.

## Must-Haves

- Six workflow subcommands implemented: `new` (stub), `run`, `list`, `validate`, `pause`, `resume`
- Tab completion for `/gsd workflow` showing all six subcommands
- Tab completion for `/gsd workflow run <name>` and `/gsd workflow validate <name>` listing available definition files
- `updateProgressWidget` called in the custom engine loop path so the TUI widget renders during workflow execution
- `unitLabel("custom-step")` returns `"Workflow Step"` in the dashboard overlay (not falling through to default)

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/commands-workflow-custom.test.ts` — tests for all six subcommands and catalog completions
- `npx tsx --test src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts` — tests for `unitLabel("custom-step")` and `updateProgressWidget` presence in custom engine path

## Tasks

- [x] **T01: Implement workflow subcommands and catalog registration** `est:45m`
  - Why: No `/gsd workflow run|list|validate|pause|resume|new` commands exist. The existing `handleWorkflowCommand` handles dev workflow commands (queue, discuss, quick, etc.) — custom workflow commands need a new routing block at the top of this function.
  - Files: `src/resources/extensions/gsd/commands/handlers/workflow.ts`, `src/resources/extensions/gsd/commands/catalog.ts`, `src/resources/extensions/gsd/tests/commands-workflow-custom.test.ts`
  - Do: (1) Add `if (trimmed.startsWith("workflow "))` block at the top of `handleWorkflowCommand` that parses the subcommand and routes to handler functions. (2) Implement handlers: `run <name>` calls `createRun()` → `setActiveEngineId("custom")` → `setActiveRunDir(runDir)` → `startAuto()`; `list` calls `listRuns()` and formats output; `validate <name>` loads YAML and calls `validateDefinition()`; `pause` calls `pauseAuto()` when custom engine active; `resume` calls `startAuto()`; `new` returns a "use /skill create-workflow" message. (3) Add `workflow` to `TOP_LEVEL_SUBCOMMANDS` in catalog.ts. (4) Add `NESTED_COMPLETIONS["workflow"]` with all six subcommands. (5) Add definition-name completion for 3-part prefixes (`workflow run <partial>` and `workflow validate <partial>`) by scanning `.gsd/workflow-defs/*.yaml`. (6) Write test file with command handler tests (mock ctx.ui.notify, real temp dirs) and catalog completion tests.
  - Verify: `npx tsx --test src/resources/extensions/gsd/tests/commands-workflow-custom.test.ts`
  - Done when: All six subcommands route correctly, catalog completions return expected results, tests pass.

- [x] **T02: Wire progress widget into custom engine loop and fix dashboard overlay** `est:20m`
  - Why: The custom engine path in `auto/loop.ts` (line ~127) bypasses `runDispatch` where `deps.updateProgressWidget()` normally gets called — so the TUI widget never renders during workflow execution. The dashboard overlay's `unitLabel()` is missing a `custom-step` case, causing it to fall through to the default which returns the raw type string.
  - Files: `src/resources/extensions/gsd/auto/loop.ts`, `src/resources/extensions/gsd/dashboard-overlay.ts`, `src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts`
  - Do: (1) In `auto/loop.ts`, add `deps.updateProgressWidget(ctx, iterData.unitType, iterData.unitId, iterData.state)` in the custom engine path — after building `iterData` and before `runGuards`. (2) In `dashboard-overlay.ts`, add `case "custom-step": return "Workflow Step";` to the `unitLabel()` switch statement. (3) Write test file: test that `unitLabel("custom-step")` returns "Workflow Step"; test that the `autoLoop` custom engine path includes `updateProgressWidget` in the mock deps call log (use the existing `custom-engine-loop-integration.test.ts` pattern).
  - Verify: `npx tsx --test src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts`
  - Done when: `unitLabel("custom-step")` returns "Workflow Step", progress widget call is verified in custom engine loop path, tests pass.

## Files Likely Touched

- `src/resources/extensions/gsd/commands/handlers/workflow.ts`
- `src/resources/extensions/gsd/commands/catalog.ts`
- `src/resources/extensions/gsd/auto/loop.ts`
- `src/resources/extensions/gsd/dashboard-overlay.ts`
- `src/resources/extensions/gsd/tests/commands-workflow-custom.test.ts`
- `src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts`

## Observability / Diagnostics

- **Runtime signals:** Each workflow subcommand produces a `ctx.ui.notify()` call with success/failure/warning, making command outcomes visible in the TUI notification area. Error notifications include the underlying error message for diagnosis.
- **Inspection surfaces:** Run directories at `.gsd/workflow-runs/<name>/<timestamp>/` contain human-readable DEFINITION.yaml, GRAPH.yaml, and PARAMS.json — all inspectable with `cat`/`less`. `listRuns()` returns structured metadata including step counts and status. `/gsd workflow list` renders this directly.
- **Failure visibility:** Missing definitions, invalid YAML, validation errors, and engine state mismatches all produce specific error/warning messages (not silent failures). The `validate` subcommand surfaces all validation errors in a single notification.
- **Redaction constraints:** No secrets or API keys flow through workflow subcommands. Parameter overrides are stored in PARAMS.json (plain key=value pairs). No redaction needed.
