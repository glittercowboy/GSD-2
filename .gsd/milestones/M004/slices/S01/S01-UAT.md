# S01: CI Failure Fix and Verification — UAT

**Milestone:** M004
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice is internal reconciliation work with no user-facing changes. Verification is entirely automated through build and test commands.

## Preconditions

- Repository checked out at `main` branch
- Node.js 22+ available
- Dependencies installed (`npm install`)

## Smoke Test

Run the full verification suite:
```bash
npm run build -w @gsd/pi-ai && \
npm run build -w @gsd/pi-agent-core && \
npm test -w @gsd/pi-ai && \
node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js
```
**Expected:** All commands succeed with 0 failures.

## Test Cases

### 1. TypeScript Build Succeeds

1. Run `npm run build -w @gsd/pi-ai`
2. Run `npm run build -w @gsd/pi-agent-core`
3. **Expected:** Both commands complete without TypeScript errors

### 2. Unit Tests Pass

1. Run `npm test -w @gsd/pi-ai`
2. **Expected:** 32 tests pass, 0 fail (including live models.dev verification)

### 3. Scenario Tests Pass

1. Run `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js`
2. **Expected:** 9 tests pass, 0 fail

### 4. Git Working Tree Clean

1. Run `git status --short`
2. **Expected:** No modified or staged files (untracked `.gsd/STATE.md` is expected)

### 5. Model Registry Populated

1. In a Node REPL or test file, import and call:
   ```javascript
   import { getModel, getProviders } from '@gsd/pi-ai';
   console.log(getProviders().length);  // Should be ~102
   console.log(getModel('evroc', 'nvidia/Llama-3.3-70B-Instruct-FP8'));
   ```
2. **Expected:** `getProviders()` returns array with ~102 provider IDs; `getModel()` returns valid Model object

## Edge Cases

### Empty Registry Detection

1. If snapshot file is corrupted or missing, `getModel()` returns `undefined`
2. **Expected:** This is the correct failure mode — no silent failures

## Failure Signals

- TypeScript compilation errors in `packages/pi-agent-core/src/agent.ts`
- Test failures in `npm test -w @gsd/pi-ai`
- Scenario test failures in model-registry-scenario.test.js
- `getModel()` returning `undefined` for known snapshot models

## Requirements Proved By This UAT

- R013 — Verified by clean merge and passing tests
- R014 — Verified by build + test commands succeeding
- R015 — Verified by clean git status

## Not Proven By This UAT

- Does not prove GitHub CI will pass (only local verification)
- Does not prove `models.dev-registration-pr` update will succeed (deferred to later action)

## Notes for Tester

- Live models.dev test requires network connectivity; if offline, test will timeout but should still pass with fallback
- The non-null assertion in agent.ts is type-level only — no runtime behavior change
