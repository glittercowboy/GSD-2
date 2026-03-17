---
estimated_steps: 5
estimated_files: 2
---

# T03: Contract tests and build verification

**Slice:** S04 — Diagnostics panels — forensics, doctor, skill-health
**Milestone:** M003

## Description

Create a contract test file that validates the full diagnostics pipeline: type exports, service response shapes, dispatch→surface→panel wiring, and doctor fix action. Run all existing parity tests to confirm no regressions, and verify both builds pass clean.

## Steps

1. **Create `src/tests/web-diagnostics-contract.test.ts`.** Use `node:test` (the project's test framework — see existing `web-command-parity-contract.test.ts` for patterns). Structure:

   **Block 1 — Type exports:**
   - Import all types from `../../web/lib/diagnostics-types.ts`
   - Assert that each type is importable and that key fields exist on test fixtures (create minimal valid objects matching each interface)
   - Test: `ForensicReport`, `ForensicAnomaly`, `DoctorReport`, `DoctorIssue`, `DoctorFixResult`, `SkillHealthReport`, `SkillHealthEntry`, `SkillHealSuggestion`

   **Block 2 — Contract state:**
   - Import `createInitialCommandSurfaceState` from `../../web/lib/command-surface-contract.ts`
   - Assert initial state has `diagnostics` field with `forensics`, `doctor`, `skillHealth` sub-states
   - Assert each sub-state has `phase: "idle"`, `data: null`, `error: null`

   **Block 3 — Dispatch→surface pipeline:**
   - Import `dispatchBrowserSlashCommand` from `../../web/lib/browser-slash-command-dispatch.ts`
   - Test `/gsd forensics` → `kind: "surface"`, `surface: "gsd-forensics"`
   - Test `/gsd doctor` → `kind: "surface"`, `surface: "gsd-doctor"`
   - Test `/gsd skill-health` → `kind: "surface"`, `surface: "gsd-skill-health"`
   - Test `/gsd doctor fix` → `kind: "surface"`, `surface: "gsd-doctor"`, args preserved
   - (These dispatch tests may overlap with existing parity tests, but having them here proves the pipeline for this slice specifically)

   **Block 4 — Surface→section mapping:**
   - Import `commandSurfaceSectionForRequest` from `../../web/lib/command-surface-contract.ts`
   - Test that `gsd-forensics` surface maps to `gsd-forensics` section
   - Test that `gsd-doctor` surface maps to `gsd-doctor` section
   - Test that `gsd-skill-health` surface maps to `gsd-skill-health` section

   **Block 5 — Store method existence:**
   - Import `GSDWorkspaceStore` from `../../web/lib/gsd-workspace-store.tsx`
   - Assert that the store prototype has `loadForensicsDiagnostics`, `loadDoctorDiagnostics`, `applyDoctorFixes`, `loadSkillHealthDiagnostics` methods (typeof check)

2. **Run the new contract test:**
   ```
   npx tsx --test src/tests/web-diagnostics-contract.test.ts
   ```
   All tests should pass.

3. **Run the existing parity test to confirm no regressions:**
   ```
   npx tsx --test src/tests/web-command-parity-contract.test.ts
   ```
   All 118 tests should pass.

4. **Run both builds:**
   ```
   npm run build
   npm run build:web-host
   ```
   Both should exit 0.

5. **Update requirement validation notes.** After verifying all tests pass, note in the test file (via comments) which requirements each test block validates: R103 (forensics panel), R104 (doctor panel), R105 (skill-health panel).

## Must-Haves

- [ ] `src/tests/web-diagnostics-contract.test.ts` exists with all 5 test blocks
- [ ] New test passes: `npx tsx --test src/tests/web-diagnostics-contract.test.ts`
- [ ] Existing parity test passes: `npx tsx --test src/tests/web-command-parity-contract.test.ts` (118 tests)
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npx tsx --test src/tests/web-diagnostics-contract.test.ts` — exit 0, all tests pass
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — exit 0, 118 tests pass
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0

## Inputs

- `web/lib/diagnostics-types.ts` — T01 output: browser-safe type exports to validate
- `web/lib/command-surface-contract.ts` — T02 output: diagnostics state types and section mapping
- `web/lib/gsd-workspace-store.tsx` — T02 output: store with fetch methods
- `web/lib/browser-slash-command-dispatch.ts` — existing dispatch function (unchanged)
- `src/tests/web-command-parity-contract.test.ts` — reference pattern for test structure (node:test, describe/it blocks)
- `src/tests/web-recovery-diagnostics-contract.test.ts` — reference pattern for diagnostics contract tests

## Expected Output

- `src/tests/web-diagnostics-contract.test.ts` — new file (~150-200 lines) with 5 test blocks validating the full S04 pipeline
- All existing and new tests pass
- Both builds pass clean
