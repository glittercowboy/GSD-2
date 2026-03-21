---
estimated_steps: 5
estimated_files: 2
skills_used:
  - test
---

# T01: Rename tools to canonical names and register backward-compatible aliases

**Slice:** S04 — Tool Naming Convention
**Milestone:** M001-xij4rf

## Description

Refactor `db-tools.ts` to register all 4 GSD database tools under their new canonical `gsd_concept_action` names (per decision D002), then add a second registration for each under the old name as a backward-compatible alias. Write a test that verifies both canonical and alias names are registered with identical execute functions.

The rename map:
| Old Name (becomes alias) | New Canonical Name |
|---|---|
| `gsd_save_decision` | `gsd_decision_save` |
| `gsd_update_requirement` | `gsd_requirement_update` |
| `gsd_save_summary` | `gsd_summary_save` |
| `gsd_generate_milestone_id` | `gsd_milestone_generate_id` |

## Steps

1. In `db-tools.ts`, for each of the 4 tools: extract the tool definition object (everything inside `pi.registerTool({...})`) into a `const` variable, change its `name` to the canonical form, update `promptGuidelines` strings to reference the new canonical name.
2. After each canonical `pi.registerTool(toolDef)` call, add an alias registration: `pi.registerTool({ ...toolDef, name: "old_name", description: toolDef.description + " (alias for new_name — prefer the canonical name)", promptGuidelines: ["Alias for new_name — prefer the canonical name."] })`.
3. Update the `process.stderr.write` error log strings in each tool's execute function to use the canonical name.
4. Create `tests/tool-naming.test.ts` that: imports `registerDbTools`, creates a mock PI with `registerTool` that pushes to an array, calls `registerDbTools(mockPi)`, asserts 8 tools registered, asserts both old and new names exist for each pair, asserts `execute` function is identical (`===`) for each canonical/alias pair.
5. Run existing `gsd-tools.test.ts` to confirm no regression — those tests call DB functions directly and should pass unchanged.

## Must-Haves

- [ ] All 4 canonical names registered: `gsd_decision_save`, `gsd_requirement_update`, `gsd_summary_save`, `gsd_milestone_generate_id`
- [ ] All 4 old names registered as aliases: `gsd_save_decision`, `gsd_update_requirement`, `gsd_save_summary`, `gsd_generate_milestone_id`
- [ ] Each alias shares the exact same `execute` function reference (`===`) as its canonical counterpart
- [ ] Alias descriptions include "(alias for ...)" text
- [ ] New test file passes
- [ ] Existing `gsd-tools.test.ts` passes

## Verification

- `npx tsx src/resources/extensions/gsd/tests/tool-naming.test.ts` exits 0
- `npx tsx src/resources/extensions/gsd/tests/gsd-tools.test.ts` exits 0

## Inputs

- `src/resources/extensions/gsd/bootstrap/db-tools.ts` — current tool registrations to refactor
- `src/resources/extensions/gsd/tests/journal-query-tool.test.ts` — reference pattern for mock PI and tool registration testing

## Expected Output

- `src/resources/extensions/gsd/bootstrap/db-tools.ts` — refactored with canonical names and alias registrations
- `src/resources/extensions/gsd/tests/tool-naming.test.ts` — new test verifying naming and alias resolution
