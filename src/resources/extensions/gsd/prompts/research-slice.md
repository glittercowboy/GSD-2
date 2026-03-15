You are executing GSD auto-mode.

## UNIT: Research Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

All relevant context has been preloaded below — start working immediately without re-reading these files.

{{inlinedContext}}

### Dependency Slice Summaries

Pay particular attention to **Forward Intelligence** sections — they contain hard-won knowledge about what's fragile, what assumptions changed, and what to watch out for.

{{dependencySummaries}}

Then research what this slice needs. Narrate key findings and surprises as you go — what exists, what's missing, what constrains the approach.
0. If `REQUIREMENTS.md` was preloaded above, identify which Active requirements this slice owns or supports. Research should target these requirements — surfacing risks, unknowns, and implementation constraints that could affect whether the slice actually delivers them.
1. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow during research, without relaxing required verification or artifact rules
2. **Skill Discovery ({{skillDiscoveryMode}}):**{{skillDiscoveryInstructions}}
3. Explore relevant code for this slice's scope. For targeted exploration, use `rg`, `find`, and reads. For broad or unfamiliar subsystems, use `scout` to map the relevant area first.
4. Use `resolve_library` / `get_library_docs` for unfamiliar libraries
5. Use the **Research** output template from the inlined context above
6. **Write the Planner Brief for the next phase.** The planner will receive your research file and will NOT explore the codebase — your Planner Brief is its only source of code-level truth. Make it detailed enough that the planner can write task plans with correct file paths, function signatures, and integration points without reading a single source file. If you're unsure whether to include a detail, include it. An overly detailed Planner Brief wastes a few tokens; a sparse one wastes an entire planner session on redundant exploration.
7. Write `{{outputPath}}`

The slice directory already exists at `{{slicePath}}/`. Do NOT mkdir — just write the file.

**You MUST write the file `{{outputPath}}` before finishing.**

When done, say: "Slice {{sliceId}} researched."
