/**
 * Tests for GSD metrics disk I/O — init, snapshot, load/save cycle.
 * Uses a temp directory to avoid touching real .gsd/ state.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initMetrics,
  resetMetrics,
  getLedger,
  snapshotUnitMetrics,
  type MetricsLedger,
} from "../metrics.js";
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();
// ─── Setup ────────────────────────────────────────────────────────────────────

const tmpBase = mkdtempSync(join(tmpdir(), "gsd-metrics-test-"));
mkdirSync(join(tmpBase, ".gsd"), { recursive: true });

// Mock ExtensionContext with session entries
function mockCtx(messages: any[] = []): any {
  const entries = messages.map((msg, i) => ({
    type: "message",
    id: `entry-${i}`,
    parentId: i > 0 ? `entry-${i - 1}` : null,
    timestamp: new Date().toISOString(),
    message: msg,
  }));
  return {
    sessionManager: {
      getEntries: () => entries,
    },
    model: { id: "claude-sonnet-4-20250514" },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n=== initMetrics / getLedger ===");

{
  resetMetrics();
  assertTrue(getLedger() === null, "ledger null before init");

  initMetrics(tmpBase);
  const ledger = getLedger();
  assertTrue(ledger !== null, "ledger not null after init");
  assertEq(ledger!.version, 1, "version is 1");
  assertEq(ledger!.units.length, 0, "no units initially");
}

console.log("\n=== snapshotUnitMetrics ===");

{
  resetMetrics();
  initMetrics(tmpBase);

  // Simulate a session with assistant messages containing usage data
  const ctx = mockCtx([
    { role: "user", content: "Do the thing" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I'll do the thing" },
        { type: "tool_call", id: "tc1", name: "bash", input: {} },
      ],
      usage: {
        input: 5000,
        output: 2000,
        cacheRead: 3000,
        cacheWrite: 500,
        totalTokens: 10500,
        cost: { input: 0.015, output: 0.03, cacheRead: 0.003, cacheWrite: 0.002, total: 0.05 },
      },
    },
    { role: "toolResult", toolCallId: "tc1", content: [{ type: "text", text: "ok" }] },
    {
      role: "assistant",
      content: [{ type: "text", text: "Done!" }],
      usage: {
        input: 8000,
        output: 1000,
        cacheRead: 6000,
        cacheWrite: 200,
        totalTokens: 15200,
        cost: { input: 0.024, output: 0.015, cacheRead: 0.006, cacheWrite: 0.001, total: 0.046 },
      },
    },
  ]);

  const unit = snapshotUnitMetrics(ctx, "execute-task", "M001/S01/T01", Date.now() - 5000, "claude-sonnet-4-20250514");

  assertTrue(unit !== null, "unit returned");
  assertEq(unit!.type, "execute-task", "type");
  assertEq(unit!.id, "M001/S01/T01", "id");
  assertEq(unit!.tokens.input, 13000, "input tokens (5000+8000)");
  assertEq(unit!.tokens.output, 3000, "output tokens (2000+1000)");
  assertEq(unit!.tokens.cacheRead, 9000, "cacheRead (3000+6000)");
  assertEq(unit!.tokens.total, 25700, "total tokens (10500+15200)");
  assertTrue(Math.abs(unit!.cost - 0.096) < 0.001, `cost ~0.096 (got ${unit!.cost})`);
  assertEq(unit!.toolCalls, 1, "1 tool call");
  assertEq(unit!.assistantMessages, 2, "2 assistant messages");
  assertEq(unit!.userMessages, 1, "1 user message");

  // Verify ledger persisted
  const ledger = getLedger()!;
  assertEq(ledger.units.length, 1, "1 unit in ledger");
}

console.log("\n=== Persistence across init/reset cycles ===");

{
  // Reset and re-init — should load from disk
  resetMetrics();
  initMetrics(tmpBase);

  const ledger = getLedger()!;
  assertEq(ledger.units.length, 1, "unit survived reset+init");
  assertEq(ledger.units[0].id, "M001/S01/T01", "correct unit ID");

  // Add another unit
  const ctx = mockCtx([
    {
      role: "assistant",
      content: [{ type: "text", text: "Research complete" }],
      usage: {
        input: 3000, output: 1500, cacheRead: 1000, cacheWrite: 300, totalTokens: 5800,
        cost: { input: 0.009, output: 0.023, cacheRead: 0.001, cacheWrite: 0.001, total: 0.034 },
      },
    },
  ]);

  snapshotUnitMetrics(ctx, "research-slice", "M001/S02", Date.now() - 3000, "claude-sonnet-4-20250514");

  // Verify both units persisted
  resetMetrics();
  initMetrics(tmpBase);
  const final = getLedger()!;
  assertEq(final.units.length, 2, "2 units after second snapshot");
}

console.log("\n=== File content verification ===");

{
  const raw = readFileSync(join(tmpBase, ".gsd", "metrics.json"), "utf-8");
  const parsed: MetricsLedger = JSON.parse(raw);
  assertEq(parsed.version, 1, "file version is 1");
  assertEq(parsed.units.length, 2, "file has 2 units");
  assertTrue(parsed.projectStartedAt > 0, "projectStartedAt is set");
}

console.log("\n=== Empty session handling ===");

{
  resetMetrics();
  initMetrics(tmpBase);

  // Empty session — no messages
  const ctx = mockCtx([]);
  const unit = snapshotUnitMetrics(ctx, "plan-slice", "M001/S01", Date.now(), "test-model");
  assertTrue(unit === null, "returns null for empty session");

  // Ledger shouldn't have grown
  assertEq(getLedger()!.units.length, 2, "still 2 units (empty session not added)");
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

resetMetrics();
rmSync(tmpBase, { recursive: true, force: true });

report();
