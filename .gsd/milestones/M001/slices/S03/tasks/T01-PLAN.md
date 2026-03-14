---
estimated_steps: 5
estimated_files: 4
---

# T01: Create snapshot generation and initial snapshot

**Slice:** S03 — Build-time snapshot + cleanup
**Milestone:** M001

## Description

Create the snapshot generation infrastructure: a script that fetches live data from models.dev and writes it as a TypeScript module, plus the initial snapshot file. This provides the bundled fallback for offline-first cold starts.

## Steps

1. Create `scripts/generate-snapshot.mjs`:
   - Import fetchModelsDev from built pi-ai package
   - Fetch live data with 30s timeout (longer than runtime fetch)
   - Validate data with ModelsDevData.parse()
   - Write TypeScript file with `export const SNAPSHOT: ModelsDevData = {...}`
   - Log success with file size, or error with details
   - Exit with error code on failure

2. Create initial `packages/pi-ai/src/models-dev-snapshot.ts`:
   - Run generation script to fetch and write snapshot
   - File should be ~300-400KB (similar to current models.generated.ts)
   - Include header comment with generation timestamp and source URL

3. Export SNAPSHOT from `packages/pi-ai/src/index.ts`:
   - Add `export * from "./models-dev-snapshot.js";`

4. Add npm script to root `package.json`:
   - `"generate-snapshot": "node scripts/generate-snapshot.mjs"`
   - Add to scripts section

5. Run and verify:
   - Execute `npm run generate-snapshot`
   - Verify snapshot file is valid TypeScript (no syntax errors)
   - Verify SNAPSHOT export works (can import in Node)

## Must-Haves

- [ ] Generation script fetches from models.dev with validation
- [ ] Snapshot file is valid TypeScript with SNAPSHOT export
- [ ] SNAPSHOT type is ModelsDevData (matches Zod schema)
- [ ] Exported from pi-ai index.ts
- [ ] npm script works: `npm run generate-snapshot`

## Verification

- `npm run generate-snapshot` completes without error
- Snapshot file exists at `packages/pi-ai/src/models-dev-snapshot.ts`
- File size is reasonable (~300-400KB)
- File contains `export const SNAPSHOT: ModelsDevData`
- Can import SNAPSHOT in Node/Bun without error

## Inputs

- `packages/pi-ai/src/models-dev.ts` — Provides fetchModelsDev() for fetching live data
- `packages/pi-ai/src/models-dev-types.ts` — Provides ModelsDevData type for TypeScript annotation
- `https://models.dev/api.json` — Live API endpoint

## Expected Output

- `scripts/generate-snapshot.mjs` — Generation script
- `packages/pi-ai/src/models-dev-snapshot.ts` — Snapshot file with SNAPSHOT export
- `packages/pi-ai/src/index.ts` — Updated with snapshot export
- `package.json` — Updated with generate-snapshot script

## Observability Impact

- Adds `generate-snapshot` npm script for manual snapshot regeneration
- Snapshot file header includes generation timestamp for traceability
- Script provides structured error output (fetch timeout, validation failure, write error)
- No runtime behavior changes - this is build-time infrastructure only
