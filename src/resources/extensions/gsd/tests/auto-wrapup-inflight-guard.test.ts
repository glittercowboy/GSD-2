// GSD-2 — Regression tests for #3512: gsd-auto-wrapup mid-turn interruption
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { autoSession } from "../auto-runtime-state.ts";
import { dispatchHookUnit } from "../auto.ts";
import { registerHooks } from "../bootstrap/register-hooks.ts";
import { clearDiscussionFlowState, getPendingGate } from "../bootstrap/write-gate.ts";

function makeHookHarness() {
  const handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const current = handlers.get(name) ?? [];
      current.push(handler);
      handlers.set(name, current);
    },
  };
  const ctx = {
    ui: {
      notify: () => {},
      setStatus: () => {},
      setWidget: () => {},
    },
    modelRegistry: {
      setDisabledModelProviders: () => {},
    },
    setCompactionThresholdOverride: () => {},
  };
  async function emit(name: string, event: any): Promise<any> {
    for (const handler of handlers.get(name) ?? []) {
      const result = await handler(event, ctx);
      if (result?.block) return result;
    }
    return undefined;
  }
  registerHooks(pi as any, []);
  return { emit };
}

describe("hook dispatch session workspace root", () => {
  test("dispatchHookUnit passes basePath explicitly to newSession", async (t) => {
    const originalCwd = process.cwd();
    const basePath = mkdtempSync(join(tmpdir(), "gsd-hook-cwd-"));
    mkdirSync(join(basePath, ".gsd"), { recursive: true });
    autoSession.reset();
    t.after(() => {
      try {
        process.chdir(originalCwd);
      } catch {
        // best effort cleanup after cwd-sensitive dispatch tests
      }
      autoSession.reset();
      rmSync(basePath, { recursive: true, force: true });
    });

    let newSessionOptions: unknown;
    const ctx = {
      ui: {
        notify: () => {},
        setStatus: () => {},
        setWidget: () => {},
      },
      modelRegistry: {
        getAvailable: () => [],
      },
      sessionManager: {
        getSessionFile: () => join(basePath, "session.jsonl"),
      },
      newSession: async (options?: unknown) => {
        newSessionOptions = options;
        return { cancelled: false };
      },
    };
    const pi = {
      sendMessage: () => {},
      setModel: async () => true,
    };

    const dispatched = await dispatchHookUnit(
      ctx as any,
      pi as any,
      "review",
      "execute-task",
      "M001/S01/T01",
      "review the completed unit",
      undefined,
      basePath,
    );

    assert.equal(dispatched, true);
    assert.deepEqual(newSessionOptions, { workspaceRoot: basePath });
  });
});

describe("deep setup approval questions pause immediately", () => {
  test("plain-text approval boundary defers durable gate until same-turn CONTEXT-DRAFT can save", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-deferred-approval-")));
    const previousCwd = process.cwd();
    try {
      mkdirSync(join(base, ".gsd", "milestones", "M003"), { recursive: true });
      process.chdir(base);
      clearDiscussionFlowState(base);
      autoSession.reset();
      autoSession.basePath = base;
      autoSession.currentUnit = {
        type: "discuss-milestone",
        id: "M003",
        startedAt: Date.now(),
      };

      const { emit } = makeHookHarness();
      await emit("message_update", {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Did I capture that correctly? If not, tell me what I missed." }],
        },
      });

      assert.equal(
        getPendingGate(base),
        null,
        "approval text should not install the durable pending gate until the assistant turn ends",
      );

      const draftResult = await emit("tool_call", {
        toolCallId: "draft-save",
        toolName: "gsd_summary_save",
        input: {
          milestone_id: "M003",
          artifact_type: "CONTEXT-DRAFT",
          content: "# M003 Draft\n",
        },
      });
      assert.equal(
        draftResult?.block,
        undefined,
        "same-turn CONTEXT-DRAFT persistence should remain allowed after the approval text streams",
      );

      const finalContextResult = await emit("tool_call", {
        toolCallId: "final-context",
        toolName: "gsd_summary_save",
        input: {
          milestone_id: "M003",
          artifact_type: "CONTEXT",
          content: "# M003 Context\n",
        },
      });
      assert.equal(finalContextResult?.block, true, "final CONTEXT must still wait for approval");
      assert.match(finalContextResult.reason, /Approval question "depth_verification_M003_confirm"/);

      await emit("agent_end", { messages: [] });
      assert.equal(
        getPendingGate(base),
        "depth_verification_M003_confirm",
        "agent_end should activate the durable pending gate for the next turn",
      );
    } finally {
      process.chdir(previousCwd);
      autoSession.reset();
      clearDiscussionFlowState(base);
      rmSync(base, { recursive: true, force: true });
    }
  });
});
