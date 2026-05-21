// Project/App: GSD-2
// File Purpose: Regression tests for auto-unit closeout activity classification.

import test from "node:test";
import assert from "node:assert/strict";

import {
  isSuspiciousGhostCompletion,
  snapshotUnitActivity,
} from "../auto-unit-closeout.ts";

function makeCtx(entries: unknown[]) {
  return {
    sessionManager: {
      getEntries: () => entries,
    },
  } as any;
}

test("isSuspiciousGhostCompletion rejects fast completions with no assistant output or tools", () => {
  const startedAt = Date.now();
  const ctx = makeCtx([]);

  assert.equal(isSuspiciousGhostCompletion(ctx, startedAt, 500), true);
});

test("isSuspiciousGhostCompletion allows fast completions with assistant output", () => {
  const startedAt = Date.now();
  const ctx = makeCtx([
    {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done." }],
      },
    },
  ]);

  assert.equal(isSuspiciousGhostCompletion(ctx, startedAt, 500), false);
});

test("snapshotUnitActivity counts assistant messages and tool calls", () => {
  const ctx = makeCtx([
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Working." },
          { type: "toolCall", name: "read_file" },
        ],
      },
    },
    {
      type: "message",
      message: {
        role: "user",
        content: "continue",
      },
    },
  ]);

  assert.deepEqual(snapshotUnitActivity(ctx, 1_000, 1_250), {
    elapsedMs: 250,
    toolCalls: 1,
    assistantMessages: 1,
  });
});
