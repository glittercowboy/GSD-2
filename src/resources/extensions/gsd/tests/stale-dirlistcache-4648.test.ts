/**
 * GSD-2 / agent-end-recovery — regression tests for #4648.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleAgentEnd } from "../bootstrap/agent-end-recovery.ts";
import { resolveMilestoneFile, clearPathCache } from "../paths.ts";

function mkBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-4648-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  return base;
}

describe("#4648 stale dirListCache", () => {
  test("resolveMilestoneFile returns stale null until clearPathCache runs", () => {
    const base = mkBase();
    try {
      clearPathCache();
      assert.equal(resolveMilestoneFile(base, "M001", "CONTEXT"), null);

      writeFileSync(
        join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
        "# M001 Context\n",
      );

      assert.equal(resolveMilestoneFile(base, "M001", "CONTEXT"), null);
      clearPathCache();
      assert.match(resolveMilestoneFile(base, "M001", "CONTEXT") ?? "", /M001-CONTEXT\.md$/);
    } finally {
      clearPathCache();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("handleAgentEnd invalidates the path cache before recovery guards read artifacts", async () => {
    const base = mkBase();
    const previousCwd = process.cwd();
    try {
      process.chdir(base);
      clearPathCache();
      assert.equal(resolveMilestoneFile(base, "M001", "CONTEXT"), null);

      writeFileSync(
        join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
        "# M001 Context\n",
      );

      await handleAgentEnd({} as any, { messages: [] }, {
        ui: { notify: () => {} },
      } as any);

      assert.match(resolveMilestoneFile(base, "M001", "CONTEXT") ?? "", /M001-CONTEXT\.md$/);
    } finally {
      process.chdir(previousCwd);
      clearPathCache();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
