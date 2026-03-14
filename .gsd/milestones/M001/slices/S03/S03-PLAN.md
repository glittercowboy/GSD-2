# S03: Build-time snapshot + cleanup

**Goal:** Fresh install works offline via bundled snapshot, static models.generated.ts removed.

**Demo:**
1. With no cache and no network, `pi --list-models` shows models from snapshot
2. `models.generated.ts` file deleted and all references removed
3. `npm run generate-snapshot` regenerates snapshot from live models.dev data

## Must-Haves

- [ ] Snapshot file `models-dev-snapshot.ts` committed to repo with pre-fetched models.dev data
- [ ] ModelRegistry uses snapshot as intermediate fallback (cache → snapshot → static MODELS)
- [ ] `models.generated.ts` deleted with no remaining references
- [ ] Generation script in `scripts/generate-snapshot.mjs` for manual updates

## Proof Level

- This slice proves: operational + integration
- Real runtime required: yes (snapshot must load in real CLI)
- Human/UAT required: yes (verify offline behavior works)

## Verification

- `npm run generate-snapshot` runs successfully and validates data against Zod schema
- `grep -r "models.generated" packages/ --include="*.ts" --include="*.js" --include="*.mjs"` returns no matches in source
- `ls packages/pi-ai/src/models.generated.ts` fails (file deleted)
- Snapshot file exports SNAPSHOT constant of type ModelsDevData
- SNAPSHOT exported from `packages/pi-ai/src/index.ts`
- Unit tests in pi-ai pass after snapshot integration
- ModelRegistry returns models with no cache/network (snapshot fallback verified)

## Observability / Diagnostics

- Generation script logs: success with file size, or error with details to stderr
- Script exits with non-zero code on failure (fetch error, validation error, write error)
- Snapshot file includes generation timestamp in header comment for traceability
- Zod validation errors show full error message for debugging invalid API responses
- **Failure state inspection:** If snapshot integration fails, check:
  - `registry.getAll().length` - should be > 0 after ModelRegistry construction
  - TypeScript compilation - no import errors from @gsd/pi-ai
  - Build output - no models.generated.ts references in source (dist/ is auto-generated)
  - Runtime fallback - with no network/cache, models still load from snapshot

## Observability / Diagnostics

- Generation script logs: success with file size, or error with details to stderr
- Script exits with non-zero code on failure (fetch error, validation error, write error)
- Snapshot file includes generation timestamp in header comment for traceability
- Zod validation errors show full error message for debugging invalid API responses

## Tasks

- [x] **T01: Create snapshot generation and initial snapshot** `est:1h`
  - Why: Provides bundled fallback for offline-first cold starts
  - Files: `scripts/generate-snapshot.mjs`, `packages/pi-ai/src/models-dev-snapshot.ts`, `packages/pi-ai/src/index.ts`, `package.json`
  - Do: Create generation script using S01's fetchModelsDev(), write initial snapshot, export from index.ts, add npm script
  - Verify: `npm run generate-snapshot` runs and produces valid TypeScript file with SNAPSHOT export
  - Done when: Snapshot file exists, validates against schema, exported from index.ts, npm script works

- [x] **T02: Integrate snapshot and remove old static file** `est:1h`
  - Why: Completes migration by using snapshot in fallback chain and removing old generated code
  - Files: `packages/pi-coding-agent/src/core/model-registry.ts`, `packages/pi-ai/src/models.ts`, `packages/pi-ai/src/models.generated.ts`
  - Do: Update ModelRegistry fallback chain, delete models.generated.ts, update models.ts import, verify no references
  - Verify: `grep -r "models.generated" packages/ --include="*.ts" --include="*.js" --include="*.mjs"` returns nothing in source, unit tests pass
  - Done when: Snapshot used in fallback, old file deleted, no references remain

## Files Likely Touched

- `scripts/generate-snapshot.mjs` — New generation script
- `packages/pi-ai/src/models-dev-snapshot.ts` — New snapshot file
- `packages/pi-ai/src/index.ts` — Export SNAPSHOT
- `package.json` — Add generate-snapshot script
- `packages/pi-coding-agent/src/core/model-registry.ts` — Integrate snapshot fallback
- `packages/pi-ai/src/models.ts` — Remove models.generated import
- `packages/pi-ai/src/models.generated.ts` — Delete
