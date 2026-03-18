---
estimated_steps: 7
estimated_files: 6
---

# T01: Build GsdService, RPC types, IPC bridge, and preload wiring in the main process

**Slice:** S02 — gsd-2 RPC Connection + Event Stream
**Milestone:** M001-1ya5a3

## Description

Create the entire main-process backend for gsd-2 communication. This includes self-contained RPC type declarations, a `GsdService` class that spawns `gsd --mode rpc` and communicates via LF-only JSONL framing, IPC channel registration in the main process, real preload bridge wiring replacing the S01 stubs, and unit tests for the framing and dispatch logic.

The primary reference is `vscode-extension/src/gsd-client.ts` — a battle-tested self-contained JSONL client with spawn, LF-only buffer draining, pending request map, crash recovery, and connection state events. The Electron main process needs an equivalent class adapted for IPC forwarding instead of VS Code event emitters.

**Key constraints:**
- LF-only JSONL framing — do NOT use Node's `readline` module (it splits on U+2028/U+2029 which are valid inside JSON strings). Implement manual `buffer + indexOf('\n')` splitting.
- `contextIsolation: true` — all renderer communication goes through `contextBridge` + `ipcMain`/`ipcRenderer`. No `nodeIntegration`.
- Auto-respond to interactive `extension_ui_request` events (`select`, `confirm`, `input`, `editor`) so the agent never blocks. Fire-and-forget methods (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`) need no response. Log warnings on auto-response.
- Configurable binary path via `process.env.GSD_BIN_PATH`, defaulting to `gsd`.
- GsdService should be a singleton — not per-window. The macOS `activate` handler can create windows; the service is app-scoped.

**Relevant skill:** None needed — Electron IPC and child_process are standard Node.js/Electron APIs.

## Steps

1. **Create `studio/src/main/rpc-types.ts`** — Self-contained type declarations for the RPC protocol subset the studio needs. Include:
   - `RpcCommand` — union type for commands the studio will send (at minimum: `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `new_session`, `get_session_stats`)
   - `RpcResponse` — the response shape: `{ id?: string; type: 'response'; command: string; success: boolean; data?: unknown; error?: string }`
   - `RpcExtensionUIRequest` — the full union type for extension UI requests (all methods: `select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`)
   - `RpcExtensionUIResponse` — response types: value (string), values (string[]), confirmed (boolean), cancelled (true)
   - `RpcSessionState` — model info, streaming/compacting flags, session metadata
   - `AgentEvent` — generic event shape `{ type: string; [key: string]: unknown }`
   - `FIRE_AND_FORGET_METHODS` — `Set<string>` containing `'notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'`
   - Copy types from `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` but simplify — remove all imports from agent packages, use plain types.

2. **Create `studio/src/main/gsd-service.ts`** — The core subprocess manager. Follow the `GsdClient` pattern from `vscode-extension/src/gsd-client.ts` but adapt for Electron:
   - Constructor takes `{ binaryPath?: string; cwd: string; onEvent: (event: AgentEvent) => void; onConnectionChange: (connected: boolean) => void; onError: (message: string) => void }`
   - `start()` — spawns `gsd --mode rpc --no-session` using the binary path (env `GSD_BIN_PATH` or default `gsd`), sets up stdout JSONL reader and stderr handler
   - `stop()` — SIGTERM with 2s SIGKILL fallback, rejects all pending requests
   - `send(command)` — writes JSON + `\n` to stdin, returns Promise<RpcResponse> with 30s timeout via pending request map
   - `sendPrompt(message)` / `getState()` / `abort()` — convenience wrappers
   - LF-only buffer drain: manual `buffer += chunk; while (indexOf('\n') !== -1) { handleLine(); }` — NOT readline
   - `handleLine(line)` — parse JSON, route responses to pending requests by ID, emit all other events via `onEvent` callback
   - Extension UI auto-responder: when an `extension_ui_request` event arrives with an interactive method, auto-respond with defaults (`select` → first option, `confirm` → true, `input` → empty string, `editor` → prefill or empty string), log `[gsd-service] auto-responding to extension_ui_request (method=${method}, id=${id})` as a warning. Fire-and-forget methods just get forwarded as events without response.
   - Crash recovery: on non-zero exit (not SIGTERM), track timestamps in a 60s sliding window, retry with exponential backoff (1s, 2s, 3s) up to 3 times. Log restart attempts.
   - Track: `restartCount`, `lastError`, `lastExitCode`, `isConnected` getter
   - `dispose()` — kill process, clear pending requests, clean up

3. **Update `studio/src/main/index.ts`** — Wire GsdService into the Electron app lifecycle:
   - Import `ipcMain` from electron
   - Create a singleton `GsdService` instance after app is ready, passing `onEvent` that calls `mainWindow?.webContents.send('gsd:event', event)`, `onConnectionChange` that sends `gsd:connection-change` to renderer, `onError` that sends `gsd:stderr`
   - Register IPC handlers:
     - `ipcMain.handle('gsd:spawn', async () => { await gsdService.start() })` 
     - `ipcMain.handle('gsd:send-command', async (_event, command) => { return await gsdService.send(command) })`
     - `ipcMain.handle('gsd:status', async () => ({ connected: gsdService.isConnected }))`
   - Add `app.on('before-quit', () => gsdService.dispose())` for cleanup
   - Keep the existing window creation logic intact — GsdService is independent of window lifecycle

4. **Replace preload stubs in `studio/src/preload/index.ts`** — Wire the bridge to real IPC:
   - Import `ipcRenderer` from electron alongside `contextBridge`
   - Update `StudioBridge` type:
     - `onEvent: (callback: (event: unknown) => void) => () => void` — registers `ipcRenderer.on('gsd:event', handler)` and returns a cleanup function that calls `ipcRenderer.removeListener`
     - `onConnectionChange: (callback: (connected: boolean) => void) => () => void` — same pattern for `gsd:connection-change`
     - `onStderr: (callback: (message: string) => void) => () => void` — same for `gsd:stderr`
     - `sendCommand: (command: Record<string, unknown>) => Promise<unknown>` — calls `ipcRenderer.invoke('gsd:send-command', command)`
     - `spawn: () => Promise<void>` — calls `ipcRenderer.invoke('gsd:spawn')`
     - `getStatus: () => Promise<{ connected: boolean }>` — calls `ipcRenderer.invoke('gsd:status')`
   - The `onEvent`/`onConnectionChange`/`onStderr` callbacks receive `(_event, data)` from ipcRenderer — strip the IPC event arg and pass only data to the callback

5. **Update `studio/src/preload/index.d.ts`** — Update the `StudioBridge` type to match the new shape with `onConnectionChange`, `onStderr`, and the updated `sendCommand` signature returning `Promise<unknown>` with `Record<string, unknown>` input.

6. **Create `studio/test/gsd-service.test.mjs`** — Unit tests for the critical JSONL and dispatch logic:
   - **JSONL framing tests:** Test the buffer drain logic in isolation (extract the `drainBuffer`/`handleLine` pattern into a testable form, or test via the public API with a mock process). Cases:
     - Single complete line → parsed correctly
     - Multiple lines in one chunk → all parsed
     - Partial line across chunks → buffered and completed on next chunk
     - CR+LF line endings → CR stripped correctly
     - Empty lines → skipped
     - Unicode U+2028 and U+2029 inside JSON string values → NOT treated as line separators (this is the whole reason we avoid readline)
     - Invalid JSON line → silently ignored
   - **Event dispatch tests:** Mock the callbacks and verify:
     - A line with `type: 'response'` and matching pending request ID → resolves the pending promise
     - A line with `type: 'response'` but no matching ID → forwarded as event
     - A line without `type: 'response'` → forwarded as event
   - **Fire-and-forget classification test:** Verify `FIRE_AND_FORGET_METHODS` contains exactly the right methods
   - **Pending request timeout test:** Send a command, don't respond, verify rejection after timeout (use a short timeout override for testing)
   - NOTE: These tests should NOT actually spawn gsd-2. Mock stdin/stdout with streams or test the parsing logic as pure functions.

7. **Verify everything builds and tests pass:**
   - Run `npm run test -w studio` — all tests including new ones pass
   - Run `npm run build -w studio` — TypeScript compilation succeeds for main, preload, renderer
   - Check LSP diagnostics on new/modified files

## Must-Haves

- [ ] `rpc-types.ts` is fully self-contained — zero imports from `@gsd/pi-coding-agent` or any agent package
- [ ] JSONL framing uses LF-only splitting (`indexOf('\n')`) — does NOT use Node `readline`
- [ ] Pending requests tracked by ID with 30s timeout and proper cleanup on process exit
- [ ] Extension UI auto-responder handles `select`, `confirm`, `input`, `editor` with sensible defaults and logs warnings
- [ ] `FIRE_AND_FORGET_METHODS` correctly identifies `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`
- [ ] Crash recovery with exponential backoff, capped at 3 retries in 60s window
- [ ] Subprocess cleaned up on `before-quit` — no orphaned processes
- [ ] Preload bridge uses real `ipcRenderer.invoke`/`ipcRenderer.on` — no stubs remain
- [ ] `contextIsolation: true` maintained — no `nodeIntegration`
- [ ] Unit tests cover JSONL framing edge cases including U+2028/U+2029 passthrough
- [ ] `npm run build -w studio` passes with zero errors
- [ ] `npm run test -w studio` passes all tests

## Verification

- `npm run test -w studio` — all tests pass (existing token tests + new gsd-service tests)
- `npm run build -w studio` — zero TypeScript errors across main, preload, and renderer
- LSP diagnostics clean on `studio/src/main/gsd-service.ts`, `studio/src/main/rpc-types.ts`, `studio/src/preload/index.ts`

## Observability Impact

- Signals added: `[gsd-service]` prefixed console logs for spawn (with PID), exit (with code/signal), crash detection, restart attempts, auto-response warnings, and connection state changes
- How a future agent inspects this: `window.studio.getStatus()` from devtools returns live `{ connected: boolean }`, main process console shows all GsdService lifecycle events
- Failure state exposed: `lastError` and `lastExitCode` tracked on GsdService, pending request rejections include command type, crash count visible in logs

## Inputs

- `studio/src/main/index.ts` — existing Electron main process from S01 (window creation, app lifecycle)
- `studio/src/preload/index.ts` — existing `StudioBridge` type and contextBridge stub from S01
- `studio/src/preload/index.d.ts` — existing global Window typing from S01
- `vscode-extension/src/gsd-client.ts` — reference implementation for JSONL client pattern (DO NOT import, use as design reference)
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — canonical type definitions (copy/simplify, DO NOT import)
- `src/headless-events.ts` — `FIRE_AND_FORGET_METHODS` set (copy the set, DO NOT import)

## Expected Output

- `studio/src/main/rpc-types.ts` — self-contained RPC protocol types for the studio
- `studio/src/main/gsd-service.ts` — complete subprocess manager with JSONL, pending requests, crash recovery, auto-responder
- `studio/src/main/index.ts` — updated with GsdService instantiation, IPC handlers, and cleanup
- `studio/src/preload/index.ts` — real IPC bridge replacing all stubs
- `studio/src/preload/index.d.ts` — updated global typing matching new bridge shape
- `studio/test/gsd-service.test.mjs` — unit tests for JSONL framing, event dispatch, timeout, fire-and-forget classification
