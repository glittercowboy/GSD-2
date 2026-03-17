# M001/S05 — Research

**Date:** 2026-03-17
**Depth:** Light

## Summary

S05 adds a conditional `npm audit` step to the verification gate pipeline. When `package.json` or a lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) changed during a task, `npm audit --audit-level=moderate --json` runs. Results are parsed from JSON stdout, and high/critical vulnerabilities appear as non-blocking warnings in `VerificationResult`. The gate never fails on audit findings — they're advisory only.

This is straightforward work. The codebase already has every pattern needed: `spawnSync` for subprocess capture (`verification-gate.ts`), `VerificationResult` with optional extension fields (`runtimeErrors` pattern from S04), evidence JSON persistence with optional fields (`verification-evidence.ts`), and markdown table formatting with conditional sections (`formatEvidenceTable` runtime errors section). The only new concept is git-diff-based change detection for the trigger condition, which uses a simple `spawnSync("git", ["diff", "--name-only", "HEAD"])` check — no novel API.

## Recommendation

Implement as a single exported function `runDependencyAudit(cwd: string, options?)` in `verification-gate.ts` that:
1. Runs `git diff --name-only HEAD` to detect changed files (graceful fail if not a git repo)
2. Checks if any changed file matches `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`
3. If matched, runs `npm audit --audit-level=moderate --json` via `spawnSync`
4. Parses JSON stdout to extract vulnerability metadata
5. Returns an `AuditWarning[]` array (empty if no match, no vulnerabilities, or npm audit unavailable)

Wire it into the gate block in `auto.ts` after `captureRuntimeErrors()`, attaching results to `result.auditWarnings`. Add the `auditWarnings` field to `VerificationResult` (same optional-array pattern as `runtimeErrors`). Extend `writeVerificationJSON` and `formatEvidenceTable` to include audit data. Non-blocking — audit warnings never flip `result.passed` to false.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/types.ts` — Add `AuditWarning` interface and `auditWarnings?: AuditWarning[]` field to `VerificationResult`. Mirror the `RuntimeError` pattern (source, severity, message, blocking: false always).
- `src/resources/extensions/gsd/verification-gate.ts` — Add `runDependencyAudit(cwd, options?)` function. Uses `spawnSync("git", ...)` for change detection and `spawnSync("npm", ["audit", ...])` for the scan. Dependency-injectable options for testability (same pattern as `captureRuntimeErrors` D023).
- `src/resources/extensions/gsd/auto.ts` — Wire `runDependencyAudit(basePath)` call after `captureRuntimeErrors()` in the gate block (~line 1535). Attach `result.auditWarnings`. Add stderr logging for audit warnings (non-blocking, informational).
- `src/resources/extensions/gsd/verification-evidence.ts` — Extend `EvidenceJSON` with optional `auditWarnings` field. Extend `writeVerificationJSON` to include audit data. Extend `formatEvidenceTable` to append an "Audit Warnings" section when present (same conditional section pattern as runtime errors).
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — Tests for `runDependencyAudit`: git diff detection, package.json match/no-match, lockfile match, npm audit JSON parsing, graceful failure on non-git dir, graceful failure on npm audit error, empty vulnerabilities.
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — Tests for audit warning JSON persistence and markdown table formatting.

### Build Order

1. **Types + core function first** — Add `AuditWarning` to `types.ts`, implement `runDependencyAudit()` in `verification-gate.ts` with tests. This is the riskiest piece (JSON parsing, git detection). Proves the function works in isolation.
2. **Evidence formatting second** — Extend `verification-evidence.ts` with audit warning support in JSON and markdown table. Straightforward extension of existing patterns.
3. **Wire into auto.ts last** — Add the call site in the gate block. Minimal code (~10 lines). Depends on both prior tasks being complete.

### Verification Approach

- `npm run test:unit -- --test-name-pattern "dependency-audit"` or `"verification-gate"` — unit tests for the new function
- `npm run test:unit -- --test-name-pattern "verification-evidence"` — evidence formatting tests still pass with new audit fields
- `npm run test:unit` — full suite, no regressions
- `npx --yes tsx src/resources/extensions/gsd/verification-gate.ts` — compiles cleanly

### AuditWarning Shape

```typescript
interface AuditWarning {
  name: string;        // e.g. "file-type"
  severity: "low" | "moderate" | "high" | "critical";
  title: string;       // advisory title
  url: string;         // advisory URL
  fixAvailable: boolean;
}
```

### npm audit --json Output Shape (relevant fields)

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "<pkg-name>": {
      "name": "file-type",
      "severity": "moderate",
      "via": [{ "title": "...", "url": "...", "severity": "..." }],
      "fixAvailable": true
    }
  },
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 0, "moderate": 1, "high": 0, "critical": 0, "total": 1 }
  }
}
```

### Git Change Detection

Use `spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd, ... })` and check if any output line matches the lockfile/manifest patterns. This detects both staged and unstaged changes relative to HEAD. Falls back gracefully (returns empty array) if:
- Not a git repo (git exits non-zero)
- No changes detected
- git not available

### Lockfile Patterns to Match

```
package.json
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lockb
```

Only top-level matches — no subdirectory package.json detection needed (monorepo support is out of scope per R008).

## Constraints

- `npm audit` exit code is non-zero when vulnerabilities are found — this is expected behavior, not an error. Parse stdout JSON regardless of exit code.
- `npm audit --json` requires a `package-lock.json` or `npm-shrinkwrap.json` in the cwd. If neither exists (pnpm/yarn/bun projects), `npm audit` will fail. Graceful degradation: catch the error, return empty warnings, log to stderr.
- Audit results must be non-blocking per R008 — never set `result.passed = false` based on audit findings.
- Dependency injection pattern (D023) should be used for testability — allow injecting `gitDiff` and `npmAudit` functions so tests don't need real git repos or npm registries.

## Common Pitfalls

- **npm audit exits non-zero on vulnerabilities** — Don't treat non-zero exit as a command failure. Parse JSON from stdout regardless of exit code. Only treat it as an actual error if stdout is not valid JSON (spawn failure, npm not found, etc.).
- **Missing lockfile** — `npm audit` requires `package-lock.json`. Projects using pnpm/yarn/bun won't have one. The function should return empty warnings, not crash.
