// Project/App: GSD-2
// File Purpose: Dispatcher regression tests for validation-blocked milestones.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { handleGSDCommand } from "../commands/dispatcher.ts";
import {
  closeDatabase,
  insertAssessment,
  insertMilestone,
  insertSlice,
  openDatabase,
} from "../gsd-db.ts";
import { invalidateStateCache } from "../state.ts";

interface NotifyCall {
  message: string;
  kind: string;
}

interface SentMessage {
  customType: string;
  content: string;
  display: boolean;
}

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), `gsd-dispatch-block-${randomUUID()}-`));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* swallow */ }
}

function makeMockCtx(base: string): {
  ctx: any;
  calls: NotifyCall[];
  widgets: Array<[string, unknown]>;
  statuses: Array<[string, string | undefined]>;
} {
  const calls: NotifyCall[] = [];
  const widgets: Array<[string, unknown]> = [];
  const statuses: Array<[string, string | undefined]> = [];
  return {
    ctx: {
      cwd: base,
      ui: {
        notify: (message: string, kind: string) => {
          calls.push({ message, kind });
        },
        setWidget: (key: string, value: unknown) => {
          widgets.push([key, value]);
        },
        setStatus: (key: string, value: string | undefined) => {
          statuses.push([key, value]);
        },
      },
    },
    calls,
    widgets,
    statuses,
  };
}

function makeMockPi(): { pi: any; messages: SentMessage[] } {
  const messages: SentMessage[] = [];
  return {
    pi: {
      sendMessage: (message: SentMessage) => {
        messages.push(message);
      },
    },
    messages,
  };
}

function seedValidationBlockedMilestone(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M006", title: "Mark All Complete", status: "active" });
  insertSlice({
    id: "S01",
    milestoneId: "M006",
    title: "Done Slice",
    status: "complete",
    risk: "low",
    depends: [],
  });
  insertAssessment({
    path: "milestones/M006/M006-VALIDATION.md",
    milestoneId: "M006",
    status: "needs-attention",
    scope: "milestone-validation",
    fullContent: "verdict: needs-attention",
  });
  invalidateStateCache();
}

test("dispatcher blocks bare /gsd while milestone validation needs attention", async () => {
  const base = makeBase();
  try {
    seedValidationBlockedMilestone(base);
    const { ctx, calls, widgets, statuses } = makeMockCtx(base);
    const { pi, messages } = makeMockPi();

    await handleGSDCommand("", ctx, pi);

    assert.equal(calls.length, 0);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].customType, "gsd-command-block");
    assert.equal(messages[0].display, true);
    assert.match(messages[0].content, /\/gsd cannot run/);
    assert.match(messages[0].content, /\/gsd validate-milestone/);
    assert.match(messages[0].content, /\/gsd verdict pass --rationale/);
    assert.ok(widgets.some(([key, value]) => key === "gsd-outcome" && value === undefined));
    assert.ok(widgets.some(([key, value]) => key === "gsd-progress" && value === undefined));
    assert.ok(statuses.some(([key, value]) => key === "gsd-step" && value === undefined));
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});

test("dispatcher blocks workflow-advancing aliases while validation is blocked", async () => {
  const blockedCommands = [
    "next",
    "auto",
    "do mark all complete",
    "dispatch complete",
    "workflow resume",
  ];

  for (const command of blockedCommands) {
    const base = makeBase();
    try {
      seedValidationBlockedMilestone(base);
      const { ctx, calls } = makeMockCtx(base);
      const { pi, messages } = makeMockPi();

      await handleGSDCommand(command, ctx, pi);

      assert.equal(calls.length, 0, command);
      assert.equal(messages.length, 1, command);
      assert.equal(messages[0].display, true, command);
      assert.match(messages[0].content, new RegExp(`/gsd ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} cannot run`), command);
    } finally {
      closeDatabase();
      invalidateStateCache();
      cleanup(base);
    }
  }
});

test("dispatcher still allows recovery commands while validation is blocked", async () => {
  const base = makeBase();
  try {
    seedValidationBlockedMilestone(base);
    const { ctx, calls } = makeMockCtx(base);

    await handleGSDCommand("help", ctx, {} as any);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "info");
    assert.match(calls[0].message, /GSD/);
    assert.doesNotMatch(calls[0].message, /cannot run/);
  } finally {
    closeDatabase();
    invalidateStateCache();
    cleanup(base);
  }
});
