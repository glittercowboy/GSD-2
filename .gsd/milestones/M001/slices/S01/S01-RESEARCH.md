# M001/S01: Web host + agent bridge — Research

**Date:** 2026-03-14

## Summary

This slice directly owns **R001** (browser-only `--web` launch) and **R003** (current-project-scoped workspace boot), and it materially supports **R002**, **R004**, and **R009**. The codebase already has three usable building blocks: project-scoped session storage in `src/cli.ts`, a real JSONL RPC/event contract in `packages/pi-coding-agent/src/modes/rpc/`, and file-based workspace indexing in `src/resources/extensions/gsd/`. What it does **not** have yet is the actual `--web` entrypoint, a shipped local web host, or any browser-facing transport for live agent/session state. Right now `gsd --web` would simply be ignored and fall through to the TUI.

The lowest-churn path for S01 is to keep the existing Next.js skin for M001, but treat it as a presentation shell with a thin same-origin bridge rather than as the source of truth. `src/cli.ts` should branch early into a new web mode that preserves `src/loader.ts` bootstrap behavior, starts the local web host, auto-opens the browser, and exposes a minimal bridge surface: a boot payload built from `indexWorkspace()`/`deriveState()`/auto dashboard data, POST endpoints for RPC commands, and an SSE stream for session events plus `extension_ui_request` payloads. That gives S01 the launch/bridge proof it needs without redesigning the UI or inventing a second agent protocol.

## Recommendation

Implement S01 around a **project-scoped web mode host** with these responsibilities:

1. **Intercept `--web` in `src/cli.ts` before interactive startup** so the TUI is never instantiated.
2. **Preserve `src/loader.ts` bootstrap invariants** for any child process or server startup (`PI_PACKAGE_DIR`, `NODE_PATH`, bundled extension paths, proxy setup, version env).
3. **Keep the existing Next.js App Router shell** and add a minimal same-origin API surface for:
   - `GET /api/boot` → cwd/project metadata, onboarding-needed flag, workspace index, active scope, validation issues, auto dashboard summary, resumable sessions
   - `POST /api/session/command` → translate browser actions to RPC commands (`prompt`, `steer`, `follow_up`, `abort`, `get_state`, etc.)
   - `GET /api/session/events` → stream RPC session events and `extension_ui_request` objects via SSE
4. **Hold the RPC child/session registry in a long-lived bridge service**, not in ad hoc per-request code.
5. **Treat onboarding as host-side state**, not part of the RPC child. S01 only needs the status/gating seam; S02 can fill in the browser wizard and stronger validation.

Why this approach: it satisfies D002/D005, reuses real GSD contracts instead of hand-rolled duplicates, avoids immediate framework churn, and maps cleanly to the slice boundary: launch path, loopback host, current-project boot payload, and live browser bridge.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Live agent control and focused prompts | `runRpcMode()` + `rpc-types.ts` JSONL contract | Already supports `prompt`, `steer`, `follow_up`, `abort`, session state, and `extension_ui_request` payloads needed for the focused panel. |
| Workspace boot payload | `indexWorkspace()`, `deriveState()`, and `getAutoDashboardData()` | Already understand real `.gsd` structure, active scope, validation issues, and auto-mode totals; avoids rebuilding GSD state parsing in the web layer. |
| Browser auto-open | `openBrowser()` pattern in `src/onboarding.ts` | Cross-platform best-effort browser launch already exists and should be reused for `gsd --web`. |

## Existing Code and Patterns

- `src/cli.ts` — startup switchboard. This is the correct interception point for `--web`. It already scopes sessions to `process.cwd()`, but today unknown flags fall through to interactive mode and open the TUI.
- `src/loader.ts` — required GSD bootstrap. It sets branding/config env, `NODE_PATH`, bundled extension paths, proxy behavior, and version/env metadata before importing the CLI. Any web-mode host or spawned RPC child must preserve this bootstrap.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — authoritative RPC contract. Use it as the browser bridge source of truth instead of inventing a new browser-only command/event model.
- `packages/pi-coding-agent/src/modes/rpc/rpc-client.ts` — reference implementation only. It is not sufficient as-is for web mode because it assumes a relative `dist/cli.js`, only types listeners as `AgentEvent`, and exposes no public helper for sending `extension_ui_response`.
- `src/resources/extensions/gsd/workspace-index.ts` — best current seam for `GET /api/boot`; already returns milestones, slices, tasks, active scope, and validation issues.
- `src/resources/extensions/gsd/auto.ts` — exposes live auto-dashboard totals that can back the existing dashboard/status surfaces without re-deriving metrics in the browser.
- `src/onboarding.ts` — useful for auth storage and browser-opening behavior, but not for web mode flow control. It is terminal/clack-based, TTY-gated, and API-key validation is mostly prefix-only.
- `web/app/page.tsx` — top-level shell is a pure client component with local view state only; this is the seam for introducing a shared live workspace store.
- `web/components/gsd/sidebar.tsx` and `web/components/gsd/terminal.tsx` — representative examples of the current mock-only UI. They hardcode milestone/session data and simulate terminal activity locally.
- `web/next.config.mjs` — `typescript.ignoreBuildErrors = true`; web-mode wiring cannot rely on Next build failures to catch type regressions.

## Constraints

- `--web` must be parsed explicitly. Today `parseCliArgs()` does not know about it, and unknown flags are effectively ignored.
- Browser onboarding cannot be delegated to the current RPC child. `shouldRunOnboarding()` is TTY-only, and any explicit `mode` currently skips onboarding entirely.
- Current-project scoping already exists and should stay the authority: `src/cli.ts` builds per-cwd session directories, and `SessionManager.create/continueRecent()` already support encoded-cwd storage.
- The browser bridge cannot assume existing transport endpoints; `web/` currently has no `app/api`, no `fetch`, no `EventSource`, no `WebSocket`, and no shared client store.
- Shipping is unresolved: root `package.json` does not include `web/` in published files and the root build does not build the Next app.
- Default `RpcClient` startup is unsafe for this use case because `cliPath` defaults to `dist/cli.js` relative to the child cwd rather than the installed GSD binary/bootstrap path.

## Common Pitfalls

- **Treating `--web` as “just another mode”** — `cliFlags.mode !== undefined` currently flips startup into print-like behavior. Web mode needs its own explicit branch, not a reuse of the existing `--mode` switch.
- **Trying to run the browser onboarding through RPC mode** — RPC startup intentionally bypasses onboarding. The web host needs separate auth status and validation endpoints that write to the same storage.
- **Owning bridge lifecycle inside request handlers** — HTTP route handlers are fine for surfacing the bridge, but the RPC child/session registry itself needs to live in a long-lived singleton/service.
- **Incrementally patching mock components one by one** — the current skin is a set of disconnected mock islands. S01 should introduce one shared boot/bridge contract first or the UI will drift view-by-view.
- **Assuming type/build tooling will catch integration mistakes** — `web/next.config.mjs` ignores TypeScript build errors, so explicit verification will matter more than usual.

## Open Risks

- The published CLI currently does not ship web assets. S01 needs at least a credible bundling/build plan, not only a repo-local development launch.
- A persistent bridge living inside the Next runtime may behave differently in dev and packaged/prod runs. If singleton lifetime proves flaky, a dedicated bridge server may be necessary while still keeping Next as the UI shell.
- S02 needs stronger credential validation than the current API-key prefix checks in `src/onboarding.ts`; S01 should avoid baking weak validation assumptions into its boot contract.
- Raw RPC event volume may be too noisy for the existing skin. The browser bridge will likely need selective mapping/buffering to meet the “snappy and fast” bar.
- Refresh/reopen continuity is not solved by current `get_state` alone. S01 should avoid a design that assumes a single ephemeral in-memory session with no reattachment path.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| React/Next UI shell | `frontend-design` | installed |
| Next.js App Router host | `wshobson/agents@nextjs-app-router-patterns` | available — `npx skills add wshobson/agents@nextjs-app-router-patterns` |
| Tailwind CSS UI shell | `josiahsiegel/claude-plugin-marketplace@tailwindcss-advanced-layouts` | available — `npx skills add josiahsiegel/claude-plugin-marketplace@tailwindcss-advanced-layouts` |
| Streaming browser bridge | `dadbodgeoff/drift@sse-streaming` | available — `npx skills add dadbodgeoff/drift@sse-streaming` |

## Sources

- `gsd --web` is not parsed today; unknown flags fall through to interactive startup, onboarding is only triggered on the non-explicit-mode path, and session storage is already current-project scoped. (source: [src/cli.ts](../../../../../src/cli.ts))
- GSD bootstrap behavior lives in the loader, not the CLI alone. (source: [src/loader.ts](../../../../../src/loader.ts))
- The RPC contract already covers commands, session state, and `extension_ui_request` payloads needed for a focused browser panel. (source: [packages/pi-coding-agent/src/modes/rpc/rpc-types.ts](../../../../../packages/pi-coding-agent/src/modes/rpc/rpc-types.ts))
- The reference RPC client is not ready to serve as the browser bridge unchanged. (source: [packages/pi-coding-agent/src/modes/rpc/rpc-client.ts](../../../../../packages/pi-coding-agent/src/modes/rpc/rpc-client.ts))
- Real `.gsd` workspace state is already derivable without the TUI via workspace indexing and auto-dashboard helpers. (source: [src/resources/extensions/gsd/workspace-index.ts](../../../../../src/resources/extensions/gsd/workspace-index.ts), [src/resources/extensions/gsd/auto.ts](../../../../../src/resources/extensions/gsd/auto.ts))
- The existing onboarding flow is terminal-first, TTY-gated, browser-opening is best-effort via `open`/`start`/`xdg-open`, and API-key validation is currently weak. (source: [src/onboarding.ts](../../../../../src/onboarding.ts))
- The current web shell has no transport or route handlers and is built from local mock state. (source: [web/app/page.tsx](../../../../../web/app/page.tsx), [web/components/gsd/sidebar.tsx](../../../../../web/components/gsd/sidebar.tsx), [web/components/gsd/terminal.tsx](../../../../../web/components/gsd/terminal.tsx), [web/next.config.mjs](../../../../../web/next.config.mjs))
- The published package currently excludes `web/` from shipped files. (source: [package.json](../../../../../package.json))
- Next App Router route handlers can emit streaming responses using `ReadableStream`/`Response`, which makes same-origin SSE a viable bridge transport for M001. (source: [Next.js route handlers docs](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/route.mdx))
