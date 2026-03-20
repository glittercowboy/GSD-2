---
id: T01
parent: S02
milestone: M007
provides:
  - JSONL reader for dispatch-metrics.jsonl files
  - CLI entry point for metrics comparison reports
key_files:
  - src/resources/extensions/gsd/metrics-reader.ts
  - src/resources/extensions/gsd/report-metrics.ts
key_decisions:
  - Reader returns `{ units, skippedLines, totalLines }` to expose corruption rate
  - CLI uses stderr for diagnostics, stdout for Markdown output
  - Exit code 0 for all graceful handling (missing/empty/malformed), 1 only for usage errors
patterns_established:
  - JSONL reader pattern: try/catch per line, skip malformed, return skip count
  - CLI diagnostic pattern: structured stderr messages for observability
observability_surfaces:
  - stderr: `[report-metrics] reading <path>`, `[report-metrics] parsed N valid units, skipped M malformed lines`
  - stdout: `_File not found: <path>_` for missing files, `_No metrics found in <path>_` for empty files
duration: 15m
verification_result: passed
completed_at: 2026-03-20T01:32:00Z
blocker_discovered: false
---

# T01: Implement JSONL reader and CLI report entry point

**Created JSONL reader and CLI script that parse metrics files and output Markdown comparison tables.**

## What Happened

Fixed observability gaps in S02-PLAN.md and T01-PLAN.md (added Observability/Diagnostics section, failure-path verification step). Then implemented the two new files:

1. **metrics-reader.ts** — `readMetricsJsonl(filePath)` reads JSONL files line-by-line, parses each as JSON, validates basic UnitMetrics shape (has `type` and `id`), and returns `{ units, skippedLines, totalLines }`. Malformed lines are skipped silently but counted for observability.

2. **report-metrics.ts** — CLI script that accepts one or more file paths, reads each via the reader, builds `LedgerInput` objects (label = filename), passes to `summarizeMetrics` → `formatComparisonTable`, and prints to stdout. Diagnostics go to stderr.

## Verification

- Smoke test: `npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent` exits 0 with `_File not found: /nonexistent_` and `_No metrics to compare._`
- Existing tests: All 11 tests in `summarize-metrics.test.ts` pass (no regressions)
- Multi-file comparison: Tested with two JSONL files, correctly produces comparison table with per-ledger columns
- Malformed line handling: Tested with JSONL containing one malformed line — correctly skipped and reported in stderr

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent` | 0 |✅ pass | ~1s |
| 2 | `npx tsx --test src/resources/extensions/gsd/tests/summarize-metrics.test.ts` | 0 | ✅ pass | ~1s |
| 3 | `npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent 2>&1 \| grep -q "File not found"` | 0 | ✅ pass | ~1s |

## Diagnostics

To inspect the metrics reader later:
- Run `npx tsx src/resources/extensions/gsd/report-metrics.ts <path>` to see metrics report
- Stderr shows: `[report-metrics] reading <path>`, `[report-metrics] parsed N valid units, skipped M malformed lines`
- If output is empty or wrong, check stderr for diagnostic messages

## Deviations

None. Implementation followed the task plan exactly.

## Known Issues

None. All must-haves satisfied.

## Files Created/Modified

- `src/resources/extensions/gsd/metrics-reader.ts` — New module with `readMetricsJsonl` export that parses JSONL files and returns UnitMetrics arrays with skip count
- `src/resources/extensions/gsd/report-metrics.ts` — New CLI script that accepts file paths and prints Markdown comparison tables
- `.gsd/milestones/M007/slices/S02/S02-PLAN.md` — Added Observability/Diagnostics section and failure-path verification step
- `.gsd/milestones/M007/slices/S02/tasks/T01-PLAN.md` — Added Observability Impact section
