/**
 * Tests for GSD metrics aggregation logic.
 * Tests the pure functions — no file I/O, no extension context.
 */

import {
  type UnitMetrics,
  type TokenCounts,
  classifyUnitPhase,
  aggregateByPhase,
  aggregateBySlice,
  aggregateByModel,
  getProjectTotals,
  formatCost,
  formatTokenCount,
} from "../metrics.js";
import { createTestContext } from './test-helpers.ts';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<UnitMetrics> = {}): UnitMetrics {
  return {
    type: "execute-task",
    id: "M001/S01/T01",
    model: "claude-sonnet-4-20250514",
    startedAt: 1000,
    finishedAt: 2000,
    tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 },
    cost: 0.05,
    toolCalls: 3,
    assistantMessages: 2,
    userMessages: 1,
    ...overrides,
  };
}

const { assertEq, assertTrue, report } = createTestContext();

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  assertTrue(Math.abs(actual - expected) <= tolerance, `${message} — expected ~${expected}, got ${actual}`);
}

// ─── Phase classification ─────────────────────────────────────────────────────

console.log("\n=== classifyUnitPhase ===");

assertEq(classifyUnitPhase("research-milestone"), "research", "research-milestone → research");
assertEq(classifyUnitPhase("research-slice"), "research", "research-slice → research");
assertEq(classifyUnitPhase("plan-milestone"), "planning", "plan-milestone → planning");
assertEq(classifyUnitPhase("plan-slice"), "planning", "plan-slice → planning");
assertEq(classifyUnitPhase("execute-task"), "execution", "execute-task → execution");
assertEq(classifyUnitPhase("complete-slice"), "completion", "complete-slice → completion");
assertEq(classifyUnitPhase("reassess-roadmap"), "reassessment", "reassess-roadmap → reassessment");
assertEq(classifyUnitPhase("unknown-thing"), "execution", "unknown → execution (fallback)");

// ─── getProjectTotals ─────────────────────────────────────────────────────────

console.log("\n=== getProjectTotals ===");

{
  const units = [
    makeUnit({ tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 }, cost: 0.05, toolCalls: 3, startedAt: 1000, finishedAt: 2000 }),
    makeUnit({ tokens: { input: 2000, output: 1000, cacheRead: 400, cacheWrite: 200, total: 3600 }, cost: 0.10, toolCalls: 5, startedAt: 2000, finishedAt: 4000 }),
  ];
  const totals = getProjectTotals(units);

  assertEq(totals.units, 2, "total units");
  assertEq(totals.tokens.input, 3000, "total input tokens");
  assertEq(totals.tokens.output, 1500, "total output tokens");
  assertEq(totals.tokens.cacheRead, 600, "total cacheRead");
  assertEq(totals.tokens.cacheWrite, 300, "total cacheWrite");
  assertEq(totals.tokens.total, 5400, "total tokens");
  assertClose(totals.cost, 0.15, 0.001, "total cost");
  assertEq(totals.toolCalls, 8, "total tool calls");
  assertEq(totals.duration, 3000, "total duration");
}

{
  const totals = getProjectTotals([]);
  assertEq(totals.units, 0, "empty: zero units");
  assertEq(totals.cost, 0, "empty: zero cost");
  assertEq(totals.tokens.total, 0, "empty: zero tokens");
}

// ─── aggregateByPhase ─────────────────────────────────────────────────────────

console.log("\n=== aggregateByPhase ===");

{
  const units = [
    makeUnit({ type: "research-milestone", cost: 0.02 }),
    makeUnit({ type: "research-slice", cost: 0.03 }),
    makeUnit({ type: "plan-milestone", cost: 0.01 }),
    makeUnit({ type: "plan-slice", cost: 0.02 }),
    makeUnit({ type: "execute-task", cost: 0.10 }),
    makeUnit({ type: "execute-task", cost: 0.08 }),
    makeUnit({ type: "complete-slice", cost: 0.01 }),
    makeUnit({ type: "reassess-roadmap", cost: 0.005 }),
  ];
  const phases = aggregateByPhase(units);

  assertEq(phases.length, 5, "5 phases");
  assertEq(phases[0].phase, "research", "first phase is research");
  assertEq(phases[0].units, 2, "2 research units");
  assertClose(phases[0].cost, 0.05, 0.001, "research cost");

  assertEq(phases[1].phase, "planning", "second phase is planning");
  assertEq(phases[1].units, 2, "2 planning units");

  assertEq(phases[2].phase, "execution", "third phase is execution");
  assertEq(phases[2].units, 2, "2 execution units");
  assertClose(phases[2].cost, 0.18, 0.001, "execution cost");

  assertEq(phases[3].phase, "completion", "fourth phase is completion");
  assertEq(phases[4].phase, "reassessment", "fifth phase is reassessment");
}

// ─── aggregateBySlice ─────────────────────────────────────────────────────────

console.log("\n=== aggregateBySlice ===");

{
  const units = [
    makeUnit({ id: "M001/S01/T01", cost: 0.05 }),
    makeUnit({ id: "M001/S01/T02", cost: 0.04 }),
    makeUnit({ id: "M001/S02/T01", cost: 0.10 }),
    makeUnit({ id: "M001", type: "research-milestone", cost: 0.02 }),
  ];
  const slices = aggregateBySlice(units);

  assertEq(slices.length, 3, "3 slice groups");

  const s01 = slices.find(s => s.sliceId === "M001/S01");
  assertTrue(!!s01, "M001/S01 exists");
  assertEq(s01!.units, 2, "M001/S01 has 2 units");
  assertClose(s01!.cost, 0.09, 0.001, "M001/S01 cost");

  const s02 = slices.find(s => s.sliceId === "M001/S02");
  assertTrue(!!s02, "M001/S02 exists");
  assertEq(s02!.units, 1, "M001/S02 has 1 unit");

  const mLevel = slices.find(s => s.sliceId === "M001");
  assertTrue(!!mLevel, "M001 (milestone-level) exists");
}

// ─── aggregateByModel ─────────────────────────────────────────────────────────

console.log("\n=== aggregateByModel ===");

{
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.05 }),
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.04 }),
    makeUnit({ model: "claude-opus-4-20250514", cost: 0.30 }),
  ];
  const models = aggregateByModel(units);

  assertEq(models.length, 2, "2 models");
  // Sorted by cost desc — opus should be first
  assertEq(models[0].model, "claude-opus-4-20250514", "opus first (higher cost)");
  assertClose(models[0].cost, 0.30, 0.001, "opus cost");
  assertEq(models[1].model, "claude-sonnet-4-20250514", "sonnet second");
  assertEq(models[1].units, 2, "sonnet has 2 units");
}

// ─── formatCost ───────────────────────────────────────────────────────────────

console.log("\n=== formatCost ===");

assertEq(formatCost(0), "$0.0000", "zero cost");
assertEq(formatCost(0.001), "$0.0010", "sub-cent cost");
assertEq(formatCost(0.05), "$0.050", "5 cents");
assertEq(formatCost(1.50), "$1.50", "dollar+");
assertEq(formatCost(14.20), "$14.20", "double digits");

// ─── formatTokenCount ─────────────────────────────────────────────────────────

console.log("\n=== formatTokenCount ===");

assertEq(formatTokenCount(0), "0", "zero tokens");
assertEq(formatTokenCount(500), "500", "sub-k");
assertEq(formatTokenCount(1500), "1.5k", "1.5k");
assertEq(formatTokenCount(150000), "150.0k", "150k");
assertEq(formatTokenCount(1500000), "1.50M", "1.5M");

// ─── Summary ──────────────────────────────────────────────────────────────────

report();
