import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveProjectRootDbPath } from "../bootstrap/dynamic-tools.ts";

test("#3822: worktree bootstrap resolves the project-root DB path", (t) => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "gsd-project-db-")));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const worktree = join(project, ".gsd", "worktrees", "M001");
  mkdirSync(worktree, { recursive: true });

  assert.equal(
    resolveProjectRootDbPath(worktree),
    join(project, ".gsd", "gsd.db"),
  );
});
