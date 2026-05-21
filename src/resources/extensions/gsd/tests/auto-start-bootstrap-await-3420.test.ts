/**
 * auto-start-bootstrap-await-3420.test.ts — Regression test for #3420.
 *
 * The discussion handoff is asynchronous: bootstrap queues a discuss turn and
 * releases the lock; checkAutoStartAfterDiscuss is responsible for re-entry
 * once artifacts exist.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  checkAutoStartAfterDiscuss,
  clearPendingAutoStart,
  setPendingAutoStart,
} from "../guided-flow.ts";

test.afterEach(() => {
  clearPendingAutoStart();
});

test("checkAutoStartAfterDiscuss waits until discussion artifacts exist before re-entering auto-mode", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-bootstrap-await-"));
  const notifications: string[] = [];
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  setPendingAutoStart(base, {
    basePath: base,
    milestoneId: "M001",
    ctx: { ui: { notify: (message: string) => notifications.push(message) } } as any,
    pi: { sendMessage: () => {} } as any,
  });

  assert.equal(checkAutoStartAfterDiscuss(), false);
  assert.deepEqual(notifications, []);

  writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"), "# Context\n", "utf-8");
  writeFileSync(join(base, ".gsd", "STATE.md"), "# State\n", "utf-8");

  assert.equal(checkAutoStartAfterDiscuss(), true);
  assert.deepEqual(notifications, ["Milestone M001 ready."]);
});
