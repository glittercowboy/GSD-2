# S02: gsd-2 RPC Connection + Event Stream — UAT

**Milestone:** M001-1ya5a3
**Written:** 2026-03-18

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: JSONL framing and dispatch logic are fully proven by 19 unit tests (artifact-driven). Full pipeline integration (spawn→IPC→renderer) requires the Electron app running with a real gsd binary (live-runtime), but the compilation proof (zero TypeScript errors across main, preload, renderer) validates all wiring at the type level.

## Preconditions

- `npm run build -w studio` exits 0 (all three targets compile)
- `npm run test -w studio` exits 0 (21/21 tests pass)
- For runtime tests: `gsd` binary is available on PATH (or `GSD_BIN_PATH` is set)
- For runtime tests: Electron dev server can launch (`npx electron-vite dev` from studio/)

## Smoke Test

Run `npm run test -w studio` — 21 tests pass including 19 GsdService tests. Run `npm run build -w studio` — zero TypeScript errors. These two together prove the slice is structurally sound.

## Test Cases

### 1. JSONL Framing — Unit Tests

1. Run `npm run test -w studio`
2. **Expected:** All 8 JSONL framing tests pass:
   - Single complete line parsed
   - Multiple lines in one chunk all parsed
   - Partial line across chunks buffered and completed
   - CR+LF line endings handled (CR stripped)
   - Empty lines skipped
   - U+2028/U+2029 inside JSON strings NOT treated as separators
   - Invalid JSON line silently ignored
   - No trailing newline leaves data in buffer

### 2. Event Dispatch — Unit Tests

1. Run `npm run test -w studio`
2. **Expected:** All 4 dispatch tests pass:
   - Response with matching pending request resolves the promise
   - Response with no matching ID forwarded as event
   - Non-response line forwarded as event
   - Response without id field forwarded as event

### 3. Fire-and-Forget Classification — Unit Tests

1. Run `npm run test -w studio`
2. **Expected:** FIRE_AND_FORGET_METHODS contains exactly: `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`
3. **Expected:** The set matches the canonical definition in `headless-events.ts` from the agent package

### 4. Pending Request Timeout — Unit Tests

1. Run `npm run test -w studio`
2. **Expected:** A pending request that receives no response rejects after the configured timeout with an error mentioning the command type

### 5. Extension UI Auto-Response — Unit Tests

1. Run `npm run test -w studio`
2. **Expected:** All 4 auto-response tests pass:
   - `select` → returns first option from the options array
   - `confirm` → returns `{ confirmed: true }`
   - `input` → returns empty string
   - `editor` → returns prefill value (or empty if no prefill)

### 6. TypeScript Compilation — All Targets

1. Run `npm run build -w studio`
2. **Expected:** Exit code 0. Three targets built:
   - main (index.js ~12KB) — includes GsdService and IPC handlers
   - preload (index.mjs ~1KB) — real IPC bridge
   - renderer (index.js ~667KB) — includes session store, useGsd hook, CenterPanel

### 7. RPC Type Isolation

1. Run `grep -r '@gsd/' studio/src/main/rpc-types.ts`
2. **Expected:** No matches. rpc-types.ts has zero imports from any agent package.

### 8. No readline Usage

1. Run `grep -r 'readline' studio/src/main/gsd-service.ts`
2. **Expected:** Only appears in a comment (not as an import or function call)

### 9. Preload Security Model

1. Inspect `studio/src/main/index.ts` for BrowserWindow webPreferences
2. **Expected:** `contextIsolation: true` and `nodeIntegration: false` preserved

### 10. Runtime — Connection Lifecycle (requires Electron + gsd binary)

1. Run `npx electron-vite dev` from studio/
2. Wait for the Electron window to appear
3. Observe the connection badge in the CenterPanel header
4. **Expected:** Badge shows "Connecting…" (amber, pulsing) → "Connected" (green) within a few seconds
5. Main process console shows `[gsd-service] spawned gsd --mode rpc (pid: XXXX)`

### 11. Runtime — Prompt Round-Trip (requires Electron + gsd binary)

1. With the app connected (green badge), type "Hello" in the composer textarea
2. Click Send (or press Enter)
3. **Expected:** Raw JSON events appear in the scrollable event log with:
   - Type pills colored by category (amber for message_update, blue for tool_*, gray for others)
   - Timestamps in HH:MM:SS format
   - JSON content formatted with 2-space indent in JetBrains Mono
4. Events auto-scroll as they arrive

### 12. Runtime — Process Crash Recovery (requires Electron + gsd binary)

1. With the app connected, find the gsd subprocess PID from main process logs
2. Kill it externally: `kill <PID>`
3. **Expected:** Connection badge changes to "Disconnected" (gray)
4. Main process logs `[gsd-service] crash detected, restarting in Xms`
5. After backoff, badge returns to "Connected" (green)

### 13. Runtime — Composer Disabled When Disconnected

1. Before connection or after a crash (while badge shows "Disconnected")
2. **Expected:** Textarea shows "Waiting for connection…" placeholder and is disabled. Send button is disabled.

## Edge Cases

### Empty Event Log — Initial State

1. Launch the app and wait for connection
2. Before sending any prompt, observe the center panel
3. **Expected:** Sparkle icon + "Send a prompt to start a session" empty state

### Event Log Overflow — Cap at 500

1. Send prompts that generate more than 500 events
2. **Expected:** Event log shows the most recent 500 events. Oldest events are evicted. No memory growth beyond the cap.

### Auto-Scroll Override — Manual Scroll-Up

1. With events streaming, scroll up in the event log
2. **Expected:** New events still arrive but do NOT force scroll to bottom
3. Scroll back to bottom (within 80px of bottom)
4. **Expected:** Auto-scroll resumes on next event

### Large JSON Event — Truncation

1. An event with JSON payload exceeding 2KB
2. **Expected:** The JSON display truncates at 2KB with a "… (truncated)" indicator

### Shift+Enter in Composer

1. Press Shift+Enter in the textarea
2. **Expected:** Inserts a newline (does NOT submit)

## Failure Signals

- `npm run test -w studio` exits with non-zero — JSONL framing or dispatch logic broken
- `npm run build -w studio` has TypeScript errors — type wiring between main/preload/renderer broken
- Connection badge stuck on "Connecting…" — GsdService failed to spawn or JSONL handshake failed
- Connection badge shows "Error" — check `lastError` in the badge text and `[gsd-service]` logs
- Events don't appear after sending a prompt — check IPC channel wiring (gsd:event not registered, or preload handler not stripping IPC event arg)
- "Disconnected" that never recovers — crash recovery exhausted (3 attempts in 60s); check `[gsd-service]` logs for exit codes

## Not Proven By This UAT

- **Structured message rendering** — events display as raw JSON; S03 replaces with markdown
- **Tool card UI** — tool events render as generic JSON blocks; S04 adds bespoke cards
- **Interactive prompt UI** — extension_ui_request events are auto-responded; S05 adds real wizard components
- **File tree wiring** — file watching IPC exists but no file tree consumer yet; S06
- **Real agent session quality** — this UAT proves the pipe works, not that a full agent session is pleasant to use

## Notes for Tester

- The runtime tests (10-13) require a working `gsd` binary. If not available, the artifact-driven tests (1-9) provide full coverage of the framing and dispatch logic.
- The `GSD_BIN_PATH` env var can point to a custom gsd binary location if it's not on PATH.
- The auto-response warnings in the main process console (`[gsd-service] auto-responding to extension_ui_request`) are expected and intentional — they'll go away when S05 builds real prompt UI.
- The raw event stream UI is intentionally unpolished (JSON blocks) — it's proof-of-pipe, not the final rendering.
