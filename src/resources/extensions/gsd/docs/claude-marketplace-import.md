# Claude Marketplace Import

This document describes the Claude marketplace import feature in GSD: what it reads, what it imports, what it persists, and what it does not translate into active GSD/Pi runtime behavior.

---

## What this feature does

GSD can read Claude Code marketplace catalogs, inspect the plugins they reference, and import selected Claude skills into GSD/Pi while preserving Claude-style namespace identity.

The interactive entry point is:

```text
/gsd prefs import-claude
```

You can also choose scope explicitly:

```text
/gsd prefs import-claude global
/gsd prefs import-claude project
```

---

## Claude Code model this feature follows

Anthropic documents Claude marketplaces as sources users add with:

```text
/plugin marketplace add <github repo or local path>
```

A marketplace contains a catalog at:

```text
.claude-plugin/marketplace.json
```

Anthropic distinguishes between:

- **Marketplace source** — where Claude fetches `marketplace.json`
- **Plugin source** — where Claude fetches each plugin listed in that marketplace
- **Installed plugin cache** — Claude copies installed plugin payloads into:

```text
~/.claude/plugins/cache
```

Anthropic also documents user-added marketplace sources under:

```text
~/.claude/plugins/marketplaces
```

GSD aligns its Claude import flow to that model.

---

## Where GSD looks

For Claude plugin and marketplace material, GSD prefers Claude-managed locations first:

1. `~/.claude/plugins/marketplaces`
2. `~/.claude/plugins/cache`
3. `~/.claude/plugins`

After that, GSD still allows local clone-style convenience paths such as sibling repos or `~/repos/...` paths. Those fallbacks remain supported for developer workflows, but they are not the primary Claude storage model.

---

## What GSD imports

### Imported into GSD/Pi settings

- Claude skills discovered directly from configured skill roots
- Marketplace-derived skills

Imported marketplace skills preserve canonical namespace identity, for example:

```text
python3-development:stinkysnake
scientific-method:experiment-protocol
```

### Discovered, modeled, and validated

- Marketplace-derived agents

### Discovered but not translated into active Pi-native runtime behavior

- hooks
- MCP server definitions
- LSP server definitions
- other plugin metadata that does not currently map directly into active GSD/Pi runtime surfaces

---

## Import flow

The import flow does the following:

1. discover Claude skills and marketplace/plugin roots
2. identify marketplace roots by checking for `.claude-plugin/marketplace.json`
3. inspect discovered plugins and inventory their components
4. let you select components to import
5. validate the selection for canonical conflicts and ambiguity
6. persist imported resources into GSD/Pi settings

---

## Namespace behavior

GSD preserves Claude plugin namespace semantics rather than flattening plugin components into anonymous global names.

### Canonical references

Canonical references remain available for imported components:

- skills: `plugin-name:skill-name`
- agents: `plugin-name:agent-name`

### Shorthand

GSD supports shorthand lookup when it is unambiguous.

### Local-first resolution

When a namespaced component refers to another component by bare name, GSD tries the same plugin namespace first before broader lookup.

---

## Important safeguard: marketplace agent directories are not stored as package sources

Claude plugin agent directories are markdown agent-definition directories, for example:

```text
.../plugins/python3-development/agents
```

GSD does **not** persist imported marketplace agent directories into:

```json
settings.packages
```

This is intentional.

### Why

Persisting an `.../agents` directory into `settings.packages` can cause Pi startup to treat that directory as an extension/package root. In real host validation, that produced extension loader failures such as:

```text
Cannot find module '.../agents'
```

GSD now avoids writing those entries.

---

## Settings effects

### Skills

Imported skills are persisted into Pi skill settings. Depending on the selection path, they may also be added to GSD preferences.

### Marketplace agents

Marketplace agents remain part of the import model and validation surface, but their `agents/` directories are not persisted as package roots.

---

## Diagnostics

GSD distinguishes between:

- **canonical conflicts** — hard errors
- **shorthand overlaps** — warnings when canonical names remain distinct
- **alias conflicts** — diagnostics for alias collisions or shadowing

This allows imported marketplace content to be validated without reporting valid overlap as fatal breakage.

---

## Verification status of this feature

This feature has been verified in three ways:

1. **Contract/unit tests** for parsing, namespacing, resolution, diagnostics, and import behavior
2. **Portable integration-style tests** using local or cloned marketplace fixtures
3. **Real host validation** against the installed `gsd` binary and actual Claude-managed directories on the host machine

Real host validation included:

- clean startup of the installed `gsd` binary after fixing stale bad settings
- successful invocation of an imported skill (`/stinkysnake`)
- successful execution of `/gsd prefs import-claude global`
- verification that imported marketplace agent directories were **not** reintroduced into `settings.packages`

---

## Current limitations

- GSD does not yet translate every Claude plugin component type into active Pi-native runtime behavior
- marketplace-derived agents are not persisted as package roots, by design
- clone-style local fallbacks still exist for developer convenience, even though Claude-managed marketplace/plugin locations are preferred first

---

## References

- Anthropic: Claude Code settings
- Anthropic: Create and distribute a plugin marketplace
- Anthropic: Plugins and plugin reference
