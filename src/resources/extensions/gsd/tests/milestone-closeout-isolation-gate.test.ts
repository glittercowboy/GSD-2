import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const autoPath = join(__dirname, "..", "auto.ts");

test("complete-milestone branch-mode merge gate is explicit branch isolation only", () => {
  const src = readFileSync(autoPath, "utf-8");

  assert.match(
    src,
    /else if \(currentMilestoneId && getIsolationMode\(\) === "branch"\)/,
    "branch-mode closeout path should only activate when isolation mode is explicitly branch",
  );

  assert.ok(
    !src.includes('else if (currentMilestoneId && !isInAutoWorktree(basePath) && getIsolationMode() !== "none")'),
    "branch-mode closeout path should not be a fallback for failed worktree detection",
  );
});
