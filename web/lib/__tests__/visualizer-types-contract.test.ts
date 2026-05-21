// GSD-2 Web — Tests for browser visualizer data helpers and current payload shape.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getCaptureStatusCounts,
  type VisualizerData,
} from "../visualizer-types.ts";

function makeVisualizerData(overrides: Partial<VisualizerData> = {}): VisualizerData {
  return {
    milestones: [],
    phase: "executing",
    totals: null,
    byPhase: [],
    bySlice: [],
    byModel: [],
    byTier: [],
    tierSavingsLine: "",
    units: [],
    criticalPath: {
      milestonePath: [],
      slicePath: [],
      milestoneSlack: {},
      sliceSlack: {},
    },
    remainingSliceCount: 0,
    agentActivity: null,
    changelog: { entries: [] },
    sliceVerifications: [],
    knowledge: { rules: [], patterns: [], lessons: [], exists: false },
    captures: { entries: [], pendingCount: 0, totalCount: 0 },
    health: {
      budgetCeiling: undefined,
      tokenProfile: "standard",
      truncationRate: 0,
      continueHereRate: 0,
      tierBreakdown: [],
      tierSavingsLine: "",
      toolCalls: 0,
      assistantMessages: 0,
      userMessages: 0,
      providers: [],
      skillSummary: { total: 0, warningCount: 0, criticalCount: 0, topIssue: null },
      environmentIssues: [],
    },
    discussion: [],
    stats: {
      missingCount: 0,
      missingSlices: [],
      updatedCount: 0,
      updatedSlices: [],
      recentEntries: [],
    },
    ...overrides,
  };
}

describe("visualizer browser payload contract", () => {
  test("accepts the recent visualizer additions used by the browser view", () => {
    const data = makeVisualizerData({
      byTier: [
        {
          tier: "light",
          units: 2,
          tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
          cost: 0.02,
          downgraded: 1,
        },
      ],
      tierSavingsLine: "Dynamic routing: 1/2 units downgraded",
      sliceVerifications: [
        {
          milestoneId: "M001",
          sliceId: "S01",
          verificationResult: "passed",
          blockerDiscovered: false,
          keyDecisions: ["Keep browser data browser-safe"],
          patternsEstablished: ["Mirror terminal visualizer tabs"],
          provides: ["visualizer-contract"],
          requires: [],
        },
      ],
      knowledge: {
        exists: true,
        rules: [{ id: "K001", scope: "web", content: "Keep UI parity with terminal data." }],
        patterns: [],
        lessons: [],
      },
      captures: {
        pendingCount: 1,
        totalCount: 3,
        entries: [
          { id: "CAP-1", text: "Needs follow-up", timestamp: "2026-05-11T12:00:00Z", status: "pending" },
          { id: "CAP-2", text: "Triaged", timestamp: "2026-05-11T12:01:00Z", status: "triaged" },
          { id: "CAP-3", text: "Done", timestamp: "2026-05-11T12:02:00Z", status: "resolved" },
        ],
      },
      health: {
        budgetCeiling: 10,
        tokenProfile: "standard",
        truncationRate: 5,
        continueHereRate: 0,
        tierBreakdown: [],
        tierSavingsLine: "",
        toolCalls: 4,
        assistantMessages: 3,
        userMessages: 2,
        providers: [],
        skillSummary: { total: 1, warningCount: 0, criticalCount: 0, topIssue: null },
        environmentIssues: [],
        doctorHistory: [],
        progressScore: { level: "green", summary: "healthy", signals: [] },
      },
      discussion: [
        {
          milestoneId: "M001",
          title: "Visualizer",
          state: "discussed",
          hasContext: true,
          hasDraft: false,
          lastUpdated: "2026-05-11T12:00:00Z",
        },
      ],
      stats: {
        missingCount: 1,
        missingSlices: [{ milestoneId: "M001", sliceId: "S02", title: "Remaining work" }],
        updatedCount: 1,
        updatedSlices: [{ milestoneId: "M001", sliceId: "S01", title: "Browser parity", completedAt: "2026-05-11T12:00:00Z" }],
        recentEntries: [],
      },
    });

    assert.equal(data.byTier[0]?.downgraded, 1);
    assert.equal(data.health.progressScore?.level, "green");
    assert.equal(data.knowledge.rules[0]?.scope, "web");
    assert.equal(data.discussion[0]?.state, "discussed");
  });

  test("counts empty and populated capture states without relying on totals", () => {
    assert.deepEqual(
      getCaptureStatusCounts({ entries: [], pendingCount: 0, totalCount: 0 }),
      { pending: 0, triaged: 0, resolved: 0 },
    );

    assert.deepEqual(
      getCaptureStatusCounts({
        pendingCount: 1,
        totalCount: 4,
        entries: [
          { id: "CAP-1", text: "One", timestamp: "2026-05-11T12:00:00Z", status: "pending" },
          { id: "CAP-2", text: "Two", timestamp: "2026-05-11T12:01:00Z", status: "triaged" },
          { id: "CAP-3", text: "Three", timestamp: "2026-05-11T12:02:00Z", status: "resolved" },
          { id: "CAP-4", text: "Four", timestamp: "2026-05-11T12:03:00Z", status: "resolved" },
        ],
      }),
      { pending: 1, triaged: 1, resolved: 2 },
    );
  });
});
