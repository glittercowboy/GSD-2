# M001/S02: First-run setup wizard — Research

**Date:** 2026-03-14

## Summary

This slice directly owns **R002** (browser onboarding validates required credentials before use) and materially supports **R004** (primary workflow runs end-to-end in the browser). S01 already gives web mode the right launch seam: `/api/boot` exposes `onboardingNeeded`, the bridge starts, and the preserved shell hydrates against live boot state. The problem is that this seam is only informational. `gsd --web` returns through the web branch before CLI onboarding ever runs, the current terminal can still submit commands while onboarding is “needed,” and the existing onboarding logic in `src/onboarding.ts` is a terminal/clack wizard with weak required-credential validation for LLM API keys.

The right S02 shape is **not** “port the clack wizard to React.” The safer path is to split onboarding into shared server-side primitives, expose a same-origin onboarding API, and mount a full-screen gate inside the existing app shell. Two surprises constrain the design. First, web boot currently decides `onboardingNeeded` with a custom env/auth-file scan that is weaker than runtime auth truth (`AuthStorage.hasAuth()` + `getEnvApiKey()`), so it can drift from what the agent actually accepts. Second, a running RPC child does **not** auto-reload `auth.json`; it loads auth into memory at startup. That means saving credentials in the browser is not enough by itself — S02 also needs a bridge refresh/restart path or an explicit auth reload mechanism before the workspace can be safely ungated.

## Recommendation

Implement S02 around a **browser-first onboarding service** with explicit gating and shared auth truth.

1. **Extract shared onboarding/auth-state helpers** from the current split between `src/onboarding.ts` and `src/web/bridge-service.ts`.
   - One helper should answer: “does required model auth exist?” using the same truth the runtime uses (`AuthStorage.hasAuth()` and `getEnvApiKey()` behavior), not the current hard-coded `LLM_ENV_KEYS` list.
   - One helper should provide the browser-facing setup model: available OAuth providers, recommended providers, existing configured provider, optional setup sections, and last validation state.

2. **Keep launch readiness separate from workspace usability.**
   - Preserve the S01 launch contract: the browser should still open once `/api/boot` reports a ready bridge.
   - Expand boot with structured onboarding state, but do **not** redefine host readiness as “onboarding complete,” or S01’s proven startup path regresses.

3. **Add dedicated same-origin onboarding routes instead of tunneling onboarding through `/api/session/command`.**
   - The browser needs explicit onboarding mutations for API-key save+validate, OAuth flow start/progress/finish, optional search/tool/remote setup, and re-check/completion.
   - Reuse `AuthStorage` for writes and provider discovery. Do not create a second credential store.
   - Treat the current RPC `extension_ui_request` transport as future-compatible infrastructure for S03, not as the primary implementation strategy for S02.

4. **Mount a full-screen onboarding gate in `web/components/gsd/app-shell.tsx` and back it from the shared workspace store.**
   - `web/app/page.tsx` is already a client-only shell; `GSDAppShell` is the clean place to render a locked first-run state without redesigning the skin.
   - The store should track onboarding status, validation in progress, last validation result, and whether the workspace is locked.
   - Optional setup (web search, tool keys, remote questions) should remain skippable and non-blocking. Only required LLM credentials should gate the workspace.

5. **Enforce the gate server-side, not just in the UI.**
   - `/api/session/command` must reject model-backed or session-mutating actions while required onboarding is incomplete.
   - `get_state` and boot refresh can stay allowed.
   - This prevents “locked” UI states from being bypassed by direct command posts or accidental client regressions.

6. **Plan for auth propagation after successful setup.**
   - Because the running RPC child keeps auth in memory, successful onboarding must either restart/refresh the bridge subprocess or trigger an explicit auth reload path before prompts are allowed.
   - This is part of the slice, not cleanup. Without it, “validated in browser” can still fail on the next prompt.

Why this approach: it meets R002 without dragging S03 forward, reuses the real auth/runtime stack instead of duplicating it again in the web layer, preserves S01’s launch proof, and closes the main operational gap — required setup must be both visible **and** enforceable in-browser.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Credential persistence and locking | `AuthStorage` in `packages/pi-coding-agent/src/core/auth-storage.ts` | It already owns `auth.json`, file locking, OAuth token storage, API-key accumulation, logout, and refresh paths. |
| Runtime auth truth | `AuthStorage.hasAuth()` + `getEnvApiKey()` in `packages/pi-ai/src/env-api-keys.ts` | This is what the runtime actually uses to decide whether a provider is configured. A custom web-only env-key list will drift. |
| OAuth provider discovery and flow shape | `authStorage.getOAuthProviders()` + `authStorage.login()` | This already exposes registered providers and the callback contract (`onAuth`, `onPrompt`, `onProgress`, `onManualCodeInput`). |
| Shared browser workspace state | `web/lib/gsd-workspace-store.tsx` | The store already owns boot fetch, SSE subscription, and command dispatch. Add onboarding state here rather than scattering gate logic across views. |
| Future focused interruptions | `RpcExtensionUIRequest` / `RpcExtensionUIResponse` + bridge passthrough | S03 will need this transport anyway. Reuse it later instead of inventing a second prompt/answer protocol. |

## Existing Code and Patterns

- `src/cli.ts` — critical control-flow fact: `runWebCliBranch()` happens before `shouldRunOnboarding()`. Web mode currently bypasses the existing CLI wizard completely.
- `src/onboarding.ts` — useful for step order, copy, and optional setup policy, but not as-is for S02. It is TTY/clack-based, all steps are recoverable/skippable, and required LLM API-key validation is only prefix checking before `authStorage.set(...)`.
- `packages/pi-coding-agent/src/core/auth-storage.ts` — authoritative credential store. Reuse this for browser writes and provider discovery. Also note the operational constraint: it loads auth into memory and does not auto-watch external file changes.
- `packages/pi-ai/src/env-api-keys.ts` — authoritative env-auth resolution, including cases the current web gate misses (`GH_TOKEN`/`GITHUB_TOKEN` for GitHub Copilot, `ANTHROPIC_OAUTH_TOKEN`, ADC-style auth for Vertex, etc.).
- `src/web/bridge-service.ts` — current browser onboarding seam. `collectBootPayload()` returns `onboardingNeeded`, but `defaultOnboardingNeeded()` uses a weaker custom truth than the runtime and only emits a boolean.
- `web/lib/gsd-workspace-store.tsx` — onboarding currently affects only one terminal seed line. `sendCommand()` still posts through to `/api/session/command`, and `getStatusPresentation()` does not surface a locked workspace state.
- `web/components/gsd/app-shell.tsx` — best place to host a full-screen first-run overlay or locked workspace shell without redesigning the existing skin.
- `web/app/api/session/command/route.ts` — currently forwards any typed command to the bridge with no onboarding gate. This route needs server-side enforcement.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — existing focused-prompt protocol is already broad enough for later browser prompts, but S02 should not depend on finishing that whole UI host first.
- `src/tests/web-bridge-contract.test.ts` — currently treats onboarding as a boot seam, not an enforced gate. S02 will need stronger route/store/browser tests.

## Constraints

- `gsd --web` cannot rely on the existing CLI onboarding path. The web branch returns before `shouldRunOnboarding()` is evaluated.
- S01’s launch proof depends on the bridge reaching `ready`. S02 should not redefine launch success as “setup complete,” or browser startup becomes slower and more fragile.
- `defaultOnboardingNeeded()` in `src/web/bridge-service.ts` is **not** authoritative runtime truth. It hard-codes a small env-key list and raw `auth.json` scan, while the runtime accepts broader auth sources.
- `AuthStorage.login()` is callback-driven, not a simple request/response API. Browser OAuth needs a stateful server-side orchestrator that can surface `onAuth`, `onPrompt`, `onProgress`, and manual redirect handling.
- `web/app/page.tsx` loads the shell client-side with `ssr: false`. The first-run gate must tolerate a client-booted app rather than relying on SSR-only gating.
- Current command forwarding is unsafe for R002. Without route-level blocking, a user can still send prompts while onboarding is incomplete.
- Optional setup already has mixed validation depth. Slack and Discord do real remote validation; most tool/search keys are just stored. Required-vs-optional policy must stay explicit so S02 does not over-scope itself.
- A running RPC child does not automatically pick up auth changes written by the web host. S02 must refresh bridge auth visibility after successful setup.

## Common Pitfalls

- **Using `onboardingNeeded` as the whole design** — today it is just a boolean seam. S02 needs structured state, validation results, and enforcement.
- **Keeping a separate web-only auth truth** — `LLM_ENV_KEYS` in the bridge is already weaker than real runtime detection. Another custom truth layer will drift even further.
- **Making the gate UI-only** — the terminal and `/api/session/command` must be blocked server-side or the workspace is not actually gated.
- **Trying to reuse the clack wizard directly** — that would copy terminal-oriented control flow and preserve weak provider validation.
- **Blocking on optional integrations** — R002 only requires required credentials to be entered and tested before use. Search/tool/remote setup should stay skippable.
- **Assuming `auth.json` writes are immediately visible to the live bridge** — they are not. Without a bridge refresh/restart or auth reload path, successful onboarding can still lead to prompt-time auth failures.
- **Pulling S03 fully into S02** — the focused prompt transport exists, but S02 should solve onboarding first with direct routes and a gate surface instead of waiting for the generic interruption panel.

## Open Risks

- There is no obvious generic “validate this provider credential” service in the current codebase. Required LLM validation will likely need new provider-specific or model-backed probes.
- OAuth providers with callback-server/manual-redirect flows may need a long-lived onboarding service similar to the bridge singleton; route-local orchestration is likely too fragile.
- Refreshing bridge auth after onboarding could be done by bridge restart or by explicit auth reload. The codebase does not currently expose the latter.
- If the gate leaves the rest of the mock-heavy shell visible, users may think the workspace is usable before setup completes. The locked state needs to be visually unambiguous.
- Test coverage currently stops at the seam: boot payloads, command forwarding, and live shell hydration. S02 needs route-level, store-level, and browser-level proof that the workspace is truly blocked until validation passes.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Browser onboarding UI / React shell | `frontend-design` | installed |
| Next.js App Router host | `wshobson/agents@nextjs-app-router-patterns` | available — `npx skills add wshobson/agents@nextjs-app-router-patterns` |
| OAuth/browser auth flows | `jezweb/claude-skills@oauth-integrations` | available — `npx skills add jezweb/claude-skills@oauth-integrations` |

## Sources

- Web mode bypasses the existing CLI onboarding path because `runWebCliBranch()` returns before `shouldRunOnboarding()` runs. (source: [src/cli.ts](../../../../../src/cli.ts))
- The current onboarding wizard is terminal-first, all steps are recoverable/skippable, and required LLM API-key validation is currently just prefix checking before persistence. (source: [src/onboarding.ts](../../../../../src/onboarding.ts))
- `AuthStorage` is the real persistence/auth API and does not auto-watch external `auth.json` changes after construction; `reload()` is explicit. (source: [packages/pi-coding-agent/src/core/auth-storage.ts](../../../../../packages/pi-coding-agent/src/core/auth-storage.ts))
- Runtime env-auth truth is broader than the web bridge’s hard-coded env-key list. (source: [packages/pi-ai/src/env-api-keys.ts](../../../../../packages/pi-ai/src/env-api-keys.ts))
- The current web bridge exposes `onboardingNeeded` as a boolean seam, not a structured gate, and computes it with custom logic. (source: [src/web/bridge-service.ts](../../../../../src/web/bridge-service.ts))
- The shared web store seeds an onboarding message but still forwards commands normally; the current status model does not represent a locked workspace. (source: [web/lib/gsd-workspace-store.tsx](../../../../../web/lib/gsd-workspace-store.tsx))
- The app shell is the clean host for a full-screen gate without redesigning the skin. (source: [web/app/page.tsx](../../../../../web/app/page.tsx), [web/components/gsd/app-shell.tsx](../../../../../web/components/gsd/app-shell.tsx))
- The session command route currently forwards arbitrary bridge inputs with no onboarding enforcement. (source: [web/app/api/session/command/route.ts](../../../../../web/app/api/session/command/route.ts))
- The existing RPC protocol already supports browser-answerable UI requests, but that broader focused-panel work belongs primarily to S03. (source: [packages/pi-coding-agent/src/modes/rpc/rpc-types.ts](../../../../../packages/pi-coding-agent/src/modes/rpc/rpc-types.ts))
- Current tests treat onboarding as a boot seam, which means S02 needs stronger verification than S01 required. (source: [src/tests/web-bridge-contract.test.ts](../../../../../src/tests/web-bridge-contract.test.ts))
