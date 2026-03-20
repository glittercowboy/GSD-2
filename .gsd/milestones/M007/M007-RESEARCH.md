# M007: Telemetry, Metrics, and Experiment Fixtures — Research

## Summary

This milestone establishes the observation surface required for evidence-grounded performance comparisons. The primary architectural need is a passive, high-fidelity metrics capture system that hooks into the GSD dispatch loop without introducing significant runtime overhead or distortion. We will implement token counters, interaction trackers, and fact-check measurement points, then serialize these into durable JSONL schemas in `.gsd/activity/`. Finally, we will build a Fixture Harness (building on M007-aos64t's work) to enable repeatable, controlled runs.

## Recommendation

Implement a passive metrics collector using existing `metrics.js` infrastructure as the integration layer. Focus on "Telemetry as Code" — metrics must be part of the unit runtime record, allowing us to reconstruct session-level performance. Ensure telemetry writing happens in a non-blocking `write-behind` manner to satisfy the technical constraint "should not introduce enough overhead to distort the runs."

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/metrics.js` — The centralized metrics ledger. Needs expansion to support the new telemetry schema (tokens, interventions, fact-check metrics).
- `src/resources/extensions/gsd/auto-dispatch.ts` — The control loop. Every dispatch event must trigger a metrics snapshot, capturing the state of the system *before* the unit starts and after it finishes.
- `src/resources/extensions/gsd/unit-runtime.js` — Currently tracks execution records; needs to include telemetry data points (token/cost) for cross-referencing.
- `src/resources/extensions/gsd/experiment-runner.ts` — New module. Needs to handle fixture loading (environment restoration) to ensure experiment runs start from a stable baseline.

### Build Order

1. **Metrics Schema Definition**: Define the metrics data structure (JSONL schema) to guarantee the telemetry captures all specified fields (token, intervention, fact-check, wall-clock).
2. **Dispatch Hooking**: Integrate snapshot triggers into `auto-dispatch` loop stages (start/end).
3. **Write Path**: Implement safe serialization to `.gsd/activity/` with conflict-free naming.
4. **Fixture Fixture Harness**: Build the experiment runner capable of restoring a fixture to the runtime state.

### Verification Approach

- **Telemetry Integrity**: Verify that a sequence of 3 units produces 3 metric completion records.
- **Fixture Replay**: Execute a known fixture twice; compare metrics outputs for equivalence.
- **Distortion Measurement**: Use the `debug-logger` timestamps to verify that snapshotting does not add >5ms to a dispatch unit's execution.

## Common Pitfalls

- **Instrumentation Bloom**: Adding too much detail to the metrics schema will bloat context windows when the data is read back during experiment analysis. Keep the schema flat and concise.
- **Double-Counting**: Snapshotting at both auto-dispatch and session-end may lead to overlapping records. Standardize on the auto-dispatch loop as the single source of truth for cadence.

## Open Risks

- **Fixture State Bloat**: If fixtures require the entire project state, the repository size might become unmanageable. We should rely on `git-worktree` snapshots (as developed in M003) for fixture isolation.

## Sources

- [Telemetry Schema Definition (Internal)](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/telemetry-standards.md) (source: [Telemetry Standards])
