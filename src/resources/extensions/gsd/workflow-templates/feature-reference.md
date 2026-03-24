# PR & Commit Best Practices Reference

## How to use this reference

1. **First:** Read the project's `CONTRIBUTING.md` if it exists — it is the source of truth.
   - `cat CONTRIBUTING.md 2>/dev/null` or use the Read tool on `CONTRIBUTING.md`
   - If found, extract: commit format, PR body format, branch naming, required checklist items
   - Use those conventions verbatim. The sections below are fallbacks only.

2. **If no CONTRIBUTING.md exists** (or it doesn't cover PR/commit conventions), use the
   canonical best practices below.

---

## Commit Messages

Use **Conventional Commits** format: `type(scope): description`

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or user-visible capability |
| `fix` | Bug fix |
| `refactor` | Code change with no behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Tooling, deps, build config |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration |

### Rules

- Subject line: imperative mood, ≤72 chars, no period at end
- Scope: the module, component, or area affected (e.g., `auth`, `api`, `cli`)
- Body (optional): explain *why*, not *what* — the diff shows what
- Breaking changes: add `!` after type/scope (`feat(api)!:`) and a `BREAKING CHANGE:` footer
- One concern per commit — do not bundle unrelated changes

### Examples

```
feat(cli): add --dry-run flag to deploy command
fix(auth): prevent token refresh loop on 401 retry
refactor(db): extract query builder into separate module
test(api): add integration tests for rate limiting
```

---

## PR Title

Follow the same Conventional Commits format as commit messages:

```
type(scope): short description of the change
```

- ≤70 characters
- No period at end
- Use the type that best describes the overall PR (usually the primary commit type)

---

## PR Body

```markdown
## TL;DR
One sentence: what this PR adds/fixes and why it matters.

## What
- Bullet 1: specific change
- Bullet 2: specific change
- Bullet 3: specific change

## Why
The motivation — user problem, bug report, tech debt, compliance requirement, etc.
Link to issue if one exists: Closes #<number>

## How
Brief technical approach. Highlight non-obvious decisions or trade-offs.

## Testing
How a reviewer can verify this works:
- [ ] Step 1
- [ ] Step 2

## Checklist
- [ ] Tests added/updated
- [ ] Build passes locally
- [ ] Linter passes
- [ ] No unintended scope creep
- [ ] Breaking changes documented (if any)

---
> AI assistance was used in authoring this change.
```

---

## PR Best Practices

- **One concern per PR** — reviewers should be able to understand the full change in one sitting
- **No drive-by changes** — don't fix unrelated style issues or reorder imports in files you're not modifying
- **Draft first** for multi-phase work — promote to Ready for Review only when complete
- **Link the issue** — `Closes #<n>` auto-closes the issue on merge
- **Respond to review comments** — resolve threads, don't just push fixes silently
- **Keep the PR green** — don't merge with failing CI unless explicitly approved

---

## Branch Naming

```
type/short-description
```

Examples: `feat/add-oauth-support`, `fix/null-pointer-login`, `chore/update-deps`

- Use lowercase and hyphens
- Match the intended commit type
- Keep it short but descriptive (≤40 chars after the prefix)

---

## Cross-Fork PRs

If the project is a fork with an `upstream` remote:

```bash
# Push to fork
git push -u origin feat/<slug>

# Open PR targeting upstream
gh pr create \
  --repo <upstream-org>/<repo> \
  --base main \
  --head <fork-user>:feat/<slug>
```

Never open a PR within the fork itself — always target upstream.
