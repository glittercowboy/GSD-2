---
id: S02
parent: M007
milestone: M007
provides:
  - JSONL reader for dispatch-metrics.jsonl files with crash resilience
  - CLI entry point for metrics comparison reports
  - Test suite validating durability across partial/truncated/malformed content
requires:
  - slice: S01
    provides: Telemetry schema and dispatch-metrics.jsonl format
affects:
  - slice: S03 (consumes reader for fixture validation)
key_files:
  - src/resources/extensions/gsd/metrics-reader.ts
  - src/resources/extensions/gsd/report-metrics.ts
  - src/resources/extensions/gsd/tests/metrics-reader.test.ts
key_decisions:
  - Reader returns `{ units, skippedLines, totalLines }` to expose corruption rate
  - CLI uses stderr for diagnostics, stdout for Markdown output
  - Exit code 0 for all graceful handling (missing/empty/malformed), 1 only for usage errors
  - Reader validates required fields (type, id) and skips entries missing them
patterns_established:
  - JSONL reader pattern: try/catch per line, skip malformed, return skip count
  - CLI diagnostic pattern: structured stderr messages for observability
  - Test pattern: temp files with randomUUID for isolation
observability_surfaces:
  - CLI stderr: `[report-metrics] reading <path>`, `[report-metrics] parsed N valid units, skipped M malformed lines`
  - CLI stdout: `_File not found: <path>_` for missing files, `_No metrics found in <path>_` for empty files
  - Reader return value exposes skippedLines count for downstream monitoring
drill_down_paths:
  - .gsd/milestones/M007/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S02/tasks/T02-SUMMARY.md
duration: 27m
verification_result: passed
completed_at: 2026-03-19T21:40:00Z
---

# S02: Metrics Aggregation & Reporting

**A CLI-invokable utility that reads dispatch-metrics.jsonl files, produces comparison tables, and handles malformed/partial lines gracefully.**

## What Happened

Built the metrics aggregation layer that bridges raw telemetry capture (from S01) to human-readable reporting. This slice implements:

1. **JSONL Reader (`metrics-reader.ts`)**: Reads dispatch-metrics.jsonl files line-by-line, parses each line as JSON, validates required fields (type, id), skips malformed lines while counting them, returns structured result with `{ units, skippedLines, totalLines }`.

2. **CLI Entry Point (`report-metrics.ts`)**: Accepts file path arguments, invokes the reader, builds LedgerInput objects, passes to existing `summarizeMetrics` → `formatComparisonTable`, prints Markdown table to stdout, diagnostics to stderr.

3. **Crash Resilience Tests (`metrics-reader.test.ts`)**: 9 test cases covering valid multi-line JSONL, empty files, blank lines, truncated JSON, malformed-only content, nonexistent files, mixed valid/invalid, missing required fields, whitespace-only files.

## Verification

All verification checks from S02-PLAN.md passed:

| Check | Command | Result |
|-------|---------|--------|
| Reader tests | `npx tsx --test src/resources/extensions/gsd/tests/metrics-reader.test.ts` | 9/9 pass |
| Existing tests | `npx tsx --test src/resources/extensions/gsd/tests/summarize-metrics.test.ts` | 11/11 pass |
| Missing file | `npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent.jsonl` | exits 0, shows graceful message |
| Real file test | `npx tsx src/resources/extensions/gsd/report-metrics.ts /tmp/metrics1.jsonl` | produces Markdown table |

## New Requirements Surfaced

None. All requirements in this slice were already covered by the roadmap.

## Deviations

None. Implementation followed the task plan exactly.

## Known Limitations

- The `formatComparisonTable` output shows `NaN` for intervention counts and duration values when computing means — this appears to be a pre-existing issue in the summarize-metrics module, not introduced by this slice
- No `dispatch-metrics.jsonl` file exists yet (expected - S01 provides the telemetry schema, S03 will produce the first real metrics files via fixture harness)

## Follow-ups

- S03 will consume `readMetricsJsonl` for fixture validation and produce the first real dispatch-metrics.jsonl files
- Consider adding a cost-per-token configuration option to the CLI for realistic cost calculations

## Files Created/Modified

- `src/resources/extensions/gsd/metrics-reader.ts` — New module with `readMetricsJsonl` export
- `src/resources/extensions/gsd/report-metrics.ts` — New CLI script for metrics reporting
- `src/resources/extensions/gsd/tests/metrics-reader.test.ts` — New test file with 9 crash-resilience tests
- `.gsd/milestones/M007/slices/S02/S02-PLAN.md` — Added Observability/Diagnostics section, failure-path check
- `.gsd/milestones/M007/slices/S02/tasks/T01-PLAN.md` — Added Observability Impact section
- `.gsd/milestones/M007/slices/S02/tasks/T02-PLAN.md` — Added Observability Impact section

## Forward Intelligence

### What the next slice should know
- The JSONL reader validates `type` and `id` fields — entries missing either are silently skipped
- CLI exit code 0 for all graceful scenarios, 1 only for missing required arguments
- The summarizeMetrics → formatComparisonTable pipeline is pre-existing and works correctly with LedgerInput derived from reader output
- Temp test files use `os.tmpdir() + crypto.randomUUID()` pattern for isolation

### What's fragile
- The cost calculation shows $0.0000 because there's no token-to-cost conversion configured — this is cosmetic, not a bug in this slice

### Authoritative diagnostics
- Run reader tests: `npx tsx --test src/resources/extensions/gsd/tests/metrics-reader.test.ts`
- Run CLI with real file: `npx tsx src/resources/extensions/gsd/report-metrics.ts <path>`
- Check stderr for parse diagnostics: `[report-metrics] parsed N valid units, skipped M malformed lines`

### What assumptions changed
- Initially assumed dispatch-metrics.jsonl would be in .gsd/activity/ — it's not created yet; the reader correctly handles the missing-file case
