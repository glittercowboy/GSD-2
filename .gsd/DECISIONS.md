# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | arch | Engine abstraction pattern | WorkflowEngine + ExecutionPolicy interfaces with engine-resolver routing by session's activeEngineId | Decouples auto-loop (general-purpose orchestration) from workflow semantics (dev-specific). LoopDeps injection seam already exists — engine abstraction extends this pattern. | No |
| D002 | M001 | arch | Dev engine wrapper strategy | Delegate to existing state.ts/auto-dispatch.ts/auto-verification.ts — no rewrite | Dev workflow is the product's core. Wrapping preserves all behavior. Zero regression tolerance. | No |
| D003 | M001 | arch | Kill switch mechanism | GSD_ENGINE_BYPASS=1 env var skips engine layer entirely, falling back to raw auto-mode dispatch | Fast rollback if engine layer causes issues. Env var is immediate (no config reload needed). | Yes — may also add a GSD preference |
| D004 | M001 | convention | YAML schema conventions | YAML uses snake_case (depends_on, context_from). TypeScript uses camelCase (dependsOn, contextFrom). | Follows existing project convention (P005 from PR #1554). YAML readability for users vs TypeScript conventions for devs. | No |
| D005 | M001 | arch | Custom workflow state persistence | GRAPH.yaml in run directory tracks step status. DEFINITION.yaml is a frozen snapshot. PARAMS.json stores CLI overrides. | Run-level isolation. YAML is human-readable for debugging. Frozen definition ensures reproducibility. | No |
| D006 | M001 | arch | Workflow creator approach | GSD skill (SKILL.md router pattern) invokable via /gsd workflow new and standalone Skill tool | Skills are the established pattern for complex guided experiences (see create-skill). Skill can evolve independently of engine code. | No |
| D007 | M001 | scope | Iterate/fan-out in V1 | Include iterate — steps expand into sub-instances from regex matches on artifact content | Enables workflows that adapt to runtime discovery (audit each module, process each file). Key differentiator. | No |
