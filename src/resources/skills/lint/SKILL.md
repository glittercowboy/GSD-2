---
name: lint
description: Lint and format code. Auto-detects ESLint, Biome, Prettier, or language-native formatters and runs them with auto-fix. Reports remaining issues with actionable suggestions.
---

<objective>
Lint and format code in the current project. Auto-detect the project's linter and formatter toolchain, run them against the target files, and report results grouped by severity with actionable fix suggestions.
</objective>

<arguments>
This skill accepts optional arguments after `/lint`:

- **No arguments**: Lint only files changed in the current working tree (`git diff --name-only` and `git diff --cached --name-only`).
- **A file or directory path**: Lint only that specific path (e.g., `/lint src/utils`).
- **`--fix`**: Automatically apply safe fixes. Can be combined with a path (e.g., `/lint src/ --fix`).
- **`--fix` without a path**: Auto-fix changed files only.

Parse the arguments before proceeding. If `--fix` is present, set fix mode. If a non-flag argument is present, treat it as the target path.
</arguments>

<detection>
Auto-detect the project's linter and formatter by checking configuration files in the project root. Check in this order and use the **first match found** for each category (linter vs. formatter). A project may have both a linter and a formatter.

**JavaScript/TypeScript Linters:**

1. **Biome** — Look for `biome.json` or `biome.jsonc` in the project root.
   - Lint command: `npx @biomejs/biome check .` (or `--apply` with `--fix`)
   - Format command: `npx @biomejs/biome format .` (or `--write` with `--fix`)
   - Biome handles both linting and formatting. No need for a separate formatter if Biome is detected.

2. **ESLint** — Look for `.eslintrc`, `.eslintrc.*` (js, cjs, json, yml, yaml), `eslint.config.*` (js, mjs, cjs, ts, mts, cts), or an `"eslintConfig"` key in `package.json`.
   - Lint command: `npx eslint .` (or `--fix` with `--fix`)
   - Check `package.json` for the installed version. ESLint 9+ uses flat config (`eslint.config.*`).

**JavaScript/TypeScript Formatters (only if Biome was NOT detected):**

3. **Prettier** — Look for `.prettierrc`, `.prettierrc.*`, `prettier.config.*`, or a `"prettier"` key in `package.json`.
   - Format check: `npx prettier --check .`
   - Format fix: `npx prettier --write .`

**Rust:**

4. **rustfmt** — Look for `rustfmt.toml` or `.rustfmt.toml`, or `Cargo.toml` in the project root.
   - Format check: `cargo fmt -- --check`
   - Format fix: `cargo fmt`
   - Lint: `cargo clippy` (if available)

**Go:**

5. **Go tools** — Look for `go.mod` in the project root.
   - Format check: `gofmt -l .`
   - Format fix: `gofmt -w .`
   - Lint: `golangci-lint run` (if installed), otherwise `go vet ./...`

**Python:**

6. **Ruff** — Look for `ruff.toml` or a `[tool.ruff]` section in `pyproject.toml`.
   - Lint command: `ruff check .` (or `--fix` with `--fix`)
   - Format command: `ruff format .` (or `--check` without `--fix`)

7. **Black** — Look for a `[tool.black]` section in `pyproject.toml`, or `black` in requirements files.
   - Format check: `black --check .`
   - Format fix: `black .`

If no linter or formatter is detected, inform the user and suggest common options for their project type based on the files present.
</detection>

<execution>

**Step 1: Determine target files**

- If a path argument was provided, use that path.
- If no path argument, get changed files:
  ```bash
  git diff --name-only
  git diff --cached --name-only
  ```
  Filter to files that still exist on disk. If no files are changed, inform the user and offer to lint the entire project instead.

**Step 2: Run the detected tools**

Run the linter and/or formatter against the target files or directory.

- **Without `--fix`**: Run in check/report mode only. Do NOT modify any files.
- **With `--fix`**: Run with auto-fix flags enabled.

When running formatters without `--fix`, show a preview of what would change:
- For Prettier: use `--check` and list files that would change.
- For Biome: use `check` without `--apply`.
- For Black: use `--check --diff` to show the diff preview.
- For Ruff: use `--diff` for format and standard output for lint.
- For rustfmt/gofmt: use `--check` or `-l` to list files, then show a diff for up to 5 files using `diff <(command) file`.

**Step 3: Parse and organize output**

Parse the tool output and organize issues:

```markdown
## Lint Results

### Errors (X issues)
| File | Line | Rule | Message |
|------|------|------|---------|
| ... | ... | ... | ... |

### Warnings (X issues)
| File | Line | Rule | Message |
|------|------|------|---------|
| ... | ... | ... | ... |

### Formatting
- X files would be reformatted
- [list files]

### Summary
- Total issues: X errors, Y warnings, Z formatting
- Auto-fixable: N issues (run `/lint --fix` to apply)
```

**Step 4: Suggest fixes for common issues**

For the most frequent issues, provide brief actionable guidance:

- If the same rule appears 5+ times, suggest a bulk fix or config change.
- For unused imports/variables, list them for quick removal.
- For formatting-only issues, note that `--fix` will resolve them safely.
- For issues that cannot be auto-fixed, provide a one-line explanation of how to resolve each unique rule violation.

</execution>

<critical_rules>

1. **Never modify files without `--fix`**: Default mode is report-only. Respect the user's working tree.
2. **Use the project's own config**: Do not invent lint rules. Use whatever config files exist in the project.
3. **Use the project's installed version**: Always prefer `npx`, `cargo`, or the project-local binary. Do not use globally installed tools unless no local version exists.
4. **Handle missing tools gracefully**: If a config file exists but the tool is not installed, inform the user and provide the install command (e.g., `npm install --save-dev eslint`).
5. **Respect `.gitignore` and ignore patterns**: Do not lint `node_modules`, `dist`, `build`, `target`, `.git`, or other commonly ignored directories. Most tools handle this automatically; verify they do.
6. **Limit output**: If there are more than 50 issues, show the first 30 grouped by severity, then summarize the rest with counts per file. Do not flood the user with hundreds of lines.
7. **Exit cleanly**: After presenting results, do not take further action. Let the user decide next steps.

</critical_rules>
