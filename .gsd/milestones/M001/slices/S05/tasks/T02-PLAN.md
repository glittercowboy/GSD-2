---
estimated_steps: 3
estimated_files: 2
---

# T02: Implement four verification policies with unit tests

**Slice:** S05 — Context Continuity + Verification Policies
**Milestone:** M001

## Description

Creates `custom-verification.ts` with the four verification policy handlers (content-heuristic, shell-command, prompt-verify, human-review) as pure functions dispatched by policy type. Each handler receives the policy config, the run directory, and the step's produces paths, and returns a structured result. This module has no engine dependencies — it's consumed by `CustomExecutionPolicy.verify()` in T03.

The `VerifyPolicy` type from T01's `definition-loader.ts` is imported here. The `runVerification()` dispatcher pattern-matches on `policy.policy` and delegates to the right handler.

**Relevant skills:** None required — pure TypeScript with `node:child_process.spawnSync` for shell-command policy.

## Steps

1. **Create `custom-verification.ts`.**
   - New file at `src/resources/extensions/gsd/custom-verification.ts`
   - Import `VerifyPolicy` from `definition-loader.ts`
   - Export result type:
     ```typescript
     export interface VerificationResult {
       result: "continue" | "retry" | "pause";
       reason?: string;
     }
     ```
   - Export main dispatcher:
     ```typescript
     export function runVerification(
       policy: VerifyPolicy | undefined,
       runDir: string,
       produces: string[],
     ): VerificationResult
     ```
   - If `policy` is `undefined` → return `{ result: "continue" }` (no verification configured)
   - **content-heuristic handler:**
     - For each path in `produces`, check `existsSync(join(runDir, path))`
     - If file missing → return `{ result: "retry", reason: "Artifact missing: <path>" }`
     - If `minSize` is set, check `statSync(path).size >= minSize`
     - If too small → return `{ result: "retry", reason: "Artifact too small: <path> (<actual> < <minSize> bytes)" }`
     - If `pattern` is set, read file content and check `content.includes(pattern)`
     - If pattern not found → return `{ result: "retry", reason: "Pattern not found in <path>: <pattern>" }`
     - All checks pass → return `{ result: "continue" }`
   - **shell-command handler:**
     - Security guard: if `command.includes("..")` → return `{ result: "retry", reason: "Command rejected: contains '..'" }`
     - `spawnSync(command, { cwd: runDir, shell: true, timeout: 30000, stdio: "pipe" })`
     - Exit code 0 → return `{ result: "continue" }`
     - Non-zero → return `{ result: "retry", reason: "Command exited with code <code>" }`
     - Error/timeout → return `{ result: "retry", reason: "Command failed: <error message>" }`
   - **prompt-verify handler:**
     - Return `{ result: "pause", reason: "Verification prompt: " + policy.prompt }`
     - (Per research doc: true LLM-driven verification is deferred. V1 pauses and surfaces the prompt.)
   - **human-review handler:**
     - Return `{ result: "pause", reason: "Human review required for this step" }`

2. **Write unit tests in `custom-verification.test.ts`.**
   - New file at `src/resources/extensions/gsd/tests/custom-verification.test.ts`
   - Use `node:test` and `node:assert/strict`. Create temp directories with `mkdtempSync`.
   - Tests:
     - **No policy (undefined)** → returns `{ result: "continue" }`
     - **content-heuristic: artifact exists, no min_size or pattern** → `"continue"`
     - **content-heuristic: artifact missing** → `"retry"` with reason mentioning the path
     - **content-heuristic: artifact exists but too small** → `"retry"` (write a 10-byte file, set minSize: 100)
     - **content-heuristic: artifact exists, meets size, but pattern not found** → `"retry"`
     - **content-heuristic: artifact exists, meets size, pattern found** → `"continue"`
     - **shell-command: exit 0** → `"continue"` (use `command: "true"` or `command: "exit 0"`)
     - **shell-command: exit 1** → `"retry"` (use `command: "false"` or `command: "exit 1"`)
     - **shell-command: command contains `..`** → `"retry"` with rejection reason
     - **prompt-verify** → `"pause"` with reason containing the prompt text
     - **human-review** → `"pause"` with reason containing "Human review"

3. **Typecheck.**
   - Run `npx tsc --noEmit --project tsconfig.extensions.json` — must produce 0 errors.

## Must-Haves

- [ ] `runVerification()` correctly dispatches to all four policies based on `policy.policy`
- [ ] `content-heuristic` checks file existence, min_size, and pattern — returns "retry" on any failure
- [ ] `shell-command` runs `spawnSync` with 30s timeout, rejects `..` commands, checks exit code
- [ ] `prompt-verify` returns "pause" with the verification prompt in the reason
- [ ] `human-review` returns "pause"
- [ ] Undefined/missing policy returns "continue"
- [ ] All unit tests pass
- [ ] `npx tsc --noEmit --project tsconfig.extensions.json` clean

## Verification

- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/custom-verification.test.ts` — all pass
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — T01 must have run first. Provides `VerifyPolicy` type export used by this module. The four policy variants: `content-heuristic` (minSize?, pattern?), `shell-command` (command), `prompt-verify` (prompt), `human-review` (no extra fields).
- Test patterns from existing tests: use `node:test`, `node:assert/strict`, `mkdtempSync` for temp dirs, `rmSync` for cleanup in `finally` blocks.

## Observability Impact

- **New signals:** `runVerification()` returns structured `VerificationResult` with `result` ("continue" | "retry" | "pause") and optional `reason` string — inspectable at the policy dispatch boundary by callers.
- **Inspection:** Read `reason` field on any non-"continue" result to see why verification failed. Content-heuristic includes the specific path and threshold details. Shell-command includes exit code or error message. Prompt-verify includes the full prompt text.
- **Failure visibility:** Content-heuristic "retry" reasons specify which artifact failed and why (missing, too small, pattern not found). Shell-command "retry" reasons include the exit code or error message from `spawnSync`. Path traversal attempts surface as "Command rejected: contains '..'".
- **No new runtime logs or endpoints** — this is a pure function module with no side effects beyond `spawnSync`.

## Expected Output

- `src/resources/extensions/gsd/custom-verification.ts` — new module (~80-100 lines) with `VerificationResult` type, `runVerification()` dispatcher, and four handler functions
- `src/resources/extensions/gsd/tests/custom-verification.test.ts` — new test file (~150-180 lines, 11 tests)
