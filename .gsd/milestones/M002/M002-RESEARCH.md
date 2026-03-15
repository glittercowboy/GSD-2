# M002 — Research

**Date:** 2026-03-15

## Summary

M002 should start with a command-parity audit, not a framework rewrite. The clearest parity truth is `packages/pi-coding-agent/src/core/slash-commands.ts`: the TUI has a concrete built-in command surface, and the web shell does not currently dispatch most of it. In `web/components/gsd/terminal.tsx` plus `web/lib/gsd-workspace-store.tsx`, the browser only special-cases `/state`, `/new`, `/clear`, and `/refresh`; built-ins like `/model`, `/settings`, `/resume`, `/fork`, `/tree`, `/thinking`, `/compact`, `/login`, and `/logout` currently fall through as normal prompt text. That is the highest-risk gap because it turns known control commands into agent messages.

The good news is that the transport gap is smaller than the UI gap. `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` and `rpc-mode.ts` already expose serializable commands for model selection, thinking level, compaction, session stats, export, switching sessions, forking, session naming, and command discovery. Several M002 wins are therefore “surface existing transport safely in web” rather than “invent new backend.” The harder remaining gaps are the commands that still have no browser-appropriate contract, especially session tree navigation, scoped model management, reload/auth-management flows, and a few convenience commands.

Hardening should not mean polling `/api/boot` more aggressively. `src/web/bridge-service.ts` assembles a fat boot snapshot (workspace index, auto state, onboarding, resumable sessions, bridge snapshot), caches workspace index data for 30 seconds, and does not appear to invalidate that cache in production. The terminal/focused-panel path is event-driven over SSE, but roadmap/sidebar/dashboard state is snapshot-driven, so the browser can show a live agent stream next to stale workspace metadata. The right M002 move is to extend the existing singleton bridge/SSE contract with targeted serializable view-model updates and recovery surfaces, while deferring any Next.js/host migration until after the parity and freshness gaps are actually measured.

## Recommendation

1. **Prove command safety first.** Build an authoritative browser dispatcher for known slash commands using `packages/pi-coding-agent/src/core/slash-commands.ts` and existing RPC command types. A built-in command typed in the browser must execute, route to a supported surface, or reject clearly — never hit the model as plain text.
2. **Land the RPC-backed parity wins first.** The fastest daily-use gains are model selection, thinking/queue controls, session info/name/export, fork/current-project resume, and post-onboarding auth management, because most of the transport already exists.
3. **Only then expand contracts for true gaps.** Session tree navigation, scoped model management, reload, and similar features need new serializable contracts or explicit deferral decisions.
4. **Harden continuity with targeted live state, not boot polling.** Add narrow live view models or SSE events for auto/workspace freshness, validation detail, and recovery/doctor surfaces. Treat `/api/boot` as a startup/snapshot contract, not as a high-frequency live feed.
5. **Keep M002 current-project scoped.** Current-project session switching is table stakes. Cross-project resume/project-hub behavior remains R020 unless the user explicitly re-scopes it.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Workflow CTA derivation and “what should I do next?” suggestions | `src/resources/extensions/gsd/workspace-index.ts#getSuggestedNextCommands()` | Keeps browser workflow actions aligned with authoritative workspace state and doctor recommendations instead of duplicating heuristics in `web/lib/workflow-actions.ts`. |
| Built-in command parity checklist | `packages/pi-coding-agent/src/core/slash-commands.ts` + `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` | Gives an exact inventory of built-ins and shows which ones already have serializable transport. |
| Live auto/dashboard state | `src/resources/extensions/gsd/dashboard-overlay.ts`, `src/resources/extensions/gsd/auto.ts#getAutoDashboardData()`, `src/resources/extensions/gsd/metrics.ts` | These are already the real TUI sources for current unit, timing, cost, and progress. Do not infer auto-mode state from terminal lines. |
| Interrupted-run / recovery diagnostics | `src/resources/extensions/gsd/session-forensics.ts` + `src/resources/extensions/gsd/doctor.ts` | Existing recovery and validation logic is richer than the current browser banners; reuse it for browser-first failure visibility. |
| Web auth setup, validation, and bridge auth refresh | `src/web/onboarding-service.ts` + `src/web/web-auth-storage.ts` | The browser onboarding flow already knows how to validate credentials and restart the bridge onto the new auth view; extend it instead of creating a second auth path. |
| Session metadata and threaded resume semantics | `packages/pi-coding-agent/src/core/session-manager.ts` + `packages/pi-coding-agent/src/modes/interactive/components/session-selector.ts` | If session browsing grows beyond the current lightweight dashboard list, reuse the existing semantics for naming, threading, and search instead of inventing incompatible behavior. |

## Existing Code and Patterns

- `packages/pi-coding-agent/src/core/slash-commands.ts` — authoritative built-in TUI command list; use it as the M002 parity checklist and safe browser-dispatch source.
- `web/components/gsd/terminal.tsx` — current browser terminal parser; only `/clear` and `/refresh` are handled locally and everything else flows into `buildPromptCommand(...)`.
- `web/lib/gsd-workspace-store.tsx` — solid external-store/SSE pattern using `useSyncExternalStore`; already captures `statusTexts`, `widgetContents`, `titleOverride`, and `editorTextBuffer`, but only `statusTexts` are visibly rendered today.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — existing serializable surface for `set_model`, `get_available_models`, `set_thinking_level`, `compact`, `get_session_stats`, `export_html`, `switch_session`, `fork`, `get_fork_messages`, `set_session_name`, `get_messages`, and `get_commands`.
- `packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts` — confirms which commands already work over RPC and which UI affordances are intentionally unsupported in RPC mode (e.g. custom header/footer factories).
- `src/web/bridge-service.ts` — long-lived project-scoped bridge singleton, `/api/boot` snapshot assembly, 30s workspace-index cache, and simplified per-project resumable session listing.
- `src/resources/extensions/gsd/workspace-index.ts` — authoritative workspace index, validation issues, scope suggestions, and next-command suggestions; better source of truth than hard-coded browser heuristics.
- `src/resources/extensions/gsd/dashboard-overlay.ts` — canonical TUI auto-dashboard semantics and shaping for progress, timing, and current-unit visibility.
- `src/resources/extensions/gsd/session-forensics.ts` — existing interrupted-run/crash-recovery diagnostics that are not yet surfaced in web.
- `packages/pi-coding-agent/src/modes/interactive/components/settings-selector.ts` — canonical settings menu and option set for the current product surface.
- `packages/pi-coding-agent/src/modes/interactive/components/model-selector.ts` — canonical model selector semantics, including scoped/all behavior.
- `packages/pi-coding-agent/src/modes/interactive/components/session-selector.ts` — canonical resume/session-tree semantics, including current-vs-all scope, naming, delete/rename, and threaded view.
- `web/components/gsd/dashboard.tsx` — current browser session switching is current-project-only and lightweight; useful base, but much narrower than the TUI selector.
- `web/components/gsd/sidebar.tsx` — Git and Settings affordances are visually present but inert, which makes them named parity debt rather than cosmetic extras.
- `web/app/layout.tsx` + `web/components/theme-provider.tsx` — theme plumbing exists in-repo, but the provider is not mounted in the live shell.

## Constraints

- Preserve the current-project-first contract; cross-project launcher/all-sessions browser UX remains deferred under R020 unless explicitly re-scoped.
- Browser mode must stay browser-first and same-origin local. M002 should not reintroduce hidden TUI dependence.
- RPC mode intentionally serializes only string-array widgets, status text, title, and editor text; TUI component factories/header/footer factories are not portable as-is.
- `/api/boot` is a fat snapshot and is not a cheap live poll target: it can parse workspace files and session JSONL metadata on each request.
- `src/web/bridge-service.ts` caches workspace index data for 30 seconds, and I found no production invalidation path.
- Session listing cost scales with history because the current listing path reads and parses full JSONL files for metadata/message counts.
- Decision D005 still applies: keep the existing Next.js host until parity/hardening work proves the host itself is the problem.

## Common Pitfalls

- **Sending known slash commands to the model** — In web, commands like `/model`, `/resume`, `/thinking`, `/fork`, and `/tree` currently fall through to prompt text. Use authoritative command dispatch, not ad hoc string checks limited to `/new`.
- **Solving stale panels by hammering `/api/boot`** — That increases workspace/session parsing cost and still leaves cache invalidation problems. Prefer targeted SSE/view-model updates or narrow refresh endpoints.
- **Duplicating workflow logic in React only** — `web/lib/workflow-actions.ts` is already a hand-rolled heuristic. Prefer authoritative server-side suggestions or shared derivation from workspace state so the browser does not drift from GSD semantics.
- **Confusing “captured in store” with “visible in UI”** — `statusTexts` render today, but `widgetContents`, `titleOverride`, and `editorTextBuffer` do not. Audit render surfaces, not just event handling.
- **Accidentally widening M002 into R020** — Current-project session switching is table stakes; all-project launcher/hub behavior is still explicitly deferred.
- **Trying to port TUI component factories directly** — RPC deliberately strips non-serializable header/footer/widget factories. For browser parity, add serializable view models or browser-native surfaces instead.

## Open Risks

- Some TUI built-ins still lack a browser-appropriate contract (`tree`, `scoped-models`, `reload`, parts of auth management), so slice ordering will require explicit scope cuts.
- The browser currently combines event-driven terminal state with snapshot-driven workspace/auto state; without contract changes, panels can disagree during real work.
- Post-onboarding auth management is asymmetric: add/validate exists, but browser-local delete/logout flows are not present in `src/web/web-auth-storage.ts`.
- Dashboard/sidebar freshness work can regress startup or interaction latency if it piggybacks on heavy boot reads instead of targeted transport.
- Existing visual affordances (Git, Settings, theme-related plumbing) can create false “parity complete” assumptions unless each one is either wired or explicitly deferred.

## Candidate Requirements (advisory only)

### Table stakes for R011

- **Candidate R012 — Web mode safely dispatches known built-in slash commands.** A built-in command typed in the browser must execute, route to a supported surface, or reject clearly; it must not become model prompt text.
- **Candidate R013 — Current-project daily-use controls reach browser parity.** At minimum: model selection, thinking/queue controls, session info/name/export, fork/resume within the current project, and post-onboarding auth management.
- **Candidate R014 — Browser recovery surfaces expose actionable diagnostics.** Validation issues, interrupted-run recovery, and common failure states should surface authoritative doctor/forensics detail, not just a count or generic banner.
- **Candidate R015 — Workspace and auto surfaces stay fresh without manual refresh.** Roadmap/sidebar/dashboard state should update promptly during live work without relying on aggressive `/api/boot` polling.

### Probably optional or still deferred

- Cross-project/all-sessions browser hub beyond the current project scope (still R020 territory).
- Deep historical analytics beyond live activity plus recovery/doctor surfaces (still R021 territory).
- Theme/skin switching unless the user explicitly wants that as part of “current UI skin capabilities,” not just operational parity.
- Convenience commands like `/share`, `/copy`, `/changelog`, `/hotkeys`, and `/quit` unless user feedback shows they are part of daily browser use.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js App Router | `wshobson/agents@nextjs-app-router-patterns` | available (not installed) — `npx skills add wshobson/agents@nextjs-app-router-patterns` |
| React | `vercel-labs/agent-skills@vercel-react-best-practices` | available (not installed) — `npx skills add vercel-labs/agent-skills@vercel-react-best-practices` |
| Server-Sent Events | `dadbodgeoff/drift@sse-streaming` | available (not installed) — `npx skills add dadbodgeoff/drift@sse-streaming` |

## Sources

- Built-in command parity truth and browser parser gap (source: `packages/pi-coding-agent/src/core/slash-commands.ts`, `web/components/gsd/terminal.tsx`, `web/lib/gsd-workspace-store.tsx`)
- Existing serializable RPC surface for many missing web controls (source: `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts`, `packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts`)
- Boot snapshot composition, workspace-index cache, and session-listing constraints (source: `src/web/bridge-service.ts`)
- Current browser surfaces and inert affordances (source: `web/components/gsd/dashboard.tsx`, `web/components/gsd/sidebar.tsx`, `web/components/gsd/status-bar.tsx`)
- Authoritative workspace suggestions and validation surface (source: `src/resources/extensions/gsd/workspace-index.ts`)
- Existing live auto dashboard semantics (source: `src/resources/extensions/gsd/dashboard-overlay.ts`)
- Existing interrupted-run / crash-recovery diagnostics (source: `src/resources/extensions/gsd/session-forensics.ts`)
- Session metadata cost and threaded resume semantics (source: `packages/pi-coding-agent/src/core/session-manager.ts`, `packages/pi-coding-agent/src/modes/interactive/components/session-selector.ts`)
- Browser auth validation and bridge-refresh lifecycle (source: `src/web/onboarding-service.ts`, `src/web/web-auth-storage.ts`)
- Next.js Route Handlers streaming guidance for web responses (source: [Next.js Route Handler docs](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/route.mdx))
- React guidance for external-store subscriptions (source: [React `useSyncExternalStore` docs](https://react.dev/reference/react/useSyncExternalStore))
