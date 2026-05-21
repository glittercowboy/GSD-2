import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { selectAndApplyModel } from "../auto-model-selection.ts";

test("selectAndApplyModel restores captured thinking level after model selection", async (t) => {
  const originalCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), "gsd-thinking-restore-"));
  const thinkingLevels: unknown[] = [];
  t.after(() => {
    process.chdir(originalCwd);
    rmSync(base, { recursive: true, force: true });
  });
  mkdirSync(join(base, ".gsd"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    ["---", "models:", "  planning: anthropic/claude-sonnet-4-6", "---"].join("\n"),
    "utf-8",
  );
  process.chdir(base);

  const result = await selectAndApplyModel(
    {
      modelRegistry: { getAvailable: () => [{ id: "claude-sonnet-4-6", provider: "anthropic", api: "anthropic-messages" }] },
      sessionManager: { getSessionId: () => "thinking-test" },
      ui: { notify: () => {} },
      model: { provider: "anthropic", id: "claude-sonnet-4-6", api: "anthropic-messages" },
    } as any,
    {
      setModel: async () => true,
      setThinkingLevel: (level: unknown) => { thinkingLevels.push(level); },
      emitBeforeModelSelect: async () => undefined,
      getActiveTools: () => [],
      emitAdjustToolSet: async () => undefined,
      setActiveTools: () => {},
    } as any,
    "plan-slice",
    "M001/S01",
    base,
    undefined,
    false,
    { provider: "anthropic", id: "claude-sonnet-4-6" },
    undefined,
    true,
    undefined,
    { effort: "medium" } as any,
  );

  assert.equal(result.appliedModel?.provider, "anthropic");
  assert.deepEqual(thinkingLevels, [{ effort: "medium" }]);
});
