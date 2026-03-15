# S02: First-run setup wizard — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed
- Why this mode is sufficient: S02 combines browser UX, same-origin diagnostic surfaces, and a packaged `gsd --web` runtime path. The browser shell must be exercised directly, and the failure-state diagnostics are also best confirmed through the matching API responses and automated failure harness.

## Preconditions

- Work from the repo root.
- `npm run build:web-host` passes.
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts` passes.
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts` passes.
- Launch `gsd --web` with a fresh temp HOME/profile so required credentials are not already satisfied from `auth.json`.
- For deterministic runtime/browser validation without real secrets, set `GSD_WEB_TEST_FAKE_API_KEY_VALIDATION=1` when launching the fresh-profile runtime.
- Ensure no stale packaged web hosts are still listening on the chosen loopback port.

## Smoke Test

1. Launch `gsd --web` from the repo root with a fresh temp HOME/profile and `GSD_WEB_TEST_FAKE_API_KEY_VALIDATION=1`.
2. Wait for the browser workspace to open.
3. **Expected:** the preserved shell opens behind a blocking onboarding overlay, `/api/boot` reports `onboarding.locked: true`, and terminal input is disabled.

## Test Cases

### 1. Fresh launch opens into a locked preserved shell

1. Launch packaged `gsd --web` in a fresh profile.
2. Let the browser load the workspace.
3. Inspect the shell and status bar.
4. **Expected:**
   - the onboarding overlay is visible
   - the existing shell chrome remains visible behind it
   - `[data-testid="workspace-connection-status"]` includes required-setup copy rather than a generic bridge failure
   - `[data-testid="terminal-command-input"]` is disabled
   - `GET /api/boot` shows `onboarding.status: "blocked"`, `locked: true`, and `lockReason: "required_setup"`

### 2. Failed validation stays locked and redacts feedback

1. In the onboarding gate, choose the OpenAI provider.
2. Enter `invalid-demo-key` into the API-key field.
3. Submit the key.
4. Inspect the visible validation message and the same-origin APIs.
5. **Expected:**
   - the onboarding overlay stays visible
   - `[data-testid="onboarding-validation-message"]` contains rejection/failure language
   - the message does not echo the submitted key value
   - `GET /api/boot` and `GET /api/onboarding` still report `locked: true`
   - direct `POST /api/session/command` prompt attempts return HTTP 423 with `code: "onboarding_locked"` and `details.reason: "required_setup"`
   - terminal input remains disabled

### 3. Successful retry refreshes bridge auth and unlocks the shell

1. Replace the failed key with `valid-demo-key`.
2. Submit the key.
3. Watch the gate and status surfaces while setup completes.
4. **Expected:**
   - the UI surfaces a bridge-auth refresh phase while post-validation work is happening
   - the onboarding overlay remains until the boot resync finishes
   - the overlay disappears only after the workspace is actually usable
   - terminal input becomes enabled
   - `GET /api/boot` shows `locked: false`, `lockReason: null`, and `bridgeAuthRefresh.phase: "succeeded"`

### 4. First live command works from the unlocked browser shell

1. After the shell unlocks, enter `/new` into `[data-testid="terminal-command-input"]`.
2. Press Enter.
3. Wait for terminal output to update.
4. **Expected:**
   - a terminal line reports that a new session started
   - the session/banner area no longer shows `Waiting for live session`
   - no TUI or terminal fallback is needed to complete the first command

### 5. Refresh-failure diagnostics stay visible and keep the shell locked

1. Run the automated/runtime harness case that forces bridge restart failure after successful validation (`refresh failures keep the workspace locked and expose the failed bridge-refresh reason`).
2. Complete a successful credential validation step in that harness.
3. **Expected:**
   - onboarding remains locked even though validation itself succeeded
   - the visible shell/status surfaces present bridge-refresh failure copy
   - `GET /api/boot` shows `lockReason: "bridge_refresh_failed"`
   - blocked mutating commands still return HTTP 423 instead of leaking through to the bridge

## Edge Cases

### Env-backed auth skips the gate

1. Launch `gsd --web` with a fresh HOME/profile but with a required provider already satisfied by environment.
2. **Expected:** the onboarding overlay does not block the shell, `/api/boot` reports `required.satisfied: true` with `satisfiedBy.source: "environment"`, and the workspace is usable immediately.

### Read-only inspection stays available while locked

1. While the onboarding overlay is visible, trigger a read-only boot/state refresh path.
2. **Expected:** read-only status inspection succeeds while mutating prompt/session commands remain blocked.

### Optional setup remains skippable

1. Expand the optional integrations section and leave all optional providers unconfigured.
2. **Expected:** the UI explicitly marks the optional sections as skippable, and optional setup never keeps the shell locked once one required provider validates successfully.

## Failure Signals

- The browser opens straight into the normal workspace on a fresh profile with no onboarding overlay.
- Validation failure echoes the submitted key value anywhere in UI or API responses.
- Mutating `POST /api/session/command` calls succeed while onboarding is still locked.
- The onboarding overlay disappears before the terminal is actually enabled and ready.
- `bridgeAuthRefresh.phase` never transitions out of `pending` after a successful validation.
- `npm run build:web-host` reintroduces `Cannot find module as expression is too dynamic` errors during page-data collection.
- The packaged fresh-profile browser/runtime proof times out before the shell unlocks and accepts the first command.

## Requirements Proved By This UAT

- R002 — proves that browser onboarding gates the shell, validates required credentials, keeps invalid retries locked, skips optional setup safely, refreshes bridge auth, and unlocks the workspace entirely in-browser.
- R010 (slice-level advance) — proves that setup failures, blocked-command reasons, and bridge-refresh failures are visible on same-origin/browser surfaces rather than failing silently.
- R004 (slice-level advance) — proves the browser can get through first-run setup and reach the first live command without TUI fallback.

## Not Proven By This UAT

- Focused prompt/interrupt handling for live agent questions beyond onboarding-specific setup requests — that belongs to S03.
- Full real-data wiring for dashboard, roadmap, files, and activity surfaces — that belongs to S04.
- Start/resume workflow controls, refresh continuity, and broader recovery/performance polish — those belong to S05/S06.

## Notes for Tester

- The preserved shell remaining visible behind the onboarding overlay is intentional; S02 is not a route swap.
- For deterministic browser/runtime testing, `GSD_WEB_TEST_FAKE_API_KEY_VALIDATION=1` treats keys containing `invalid`, `reject`, or `fail` as failures and other non-empty values as success.
- The meaningful acceptance proof is the combination of the packaged browser/runtime test plus the visible shell behavior, not just the route contract in isolation.
