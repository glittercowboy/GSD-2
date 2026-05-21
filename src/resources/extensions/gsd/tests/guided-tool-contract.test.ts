// GSD-2 — Guided Unit Tool Contract tests.
// Verifies guided workflow turns use manifest tool policy without auto-mode state.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerHooks } from "../bootstrap/register-hooks.ts";
import {
  clearGuidedUnitContext,
  getGuidedUnitContext,
  setGuidedUnitContext,
} from "../guided-unit-context.ts";

test("guided Unit context applies Tool Contract policy when auto-mode has no current Unit", async () => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-guided-tool-contract-"));
  const handlers = new Map<string, Array<(event: any, ctx?: any) => Promise<any> | any>>();
  const pi = {
    on(event: string, handler: (event: any, ctx?: any) => Promise<any> | any) {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
  };

  try {
    clearGuidedUnitContext();
    registerHooks(pi as any, []);
    setGuidedUnitContext(basePath, "plan-slice");

    let blockResult: { block?: boolean; reason?: string } | undefined;
    for (const handler of handlers.get("tool_call") ?? []) {
      const result = await handler({
        toolName: "edit",
        input: {
          path: join(basePath, "src", "main.ts"),
        },
      }, { cwd: basePath });
      if (result?.block) {
        blockResult = result;
        break;
      }
    }

    assert.equal(blockResult?.block, true);
    assert.match(blockResult?.reason ?? "", /plan-slice|ToolsPolicy|not allowed|blocked/i);
  } finally {
    clearGuidedUnitContext();
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("guided Unit context can be cleared by project root", () => {
  clearGuidedUnitContext();
  setGuidedUnitContext("/project/a", "plan-slice");
  setGuidedUnitContext("/project/b", "complete-slice");

  clearGuidedUnitContext("/project/a");

  assert.equal(getGuidedUnitContext("/project/a"), null);
  assert.equal(getGuidedUnitContext("/project/b")?.unitType, "complete-slice");
  clearGuidedUnitContext();
});
