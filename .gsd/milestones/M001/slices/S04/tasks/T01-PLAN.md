---
estimated_steps: 5
estimated_files: 3
---

# T01: Build definition-loader.ts and graphFromDefinition()

**Slice:** S04 — YAML Definitions + Run Snapshotting + GRAPH.yaml
**Milestone:** M001

## Description

Create the pure data layer for YAML workflow definitions. `definition-loader.ts` is a new file that parses V1 YAML workflow definitions and validates their schema. `graph.ts` gets a new `graphFromDefinition()` function that converts a parsed definition into a `WorkflowGraph` with all steps in "pending" status. Both are pure functions with no engine or runtime dependencies — just `yaml` (already installed) and `node:fs`.

This task also writes unit tests for the definition loader to validate schema enforcement.

**Relevant skills:** None required — this is pure TypeScript data module work.

## Steps

1. **Create `definition-loader.ts`** at `src/resources/extensions/gsd/definition-loader.ts`:
   - Define types: `StepDefinition` (id, name, prompt, requires, produces, plus optional S05/S06 fields), `WorkflowDefinition` (version, name, description, params, steps)
   - Define internal YAML types using snake_case keys (`depends_on` not `dependsOn`, `context_from` not `contextFrom`) — matches convention from `graph.ts` (see P005 in KNOWLEDGE.md)
   - Export `validateDefinition(parsed: unknown): { valid: boolean; errors: string[] }`:
     - `version` must be `1` (number)
     - `name` must be a non-empty string
     - `steps` must be a non-empty array
     - Each step must have `id` (string), `name` (string), `prompt` (string)
     - `produces` entries must not contain `..` (path traversal guard)
     - Unknown fields are silently accepted (forward compat for `context_from`, `verify`, `iterate` from S05/S06)
   - Export `loadDefinition(defsDir: string, name: string): WorkflowDefinition`:
     - Reads `<defsDir>/<name>.yaml`
     - Parses with `yaml.parse()`
     - Validates with `validateDefinition()`
     - Converts snake_case YAML → camelCase TypeScript
     - Throws descriptive error if file missing or validation fails
   - Import only from `yaml` and `node:fs` + `node:path`

2. **Add `graphFromDefinition()` to `graph.ts`**:
   - Import `WorkflowDefinition` type from `definition-loader.ts` (use `.js` extension per project convention)
   - `graphFromDefinition(def: WorkflowDefinition): WorkflowGraph` creates a graph with:
     - Each definition step → `GraphStep` with `status: "pending"`, `dependsOn` from step's `requires`
     - `metadata.name` from `def.name`, `metadata.createdAt` from current ISO timestamp

3. **Write unit tests** at `src/resources/extensions/gsd/tests/definition-loader.test.ts`:
   - Valid 3-step YAML definition → `loadDefinition` returns correct structure
   - Missing `version` field → validation error
   - `version: 2` (unsupported) → validation error
   - Missing step `id` → validation error
   - Missing step `prompt` → validation error
   - `produces` with `..` path traversal → validation error
   - Unknown fields (`context_from`, `iterate`) → accepted silently, no error
   - `graphFromDefinition` → 3 pending steps with correct dependencies
   - Use `mkdtempSync`/`rmSync` pattern from existing tests for temp dirs
   - Use `--import ./src/resources/extensions/gsd/tests/resolve-ts.mjs` loader (L003 in KNOWLEDGE.md)

4. **Typecheck**: `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors (K001)

5. **Run tests**: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts`

## Must-Haves

- [ ] `WorkflowDefinition` and `StepDefinition` types are exported from `definition-loader.ts`
- [ ] `validateDefinition` rejects: missing version, wrong version, missing step id, missing step prompt, path traversal in produces
- [ ] `validateDefinition` accepts unknown fields silently (forward compatibility)
- [ ] `loadDefinition` reads YAML from filesystem and returns typed `WorkflowDefinition`
- [ ] `graphFromDefinition` converts `WorkflowDefinition` → `WorkflowGraph` with all steps pending
- [ ] YAML uses `depends_on` / `context_from` (snake_case), TypeScript uses `dependsOn` / `contextFrom` (camelCase)
- [ ] All tests pass, 0 type errors

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all pass
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 still pass (regression check)

## Inputs

- `src/resources/extensions/gsd/graph.ts` — existing graph data module to extend with `graphFromDefinition()`
- `src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — existing test patterns (mkdtempSync, resolve-ts.mjs loader)
- V1 YAML schema from S04-RESEARCH.md (inlined in slice plan's Must-Haves)
- KNOWLEDGE.md rules: K001 (typecheck command), P005 (snake_case YAML convention), L003 (resolve-ts.mjs loader)

## Expected Output

- `src/resources/extensions/gsd/definition-loader.ts` — new file (~80 lines): types + `validateDefinition` + `loadDefinition`
- `src/resources/extensions/gsd/graph.ts` — modified: added `graphFromDefinition()` function (~20 lines)
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — new file (~120 lines): 8+ unit tests
