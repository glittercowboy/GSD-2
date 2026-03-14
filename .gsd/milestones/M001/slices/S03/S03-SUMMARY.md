---
id: S03
parent: M001
milestone: M001
provides:
  - Build-time snapshot generation script (scripts/generate-snapshot.mjs)
  - Bundled snapshot file with 102 providers (packages/pi-ai/src/models-dev-snapshot.ts)
  - Three-tier fallback chain: cache → snapshot → static
  - Legacy models.generated.ts removed
requires:
  - slice: S01
    provides: fetchModelsDev(), Zod schemas, cache infrastructure
  - slice: S02
    provides: ModelRegistry integration with models.dev data
affects: []
key_files:
  - scripts/generate-snapshot.mjs
  - packages/pi-ai/src/models-dev-snapshot.ts
  - packages/pi-coding-agent/src/core/model-registry.ts
  - packages/pi-ai/src/models.ts
key_decisions:
  - Inline Zod schemas in generation script to avoid circular dependency with built package
  - 30s fetch timeout for snapshot generation (longer than runtime 10s for reliability)
  - Exit codes for failure modes: 1=fetch, 2=validation, 3=write
  - Snapshot checks for non-empty object before use (defensive against corruption)
patterns_established:
  - Build-time snapshot generation with Zod validation
  - Three-tier fallback chain: cache (fresh) → snapshot (bundled) → static (empty map)
observability_surfaces:
  - Generation script logs: fetch start, validation, write, success with file size
  - Exit codes distinguish failure types (1=fetch, 2=validation, 3=write)
  - Snapshot header includes ISO timestamp and source URL
  - ModelRegistry.getAll().length > 0 confirms successful load
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
duration: 1h45m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# S03: Build-time snapshot + cleanup

**Snapshot generation script created, bundled snapshot committed, legacy models.generated.ts deleted.**

## What Happened

Created a snapshot generation infrastructure that fetches from models.dev with 30s timeout, validates against Zod schemas, and outputs TypeScript. The generation script uses inline Zod schemas to avoid circular dependency issues with the built pi-ai package.

During T01, discovered the models.dev API response had changed — some models now omit `options` and `temperature` fields. Updated the Zod schemas to make these fields optional to match actual API responses. Also fixed pre-existing TypeScript module resolution issues (`.ts` → `.js` imports) for Node16 ESM compliance.

Generated initial snapshot (2311KB, 102 providers) and committed to repo. Added `npm run generate-snapshot` script for manual updates before releases.

In T02, integrated snapshot as intermediate fallback in ModelRegistry: cache → snapshot → static. Removed all dependencies on `models.generated.ts` from `models.ts`, simplified type signatures, and deleted the 342KB legacy file. Verified no source references remain (only dist/ build artifacts).

## Verification

- ✅ `npm run generate-snapshot` runs successfully, produces valid TypeScript with SNAPSHOT export
- ✅ `grep -r "models.generated" packages/ --include="*.ts" --include="*.js" --include="*.mjs"` returns nothing in source (only dist/ artifacts)
- ✅ `ls packages/pi-ai/src/models.generated.ts` fails (file deleted)
- ✅ Snapshot exports SNAPSHOT constant of type ModelsDevData
- ✅ SNAPSHOT exported from `packages/pi-ai/src/index.ts`
- ✅ Node import test: `import('./packages/pi-ai/dist/models-dev-snapshot.js')` returns 102 providers
- ✅ ModelRegistry uses snapshot in fallback chain (code inspection)

## Requirements Advanced

- R004 — Bundled snapshot: implemented via generation script and committed snapshot file
- R006 — Remove models.generated.ts: file deleted, no source references remain

## Requirements Validated

- R004 — Snapshot generation works, fallback chain verified by code inspection
- R006 — grep verification confirms no source references to models.generated

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- Snapshot file size (2311KB) larger than expected — models.dev API has grown to 102 providers
- Had to fix pre-existing TypeScript module resolution issues to enable rebuild

## Known Limitations

- pi-ai package has pre-existing build errors (cache null check, @gsd/native dependency) but snapshot file compiles successfully
- Generation is manual (run before releases) — could be automated in CI later

## Follow-ups

- None for this milestone — all requirements validated

## Files Created/Modified

- `scripts/generate-snapshot.mjs` — Generation script with fetch, validation, TypeScript output
- `packages/pi-ai/src/models-dev-snapshot.ts` — Initial snapshot (2311KB, 102 providers)
- `packages/pi-ai/src/index.ts` — Added SNAPSHOT export
- `package.json` — Added `"generate-snapshot": "node scripts/generate-snapshot.mjs"`
- `packages/pi-coding-agent/src/core/model-registry.ts` — Integrated snapshot fallback
- `packages/pi-ai/src/models.ts` — Removed models.generated import, simplified types
- `packages/pi-ai/src/models.generated.ts` — Deleted (342KB legacy file)
- `packages/pi-ai/src/models-dev-types.ts` — Made options/temperature optional
- `packages/pi-ai/src/models-dev.ts` — Fixed import extension
- `packages/pi-ai/src/models-dev-mapper.ts` — Fixed import extension

## Forward Intelligence

### What the next slice should know
- This was the final slice for M001 — milestone is complete
- Snapshot generation is manual; run `npm run generate-snapshot` before releases

### What's fragile
- models.dev API schema changes — the Zod schemas may need updates if API changes again

### Authoritative diagnostics
- `registry.getAll().length` — should be > 0 after ModelRegistry construction
- `npm run generate-snapshot` exit code — 0=success, 1=fetch error, 2=validation error, 3=write error

### What assumptions changed
- Expected ~300-400KB snapshot — actual is 2311KB due to 102 providers in models.dev
