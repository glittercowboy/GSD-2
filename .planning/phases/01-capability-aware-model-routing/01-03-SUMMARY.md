---
phase: 01-capability-aware-model-routing
plan: "03"
subsystem: model-routing
tags: [model-router, capability-scoring, auto-model-selection, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: scoreEligibleModels, computeTaskRequirements, getEligibleModels, taskMetadata on ClassificationResult
  - phase: 01-02
    provides: regression tests for pure scoring functions (guards for this plan)
provides:
  - STEP 2 capability scoring inside resolveModelForComplexity (active when capability_routing enabled, multiple eligible models, unitType provided)
  - buildFallbackChain helper (deduplicates fallback assembly logic)
  - taskMetadata passthrough from selectAndApplyModel to resolveModelForComplexity
  - Full 2D routing pipeline wired end-to-end: classifier -> auto-model-selection -> router -> scorer
affects:
  - 01-04 (integration/E2E tests that exercise the complete pipeline)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STEP 2 guard pattern: capability_routing !== false && eligible.length > 1 && unitType"
    - "Optional param backward compat: unitType? and taskMetadata? maintain 4-arg caller compat"
    - "Helper extraction: buildFallbackChain consolidates duplicate fallback assembly logic"

key-files:
  created: []
  modified:
    - src/resources/extensions/gsd/model-router.ts
    - src/resources/extensions/gsd/auto-model-selection.ts

key-decisions:
  - "getEligibleModels replaces findModelForTier in the downgrade path: STEP 1 now returns a multi-model eligible set instead of a single model, enabling STEP 2 scoring"
  - "STEP 2 guard requires unitType to be non-empty: ensures scoring only fires with meaningful task context"
  - "buildFallbackChain helper extracted: consolidates [selected, ...configured_fallbacks, configured_primary] dedup logic used in both scoring and tier-only paths"
  - "Existing guards (disabled, unknown model, no downgrade needed) still return selectionMethod tier-only unchanged"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 01 Plan 03: STEP 2 Capability Scoring Pipeline Integration Summary

**STEP 2 capability scoring inserted into resolveModelForComplexity and taskMetadata wired end-to-end from classifier through selectAndApplyModel to the router**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-26T22:18:19Z
- **Completed:** 2026-03-26T22:20:xx Z
- **Tasks:** 2
- **Files modified:** 2 (model-router.ts, auto-model-selection.ts)

## Accomplishments

- Added `unitType?: string` and `taskMetadata?: TaskMetadata` optional params to `resolveModelForComplexity()` (backward-compatible: existing 4-arg callers and all tests pass unchanged)
- Replaced single-model `findModelForTier()` call in the downgrade path with `getEligibleModels()` to produce a multi-model eligible set for STEP 2
- Inserted STEP 2 capability scoring block: fires when `capability_routing !== false`, `eligible.length > 1`, and `unitType` is provided; calls `computeTaskRequirements()` + `scoreEligibleModels()`, returns winner with `selectionMethod: "capability-scored"`, `capabilityScores`, and `taskRequirements` populated
- Extracted `buildFallbackChain()` helper to deduplicate fallback chain assembly used in both scoring and tier-only paths
- Updated `selectAndApplyModel()` in auto-model-selection.ts to pass `unitType` and `classification.taskMetadata` as 5th and 6th arguments to `resolveModelForComplexity()`
- All 110 tests across model-router.test.ts, complexity-classifier.test.ts, and capability-router.test.ts pass with no failures

## Task Commits

Each task was committed atomically:

1. **Task 1:** `45160fbb` feat(01-03): insert STEP 2 capability scoring into resolveModelForComplexity
2. **Task 2:** `d4e291a8` feat(01-03): wire taskMetadata from selectAndApplyModel to resolveModelForComplexity

## Files Created/Modified

- `src/resources/extensions/gsd/model-router.ts` - Added `unitType?` and `taskMetadata?` params to `resolveModelForComplexity`; replaced `findModelForTier` with `getEligibleModels` in downgrade path; added STEP 2 scoring block with `capability_routing` guard; extracted `buildFallbackChain` helper; scoring return path includes `capabilityScores`, `taskRequirements`, `selectionMethod: "capability-scored"`
- `src/resources/extensions/gsd/auto-model-selection.ts` - Updated `resolveModelForComplexity` call to pass `unitType` and `classification.taskMetadata`

## Decisions Made

- **getEligibleModels replaces findModelForTier:** The old downgrade path used `findModelForTier()` which returned a single cheapest model. Replacing it with `getEligibleModels()` returns all models eligible for the tier, enabling capability scoring to select the best match rather than always defaulting to cheapest.
- **STEP 2 guard requires non-empty unitType:** The `unitType &&` check ensures scoring only fires when there's meaningful task context. If `unitType` is undefined (hypothetical callers using the 4-arg form), it falls through to tier-only cheapest behavior.
- **buildFallbackChain helper:** The fallback assembly logic `[...phaseConfig.fallbacks.filter(f => f !== selectedModel), phaseConfig.primary].filter(f => f !== selectedModel)` was duplicated across two paths. Extracted to a named helper for clarity and maintenance.
- **Zero-eligible fall-through preserved:** When `eligible.length === 0`, the function returns the configured primary with `wasDowngraded: false` — same behavior as the old `!targetModelId` path.

## Deviations from Plan

None — plan executed exactly as written. All code insertions match the plan's action items verbatim.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The full 2D routing pipeline is now wired: classify → extract metadata → score eligible models → select winner
- Plan 04 can add integration/E2E tests exercising the complete pipeline with `capability_routing: true` scenarios
- The `capability-scored` selectionMethod in RoutingDecision is populated and verifiable in tests

## Known Stubs

None — all data paths are wired. The capability scoring activates with real model profiles and real task metadata from the classifier.

## Self-Check: PASSED

- FOUND: src/resources/extensions/gsd/model-router.ts
- FOUND: src/resources/extensions/gsd/auto-model-selection.ts
- FOUND commit 45160fbb
- FOUND commit d4e291a8

---
*Phase: 01-capability-aware-model-routing*
*Completed: 2026-03-26*
