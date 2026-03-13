# GSD Preferences Reference

Full documentation for `~/.gsd/preferences.md` (global) and `.gsd/preferences.md` (project).

---

## Notes

- Keep this skill-first.
- Prefer explicit skill names or absolute paths.
- Use absolute paths for personal/local skills when you want zero ambiguity.
- These preferences guide which skills GSD should load and follow; they do not override higher-priority instructions in the current conversation.

---

## Field Guide

- `version`: schema version. Start at `1`.

- `always_use_skills`: skills GSD should use whenever they are relevant.

- `prefer_skills`: soft defaults GSD should prefer when relevant.

- `avoid_skills`: skills GSD should avoid unless clearly needed.

- `skill_rules`: situational rules with a human-readable `when` trigger and one or more of `use`, `prefer`, or `avoid`.

- `custom_instructions`: extra durable instructions related to skill use.

- `models`: per-stage model selection for auto-mode. Keys: `research`, `planning`, `execution`, `completion`. Values can be:
  - Simple string: `"claude-sonnet-4-6"` — single model, no fallbacks
  - Object with fallbacks: `{ model: "claude-opus-4-6", fallbacks: ["glm-5", "minimax-m2.5"] }` — tries fallbacks in order if primary fails
  - Omit a key to use whatever model is currently active. Fallbacks are tried when model switching fails (provider unavailable, rate limited, etc.).

- `skill_discovery`: controls how GSD discovers and applies skills during auto-mode. Valid values:
  - `auto` — skills are found and applied automatically without prompting.
  - `suggest` — (default) skills are identified during research but not installed automatically.
  - `off` — skill discovery is disabled entirely.

- `auto_supervisor`: configures the auto-mode supervisor that monitors agent progress and enforces timeouts. Keys:
  - `model`: model ID to use for the supervisor process (defaults to the currently active model).
  - `soft_timeout_minutes`: minutes before the supervisor issues a soft warning (default: 20).
  - `idle_timeout_minutes`: minutes of inactivity before the supervisor intervenes (default: 10).
  - `hard_timeout_minutes`: minutes before the supervisor forces termination (default: 30).

- `git`: configures GSD's git behavior. All fields are optional — omit any to use defaults. Keys:
  - `auto_push`: boolean — automatically push commits to the remote after committing. Default: `false`.
  - `push_branches`: boolean — push newly created slice branches to the remote. Default: `false`.
  - `remote`: string — git remote name to push to. Default: `"origin"`.
  - `snapshots`: boolean — create snapshot commits (WIP saves) during long-running tasks. Default: `false`.
  - `pre_merge_check`: boolean or `"auto"` — run pre-merge checks before merging a slice branch. `true` always runs, `false` never runs, `"auto"` runs when CI is detected. Default: `false`.
  - `commit_type`: string — override the conventional commit type prefix. Must be one of: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`. Default: inferred from diff content.
  - `main_branch`: string — the primary branch name for new git repos (e.g., `"main"`, `"master"`, `"trunk"`). Also used by `getMainBranch()` as the preferred branch when auto-detection is ambiguous. Default: `"main"`.

---

## Best Practices

- Keep `always_use_skills` short.
- Use `skill_rules` for situational routing, not broad personality preferences.
- Prefer skill names for stable built-in skills.
- Prefer absolute paths for local personal skills.

---

## Models Example

```yaml
---
version: 1
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6
---
```

Opus for planning (where architectural decisions matter most), Sonnet for everything else (faster, cheaper). Omit any key to use the currently selected model.

## Models with Fallbacks Example

```yaml
---
version: 1
models:
  research:
    model: openrouter/deepseek/deepseek-r1
    fallbacks:
      - openrouter/minimax/minimax-m2.5
  planning:
    model: claude-opus-4-6
    fallbacks:
      - openrouter/z-ai/glm-5
      - openrouter/moonshotai/kimi-k2.5
  execution:
    model: openrouter/z-ai/glm-5
    fallbacks:
      - openrouter/minimax/minimax-m2.5
  completion: openrouter/minimax/minimax-m2.5
---
```

When a model fails to switch (provider unavailable, rate limited, credits exhausted), GSD automatically tries the next model in the `fallbacks` list. This ensures auto-mode continues even when your preferred provider hits limits.

**Cost-optimized example** — use cheap models with expensive ones as fallback for critical phases:

```yaml
---
version: 1
models:
  research: openrouter/deepseek/deepseek-r1  # $0.28/$0.42 per 1M tokens
  planning:
    model: claude-opus-4-6                   # $5/$25 — best for architecture
    fallbacks:
      - openrouter/z-ai/glm-5                # $1/$3.20 — strong alternative
  execution: openrouter/minimax/minimax-m2.5 # $0.30/$1.20 — cheapest quality
  completion: openrouter/minimax/minimax-m2.5
---
```

---

## Example Variations

**Minimal — always load a UAT skill and route Clerk tasks:**

```yaml
---
version: 1
always_use_skills:
  - /Users/you/.claude/skills/verify-uat
skill_rules:
  - when: finishing implementation and human judgment matters
    use:
      - /Users/you/.claude/skills/verify-uat
---
```

**Richer routing — prefer cleanup and authentication skills:**

```yaml
---
version: 1
prefer_skills:
  - commit-ignore
skill_rules:
  - when: task involves Clerk authentication
    use:
      - clerk
      - clerk-setup
  - when: the user is looking for installable capability rather than implementation
    prefer:
      - find-skills
---
```

---

## Git Preferences Example

```yaml
---
version: 1
git:
  auto_push: true
  push_branches: true
  remote: origin
  snapshots: true
  pre_merge_check: auto
  commit_type: feat
---
```

All git fields are optional. Omit any field to use the default behavior. Project-level preferences override global preferences on a per-field basis.
