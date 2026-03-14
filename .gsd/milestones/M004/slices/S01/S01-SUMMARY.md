---
id: S01
parent: M004
milestone: M004
provides:
  - Verified model registry populated from models.dev snapshot at module load time
  - Non-null assertion for default model in agent.ts
  - Clean build/test verification suite passing
requires: []
affects: []
key_files:
  - packages/pi-ai/src/models.ts
  - packages/pi-agent-core/src/agent.ts
key_decisions:
  - D026: Registry initialization from snapshot at module load time
  - D027: Non-null assertion for default model in agent.ts
patterns_established:
  - Synchronous module-level initialization from snapshot
  - Preserve models.dev architecture (no reversion to models.generated.ts)
observability_surfaces:
  - Registry can be inspected via `getModel()` with known model ID from snapshot
  - Empty registry indicates snapshot corruption or mapping failure
drill_down_paths:
  - .gsd/milestones/M004/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T03-SUMMARY.md
duration: 8m
verification_result: passed
completed_at: 2026-03-14
---

# S01: CI Failure Fix and Verification

**Local build and test suite pass; model registry populated from snapshot; TypeScript error resolved; local `main` verified and ready for later PR update.**

## What Happened

The slice plan called for resolving a TypeScript build error in `@gsd/pi-agent-core` by populating the `pi-ai` model registry from the models.dev snapshot. On inspection, the implementation was already complete:

- **T01:** `packages/pi-ai/src/models.ts` already imports the snapshot and mapper, populating the registry at module load time
- **T02:** `packages/pi-agent-core/src/agent.ts` already contains the non-null assertion on line 105
- **T03:** Full verification suite passed (build, unit tests, scenario tests, clean git status)

No code changes were required. The slice verified that the existing implementation satisfies all requirements and the reconciliation is complete.

## Verification

All slice-level verification checks passed:

- `npm run build -w @gsd/pi-ai` — TypeScript build succeeds
- `npm run build -w @gsd/pi-agent-core` — TypeScript build succeeds
- `npm test -w @gsd/pi-ai` — 32 tests pass (including live models.dev verification)
- `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — 9 scenario tests pass
- `git status --short` — clean working tree

## Requirements Advanced

- R013 — Verified that newer upstream changes are reconciled without regressing validated milestone behavior
- R014 — Verified local CI compliance (build + tests pass)
- R015 — Verified local `main` is ready for later PR update

## Requirements Validated

- R013 — Full verification suite passes, confirming upstream reconciliation is complete
- R014 — Build and test commands succeed locally, matching GitHub workflow expectations
- R015 — Clean git status confirms local `main` is PR-ready

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

None — the implementation was already complete. The slice was primarily verification-focused.

## Known Limitations

- Snapshot was generated on 2026-03-14; per D002, the 12h cache policy means live fetching will refresh when cache expires
- Updating `models.dev-registration-pr` is explicitly deferred to a later user action (R015)

## Follow-ups

- User should explicitly update `models.dev-registration-pr` when ready to push reconciled changes upstream

## Files Created/Modified

- `.gsd/DECISIONS.md` — appended decisions D026 and D027
- `.gsd/STATE.md` — updated to reflect M004 complete
- No source code changes required — implementation was already complete

## Forward Intelligence

### What the next slice should know

- This milestone was verification-only; no code changes were required
- The model registry is now confirmed working with synchronous snapshot initialization

### What's fragile

- None identified — architecture is stable

### Authoritative diagnostics

- `.gsd/DECISIONS.md` entries D026-D027 document the reconciliation approach
- Run `npm test -w @gsd/pi-ai` to verify registry functionality

### What assumptions changed

- Assumed fix would require code changes — implementation was already complete
