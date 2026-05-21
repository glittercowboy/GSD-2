// Project/App: GSD-2
// File Purpose: Behavior tests for deleted-cwd fallback handling.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerDbTools } from "../bootstrap/db-tools.ts";
import { registerDynamicTools, ensureDbOpen, safeWorkspaceCwd } from "../bootstrap/dynamic-tools.ts";
import { registerExecTools } from "../bootstrap/exec-tools.ts";
import { registerJournalTools } from "../bootstrap/journal-tools.ts";
import { registerMemoryTools } from "../bootstrap/memory-tools.ts";
import { registerQueryTools } from "../bootstrap/query-tools.ts";

async function withDeletedCwd(fn: (projectRoot: string) => Promise<void> | void): Promise<void> {
  const previousCwd = process.cwd();
  const previousProjectRoot = process.env.GSD_PROJECT_ROOT;
  const projectRoot = mkdtempSync(join(tmpdir(), "gsd-safe-cwd-project-"));
  const removedCwd = mkdtempSync(join(tmpdir(), "gsd-removed-cwd-"));

  process.env.GSD_PROJECT_ROOT = projectRoot;
  process.chdir(removedCwd);
  rmSync(removedCwd, { recursive: true, force: true });

  try {
    assert.throws(() => process.cwd(), /ENOENT/);
    await fn(projectRoot);
  } finally {
    process.chdir(previousCwd);
    if (previousProjectRoot === undefined) delete process.env.GSD_PROJECT_ROOT;
    else process.env.GSD_PROJECT_ROOT = previousProjectRoot;
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function collectTools(register: (pi: any) => void): any[] {
  const tools: any[] = [];
  register({
    registerTool(tool: any) {
      tools.push(tool);
    },
  });
  return tools;
}

test("safeWorkspaceCwd falls back to captured project root when cwd was removed", async () => {
  await withDeletedCwd((projectRoot) => {
    assert.equal(safeWorkspaceCwd(), projectRoot);
  });
});

test("ensureDbOpen default path does not throw when cwd was removed", async () => {
  await withDeletedCwd(async () => {
    assert.equal(await ensureDbOpen(), false);
  });
});

test("dynamic tools register when cwd was removed", async () => {
  await withDeletedCwd(() => {
    const tools = collectTools(registerDynamicTools);
    assert.equal(tools.length, 4);
  });
});

test("db-backed tool fallbacks return normal unavailable-db errors when cwd was removed", async () => {
  await withDeletedCwd(async () => {
    const tools = collectTools(registerDbTools);
    const decisionSave = tools.find((tool) => tool.name === "gsd_decision_save");

    const result = await decisionSave.execute(
      "call-1",
      {
        scope: "test",
        decision: "Handle deleted cwd",
        choice: "Use captured project root",
        rationale: "The worktree cwd may disappear during cleanup.",
      },
      undefined,
      undefined,
      undefined,
    );

    assert.equal(result.details.error, "db_unavailable");
  });
});

test("memory and query tools do not throw when cwd was removed", async () => {
  await withDeletedCwd(async () => {
    const memoryTools = collectTools(registerMemoryTools);
    const queryTools = collectTools(registerQueryTools);

    await assert.doesNotReject(() =>
      memoryTools.find((tool) => tool.name === "memory_query").execute(
        "call-1",
        { query: "cwd fallback" },
        undefined,
        undefined,
        undefined,
      ),
    );
    await assert.doesNotReject(() =>
      queryTools.find((tool) => tool.name === "gsd_milestone_status").execute(
        "call-2",
        { milestoneId: "M001" },
        undefined,
        undefined,
        undefined,
      ),
    );
  });
});

test("journal and exec tools do not throw when cwd was removed", async () => {
  await withDeletedCwd(async () => {
    const journalTools = collectTools(registerJournalTools);
    const execTools = collectTools(registerExecTools);

    await assert.doesNotReject(() =>
      journalTools.find((tool) => tool.name === "gsd_journal_query").execute(
        "call-1",
        { limit: 1 },
        undefined,
        undefined,
        undefined,
      ),
    );
    await assert.doesNotReject(() =>
      execTools.find((tool) => tool.name === "gsd_resume").execute(
        "call-2",
        {},
        undefined,
        undefined,
        undefined,
      ),
    );
  });
});
