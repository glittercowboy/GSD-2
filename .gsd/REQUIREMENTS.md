# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — Desktop app shell with native window management
- Class: core-capability
- Status: validated
- Description: Electron desktop app launches with native window, title bar, and proper macOS integration
- Why it matters: Foundation for everything else — no shell, no app
- Source: user
- Primary owning slice: M001-1ya5a3/S01
- Supporting slices: none
- Validation: `npm run dev -w studio` reaches renderer URL plus `[studio] preload loaded`, `[studio] window created`, and `GSD Studio ready`; Electron window loads the custom title bar shell in browser verification.
- Notes: Electron + Vite + React. Must support HMR in dev.

### R002 — gsd-2 RPC connection with full event streaming
- Class: core-capability
- Status: active
- Description: App spawns gsd-2 as a subprocess via JSON-RPC, streams all events (message_update, tool_execution_start/success/error, extension_ui_request), and handles the full bidirectional protocol
- Why it matters: This is the brain — without the RPC pipe, the app is an empty shell
- Source: user
- Primary owning slice: M001-1ya5a3/S02
- Supporting slices: none
- Validation: unmapped
- Notes: Uses `RpcClient` from `@gsd/pi-coding-agent`. Must handle process lifecycle, crash recovery, and all event types.

### R003 — Continuous document-flow message rendering with premium markdown
- Class: primary-user-loop
- Status: active
- Description: Agent text streams in real-time as a continuous left-aligned document flow — headings, code blocks with syntax highlighting (Shiki), tables, inline code, lists, blockquotes. Not chat bubbles. Premium typography with Inter, proper spacing, hierarchy, and weights.
- Why it matters: This is the primary reading experience. If the markdown rendering is mediocre, the whole app feels mediocre.
- Source: user
- Primary owning slice: M001-1ya5a3/S03
- Supporting slices: none
- Validation: unmapped
- Notes: Must handle streaming deltas smoothly without jank. Tables must render properly. Code blocks need language-specific syntax highlighting.

### R004 — Tool card system — bespoke cards per tool type
- Class: differentiator
- Status: active
- Description: Tool calls render as bespoke collapsed/expandable cards. Edit cards show syntax-highlighted inline diffs. Read cards show formatted code previews with line numbers. Bash cards show styled terminal output. Write cards show the created file with highlighting. Collapsed view shows just enough to be interesting — a code snippet, a diff summary, a command. Expanded view shows full detail. Each card type is a design piece with considered borders, spacing, hierarchy, and subtle expand animation.
- Why it matters: Tool cards are what you stare at 90% of the time. They are the product. They must be art.
- Source: user
- Primary owning slice: M001-1ya5a3/S04
- Supporting slices: M001-1ya5a3/S03
- Validation: unmapped
- Notes: Tool types to cover at minimum: Read, Write, Edit, Bash, lsp, search, browser tools. Each gets bespoke treatment. No generic "tool output" fallback that looks lazy.

### R005 — Integrated Monaco code editor with custom dark theme
- Class: core-capability
- Status: active
- Description: Monaco Editor panel in the right column with JetBrains Mono font, custom dark theme matching the app's monochrome + amber aesthetic, minimap disabled, proper syntax highlighting for all major languages
- Why it matters: Users need to see and read the code the agent is writing
- Source: user
- Primary owning slice: M001-1ya5a3/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Theme must match the app aesthetic exactly — not stock VS Code dark. Use `monaco.editor.defineTheme()` with custom token colors.

### R006 — File tree sidebar with project navigation
- Class: core-capability
- Status: active
- Description: Left sidebar shows the project's file tree with expandable directories, file type icons, and click-to-open behavior that loads files in the Monaco editor
- Why it matters: Spatial awareness of what the agent is building
- Source: user
- Primary owning slice: M001-1ya5a3/S06
- Supporting slices: M001-1ya5a3/S02
- Validation: unmapped
- Notes: Should auto-refresh when the agent creates/modifies files. File watching via Electron's Node.js fs.watch or chokidar.

### R007 — Localhost iframe preview pane for live web app preview
- Class: core-capability
- Status: active
- Description: Right panel has a tab/toggle to switch between the Monaco editor and a localhost iframe preview. When the agent spins up a dev server, the preview pane loads it.
- Why it matters: See what the agent builds in real-time without leaving the app
- Source: user
- Primary owning slice: M001-1ya5a3/S07
- Supporting slices: M001-1ya5a3/S02
- Validation: unmapped
- Notes: Detect dev server URL from agent's tool output or Bash stdout. iframe should auto-reload on changes.

### R008 — Dark monochrome + warm amber design system
- Class: quality-attribute
- Status: validated
- Description: Comprehensive design system — dark backgrounds, light text, monochrome grays, warm amber/gold as the single accent color. Inter for UI text, JetBrains Mono for code. Phosphor Icons. Radix primitives + Tailwind for styling. No Lucide icons, no purple, no shadcn recognizable aesthetic. Custom component library that feels like Linear or Vercel.
- Why it matters: The "no AI slop" requirement. Every pixel must feel intentional, premium, and hand-crafted.
- Source: user
- Primary owning slice: M001-1ya5a3/S01
- Supporting slices: all slices
- Validation: `npm run test -w studio` proves token/font contract; browser verification confirms Inter + JetBrains Mono, amber accents, and Phosphor-backed shell primitives render in the live app.
- Notes: Design system is established in S01 and consumed by every subsequent slice. Tailwind config defines the full color palette, typography scale, and spacing system.

### R009 — Beautiful interactive prompt UI — wizard-style extension UI
- Class: differentiator
- Status: active
- Description: Extension UI requests (select, confirm, input, editor) render as premium inline wizard components in the conversation flow. Single-select shows option cards with radio selection and a "None of the above" with free-form notes field. Multi-select shows checkboxes. Tab headers show question navigation. Recommended options are visually highlighted. The full ask_user_questions interaction surface — tab-to-add-notes, multi-page navigation, review screen — must be beautifully rendered.
- Why it matters: Interactive prompts are how the agent asks you questions during discussion, planning, and execution. If they feel like browser confirm() dialogs, the premium experience collapses.
- Source: user
- Primary owning slice: M001-1ya5a3/S05
- Supporting slices: M001-1ya5a3/S02
- Validation: unmapped
- Notes: Must handle all extension_ui_request methods: select (single + multi), confirm, input, editor. Also handle fire-and-forget: notify, setStatus, setWidget, setTitle. The secure_env_collect tool uses paged masked input — handle via the input method with masking.

### R010 — Three-column resizable layout
- Class: core-capability
- Status: validated
- Description: Three resizable columns — file tree (left), conversation stream (center), editor+preview (right). Draggable dividers. Center column is the primary focus. Panels can be collapsed.
- Why it matters: The spatial layout is the cockpit — seeing everything at once is the whole point
- Source: user
- Primary owning slice: M001-1ya5a3/S01
- Supporting slices: none
- Validation: Browser verification confirms the three-column shell; localStorage key `react-resizable-panels:gsd-studio-layout:files:conversation:editor` mutates after separator interaction, proving persisted resizable layout wiring.
- Notes: Use a panel library like react-resizable-panels or custom dividers. Remember panel sizes across sessions via localStorage.

### R011 — No AI slop aesthetic
- Class: constraint
- Status: validated
- Description: No Lucide icons, no purple accent, no generic component-kit look, no recognizable shadcn aesthetic, no default Monaco themes. Every visual element must feel intentionally designed, not assembled from a kit.
- Why it matters: This is a negative constraint that's sharper than any positive specification — it defines the taste bar
- Source: user
- Primary owning slice: M001-1ya5a3/S01
- Supporting slices: all slices
- Validation: Live shell review confirms Phosphor icons, restrained amber-only accents, flattened panel/card radii, and custom desktop chrome rather than stock component-kit styling.
- Notes: Enforce during every slice. UAT should include visual review.

### R012 — Streaming performance — smooth high-frequency delta rendering
- Class: quality-attribute
- Status: active
- Description: The RPC protocol emits high-frequency message_update deltas. The renderer must accumulate and display them smoothly without jank, dropped frames, or visible flicker. Markdown parsing and syntax highlighting must not block the render loop.
- Why it matters: Stuttery streaming kills the premium feel instantly
- Source: inferred
- Primary owning slice: M001-1ya5a3/S03
- Supporting slices: M001-1ya5a3/S04
- Validation: unmapped
- Notes: Consider requestAnimationFrame batching, virtual scrolling for long conversations, and deferred/async Shiki highlighting.

## Deferred

### R013 — Multi-project/session management
- Class: continuity
- Status: deferred
- Description: Manage multiple projects, switch between sessions, session history
- Why it matters: Power user need once the core experience is solid
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred to a later milestone. M001 works with one project at a time.

### R014 — Settings/preferences UI
- Class: admin/support
- Status: deferred
- Description: Settings panel for model selection, theme customization, keybindings, etc.
- Why it matters: Useful but not essential for the MVP experience
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred. Model and provider can be configured via gsd-2's existing mechanisms initially.

### R015 — Onboarding flow for new users
- Class: launchability
- Status: deferred
- Description: First-run experience, project setup wizard, API key configuration
- Why it matters: Required for general audience but not for the current primary user
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Building for Lex first. Onboarding comes when generalizing.

### R016 — App packaging and distribution
- Class: operability
- Status: deferred
- Description: DMG/installer generation, code signing, auto-update mechanism
- Why it matters: Required for distribution but not for local development use
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: electron-builder handles this. Defer until the app is worth distributing.

## Out of Scope

### R017 — Cloud/remote agent execution
- Class: anti-feature
- Status: out-of-scope
- Description: Running gsd-2 on a remote server rather than locally
- Why it matters: Prevents scope creep — this is a local desktop app
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: The agent runs locally as a subprocess. Period.

### R018 — WebContainers in-browser runtime
- Class: anti-feature
- Status: out-of-scope
- Description: Running Node.js inside the browser via WebContainers instead of using local dev servers
- Why it matters: Adds complexity for zero benefit — the agent already has local filesystem access
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Preview pane uses localhost iframe instead.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M001-1ya5a3/S01 | none | unmapped |
| R002 | core-capability | active | M001-1ya5a3/S02 | none | unmapped |
| R003 | primary-user-loop | active | M001-1ya5a3/S03 | none | unmapped |
| R004 | differentiator | active | M001-1ya5a3/S04 | M001-1ya5a3/S03 | unmapped |
| R005 | core-capability | active | M001-1ya5a3/S06 | none | unmapped |
| R006 | core-capability | active | M001-1ya5a3/S06 | M001-1ya5a3/S02 | unmapped |
| R007 | core-capability | active | M001-1ya5a3/S07 | M001-1ya5a3/S02 | unmapped |
| R008 | quality-attribute | active | M001-1ya5a3/S01 | all | unmapped |
| R009 | differentiator | active | M001-1ya5a3/S05 | M001-1ya5a3/S02 | unmapped |
| R010 | core-capability | active | M001-1ya5a3/S01 | none | unmapped |
| R011 | constraint | active | M001-1ya5a3/S01 | all | unmapped |
| R012 | quality-attribute | active | M001-1ya5a3/S03 | M001-1ya5a3/S04 | unmapped |
| R013 | continuity | deferred | none | none | unmapped |
| R014 | admin/support | deferred | none | none | unmapped |
| R015 | launchability | deferred | none | none | unmapped |
| R016 | operability | deferred | none | none | unmapped |
| R017 | anti-feature | out-of-scope | none | none | n/a |
| R018 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 12
- Mapped to slices: 12
- Validated: 0
- Unmapped active requirements: 0
