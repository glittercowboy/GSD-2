# S07: Remaining Command Surfaces — UAT

**Milestone:** M003
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All 10 surfaces are verified through build compilation, parity contract tests, placeholder absence check, and API route existence. Runtime behavior follows established patterns proven in S04–S06.

## Preconditions

- `npm run build` passes (TypeScript compilation)
- `npm run build:web-host` passes (Next.js production build)
- Dev server running via `npm run dev` (for API route testing)
- A GSD project directory with `.gsd/` containing at least some of: gsd-db.json, OVERRIDES.md, completed-units.json, preferences.md, metrics data

## Smoke Test

Run `/gsd history` in the browser terminal. A real panel should appear with metrics data (or a "no data" message if the project has no metrics history) — not a "coming soon" placeholder.

## Test Cases

### 1. History Panel loads metrics data

1. Open browser terminal
2. Type `/gsd history`
3. **Expected:** Panel renders with "History" header. Shows metrics ledger data with phase/slice/model breakdown tabs. If no metrics history exists, shows an empty state message. Loading spinner appears briefly during fetch.

### 2. Inspect Panel shows database introspection

1. Type `/gsd inspect`
2. **Expected:** Panel renders with "Inspect" header. Shows gsd-db.json schema version, record counts, and recent entries. If gsd-db.json doesn't exist, shows an error message.

### 3. Hooks Panel shows hook configuration

1. Type `/gsd hooks`
2. **Expected:** Panel renders with "Hooks" header. Shows hook status entries with name, type, enabled state, targets. If no hooks configured, shows empty state. activeCycles will be empty (expected — runtime state unavailable in child process).

### 4. Export Panel generates downloadable content

1. Type `/gsd export`
2. **Expected:** Panel renders with "Export" header. Shows format selector (markdown/JSON). Panel does NOT auto-load — waits for user to select format and click export button.
3. Select "markdown" format and click Export
4. **Expected:** Browser initiates a file download with the exported content. Success banner appears in the panel.

### 5. Undo Panel shows last completed unit

1. Type `/gsd undo`
2. **Expected:** Panel renders with "Undo" header. Shows information about the last completed unit from completed-units.json. If no completed units exist, shows appropriate message.
3. Click "Undo" button
4. **Expected:** Confirmation dialog appears before executing. After confirmation, POST request fires and result banner shows success or error.

### 6. Cleanup Panel lists branches and snapshots

1. Type `/gsd cleanup`
2. **Expected:** Panel renders with "Cleanup" header. Shows two sections: branches and snapshots from the git repository. Each item has a delete checkbox/button.
3. Select items and click delete
4. **Expected:** Confirmation dialog appears before executing. After confirmation, POST request fires and panel auto-reloads to show updated state.

### 7. Steer Panel shows OVERRIDES.md

1. Type `/gsd steer`
2. **Expected:** Panel renders with "Steer" header. Shows current OVERRIDES.md content (or empty state if file doesn't exist). Provides a text form to send new steering messages.

### 8. Quick Panel shows static usage

1. Type `/gsd quick`
2. **Expected:** Panel renders with "Quick" header. Shows usage instructions matching TUI bare usage text. No API call made (static content).

### 9. Queue Panel shows milestone registry

1. Type `/gsd queue`
2. **Expected:** Panel renders with "Queue" header. Shows milestone registry from existing workspace data. No new API call — reads from workspace store state already loaded at boot.

### 10. Status Panel shows workspace state

1. Type `/gsd status`
2. **Expected:** Panel renders with "Status" header. Shows active state summary from workspace data. No new API call — reads from workspace store.

### 11. No placeholder text remains anywhere

1. Open every GSD command surface by typing each `/gsd` subcommand that routes to a surface
2. **Expected:** None of the 20 surface-dispatched commands show "This surface will be implemented in a future update" text.

### 12. API routes return structured responses

1. `curl http://localhost:3000/api/history` — returns JSON with ledger/aggregate fields or `{error}` with 500
2. `curl http://localhost:3000/api/inspect` — returns JSON with version/counts/entries or `{error}` with 500
3. `curl http://localhost:3000/api/hooks` — returns JSON with hooks array or `{error}` with 500
4. `curl http://localhost:3000/api/export-data?format=markdown` — returns JSON with content field or `{error}` with 500
5. `curl http://localhost:3000/api/undo` — GET returns JSON with lastUnit info or `{error}` with 500
6. `curl http://localhost:3000/api/cleanup` — GET returns JSON with branches/snapshots or `{error}` with 500
7. `curl http://localhost:3000/api/steer` — returns JSON with overridesContent field
8. **Expected:** All return valid JSON with Cache-Control: no-store. Error responses use `{error: string}` shape with 500 status.

## Edge Cases

### No project data exists

1. Run commands against a project with minimal/empty `.gsd/` directory
2. **Expected:** Each panel shows appropriate empty state or "no data" message — not a crash or blank screen.

### API route errors

1. Temporarily break a service dependency (e.g., rename gsd-db.json)
2. Open `/gsd inspect`
3. **Expected:** Panel shows error state with descriptive message. Store phase transitions to "error" with error string.
4. Restore the file and reopen the panel
5. **Expected:** Panel loads normally.

### Rapid panel switching

1. Quickly switch between multiple GSD commands (e.g., `/gsd history` → `/gsd inspect` → `/gsd hooks`)
2. **Expected:** Each panel loads independently. No stale data from previous panels. Loading states transition correctly.

### Export format parameter

1. `curl http://localhost:3000/api/export-data` (no format param)
2. **Expected:** Returns data with default format (markdown) or appropriate error
3. `curl http://localhost:3000/api/export-data?format=json`
4. **Expected:** Returns JSON-formatted export content

## Failure Signals

- Any panel showing "This surface will be implemented in a future update" text
- API routes returning non-JSON or crashing with unstructured errors
- Store phase stuck on "loading" indefinitely (no timeout/error transition)
- Panel rendering blank content (no header, no loading indicator, no error)
- `npm run build` or `npm run build:web-host` failing
- Parity contract test count dropping below 114 passing

## Requirements Proved By This UAT

- R108 — All 10 remaining `/gsd` subcommands open browser-native surfaces with appropriate controls, feedback, and state visibility
- R101 — (supporting) All 20 surface-dispatched commands now render real content across S04–S07

## Not Proven By This UAT

- Full TUI parity comparison (deferred to S08 parity audit)
- Runtime end-to-end proof under real packaged host (deferred to S09)
- hooks activeCycles showing real runtime data (architectural limitation of child-process pattern)
- undo/cleanup mutation success against real git state (requires live runtime with completed units and gsd branches)

## Notes for Tester

- The 4 pre-existing `visualize` test failures are expected and not related to S07. They're caused by `/gsd visualize` correctly dispatching as `view-navigate` (per D053) while the test expects `surface`.
- hooks activeCycles being empty is by design — the child process can't access in-memory runtime state.
- export-service creates a file on disk as a side effect — this is normal TUI behavior translated to web.
- Quick, queue, and status panels intentionally make no API calls — they use static content or existing workspace store data.
