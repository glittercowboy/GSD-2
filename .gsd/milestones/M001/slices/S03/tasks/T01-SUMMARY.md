---
id: T01
parent: S03
milestone: M001
provides:
  - Snapshot generation script (scripts/generate-snapshot.mjs)
  - Initial snapshot file (packages/pi-ai/src/models-dev-snapshot.ts)
  - SNAPSHOT export from @gsd/pi-ai
  - npm run generate-snapshot script
key_files:
  - scripts/generate-snapshot.mjs
  - packages/pi-ai/src/models-dev-snapshot.ts
  - packages/pi-ai/src/index.ts
  - package.json
key_decisions:
  - Made options and temperature fields optional in ModelsDevModel schema to match actual API response
  - Inline Zod schemas in generation script to avoid circular dependency issues with built package
patterns_established:
  - Build-time snapshot generation with validation against Zod schema
  - 30s fetch timeout for snapshot generation (longer than runtime 10s)
  - Exit codes for different failure modes (1=fetch, 2=validation, 3=write)
observability_surfaces:
  - Console logs: fetch start, validation, write, success with file size
  - Error messages: fetch timeout, validation errors with path details, write errors
  - Exit codes distinguish failure types
duration: 1h
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Create snapshot generation and initial snapshot

**Snapshot generation infrastructure created and initial snapshot fetched from models.dev**

## What Happened

Created the snapshot generation infrastructure with a 30s timeout fetch from models.dev API, Zod validation, and TypeScript output. The generation script (`scripts/generate-snapshot.mjs`) was created with inline Zod schemas to avoid circular dependency issues with the built pi-ai package.

During execution, discovered that the models.dev API response has changed - some models now omit the `options` field and `temperature` field. Updated `packages/pi-ai/src/models-dev-types.ts` to make these fields optional (`.optional()`) to match the actual API response.

Fixed TypeScript module resolution by changing `.ts` imports to `.js` in models-dev.ts, models-dev-mapper.ts, and test files for proper Node16 ESM resolution.

The initial snapshot was generated successfully (2311KB), containing 102 providers from models.dev. The snapshot file includes a header comment with generation timestamp and source URL for traceability.

## Verification

- ✅ `npm run generate-snapshot` completes without error (tested twice)
- ✅ Snapshot file exists at `packages/pi-ai/src/models-dev-snapshot.ts` (2.3MB)
- ✅ File contains `export const SNAPSHOT: ModelsDevData`
- ✅ SNAPSHOT export works in Node: `import { SNAPSHOT } from './packages/pi-ai/dist/models-dev-snapshot.js'` returns 102 providers
- ✅ File is valid TypeScript (node --check passes)
- ✅ Export added to `packages/pi-ai/src/index.ts`: `export * from "./models-dev-snapshot.js";`
- ✅ npm script added to `package.json`: `"generate-snapshot": "node scripts/generate-snapshot.mjs"`

## Diagnostics

- Generation script logs: "Fetching...", "Validating...", "Writing...", "✅ Success! (size KB)"
- Exit code 1: fetch timeout or network error
- Exit code 2: Zod validation error (shows path and message for each error)
- Exit code 3: file write error
- Snapshot header includes ISO timestamp and source URL for regeneration tracking

## Deviations

- Snapshot file size is 2311KB (larger than expected 300-400KB) because models.dev API has grown to 102 providers
- Had to fix pre-existing TypeScript module resolution issues (`.ts` → `.js` imports) to enable rebuild
- Had to make `options` and `temperature` fields optional in schema to match actual API response

## Known Issues

- pi-ai package has pre-existing build errors (cache null check, @gsd/native dependency) that prevent full rebuild, but the snapshot file itself compiles successfully
- The dist folder has stale built files with `.ts` imports - manual compilation of models-dev-snapshot.ts works

## Files Created/Modified

- `scripts/generate-snapshot.mjs` — Generation script with fetch, validation, and TypeScript output
- `packages/pi-ai/src/models-dev-snapshot.ts` — Initial snapshot with 102 providers from models.dev
- `packages/pi-ai/src/index.ts` — Added `export * from "./models-dev-snapshot.js";`
- `package.json` — Added `"generate-snapshot": "node scripts/generate-snapshot.mjs"`
- `packages/pi-ai/src/models-dev-types.ts` — Made `options` and `temperature` optional
- `packages/pi-ai/src/models-dev.ts` — Fixed import extension `.ts` → `.js`
- `packages/pi-ai/src/models-dev-mapper.ts` — Fixed import extension `.ts` → `.js`
- `packages/pi-ai/src/models-dev.test.ts` — Fixed import extension `.ts` → `.js`
- `packages/pi-ai/src/models-dev-mapper.test.ts` — Fixed import extension `.ts` → `.js`
