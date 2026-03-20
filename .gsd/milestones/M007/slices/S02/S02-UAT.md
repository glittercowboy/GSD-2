# S02: Metrics Aggregation & Reporting — UAT

**Milestone:** M007
**Written:** 2026-03-19

## UAT Type

- UAT mode: **artifact-driven**
- Why this mode is sufficient: This slice produces a CLI tool that parses files and outputs tables. Verification is achieved through unit tests and CLI smoke tests - no live runtime required since the downstream consumers (S03 fixture harness) don't exist yet.

## Preconditions

- Node.js and TypeScript environment available
- `npx tsx` command works
- No special server or data seeding required

## Smoke Test

```bash
npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent.jsonl
# Expected: exits 0, prints "_File not found: /nonexistent.jsonl_" and "_No metrics to compare._"
```

## Test Cases

### 1. Valid JSONL file parsing

1. Create a temp file `/tmp/test-valid.jsonl` with:
   ```json
   {"type":"unit","id":"test-1","startTime":1000,"endTime":2000,"duration":1000,"tokens":{"prompt":100,"completion":50,"total":150},"interventions":{"userOverrides":0,"agentRollbacks":0},"factCheck":{"claimsChecked":0,"refuted":0}}
   {"type":"unit","id":"test-2","startTime":2000,"endTime":3500,"duration":1500,"tokens":{"prompt":200,"completion":100,"total":300},"interventions":{"userOverrides":1,"agentRollbacks":2},"factCheck":{"claimsChecked":5,"refuted":1}}
   ```
2. Run: `npx tsx src/resources/extensions/gsd/report-metrics.ts /tmp/test-valid.jsonl`
3. **Expected:** Markdown table printed to stdout with 2 units, 450 total tokens, exit code 0

### 2. Empty file handling

1. Create empty temp file: `touch /tmp/empty.jsonl`
2. Run: `npx tsx src/resources/extensions/gsd/report-metrics.ts /tmp/empty.jsonl`
3. **Expected:** Prints `_No metrics found in /tmp/empty.jsonl_` and `_No metrics to compare._`, exit code 0

### 3. Malformed line resilience

1. Create file with mixed content:
   ```
   {"type":"unit","id":"ok-1",...valid JSON...}
   this is not json
   {"type":"unit","id":"ok-2",...valid JSON...}
   ```
2. Run: `npx tsx src/resources/extensions/gsd/report-metrics.ts <file>`
3. **Expected:** stderr shows `skipped 1 malformed lines`, table shows 2 valid units

### 4. Missing required fields

1. Create file with valid JSON but missing `id`:
   ```json
   {"type":"unit","startTime":1000,...}
   ```
2. Run reader on it
3. **Expected:** Entry skipped, counted in skippedLines

### 5. Nonexistent file graceful handling

1. Run: `npx tsx src/resources/extensions/gsd/report-metrics.ts /definitely/does/not/exist.jsonl`
2. **Expected:** Prints `_File not found: /definitely/does/not/exist.jsonl_`, exit code 0 (not 1)

### 6. Multi-file comparison

1. Create two JSONL files with different metrics
2. Run: `npx tsx src/resources/extensions/gsd/report-metrics.ts file1.jsonl file2.jsonl`
3. **Expected:** Single table with columns for each file

## Edge Cases

### Truncated JSON (simulates crash mid-write)

1. Create file with partial line: `{"type":"unit","id":"incomplete","startTime":1000,`
2. Run reader
3. **Expected:** Line skipped, returns empty or partial valid results

### Whitespace-only file

1. Create file with newlines and spaces only
2. Run: `echo "   \n\n  " > /tmp/whitespace.jsonl`
3. **Expected:** No crash, returns empty array gracefully

## Failure Signals

- Exit code 1 from CLI (indicates programming error, not graceful handling)
- Uncaught exceptions in stderr
- Test failures in `npx tsx --test src/resources/extensions/gsd/tests/metrics-reader.test.ts`

## Not Proven By This UAT

- Live integration with S01's telemetry capture (no dispatch-metrics.jsonl exists yet)
- S03 fixture harness consumption of the reader
- Performance under very large JSONL files (>10MB)

## Notes for Tester

- The cost column showing $0.0000 is expected (no token-price config)
- The NaN in intervention/duration means is a pre-existing issue in summarize-metrics, not this slice
- All tests use `npx tsx --test` because Node's native test runner doesn't handle the extension's internal `.js` imports in `.ts` files
