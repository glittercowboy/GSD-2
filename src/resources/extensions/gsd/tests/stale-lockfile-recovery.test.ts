/**
 * stale-lockfile-recovery.test.ts — #3668.
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { acquireSessionLock, releaseSessionLock } from "../session-lock.ts";

let tempBase: string | null = null;

afterEach(() => {
  if (tempBase) {
    releaseSessionLock(tempBase);
    rmSync(tempBase, { recursive: true, force: true });
  }
  tempBase = null;
});

describe("stale lockfile auto-recovery (#3668)", () => {
  test("acquireSessionLock removes an orphan proper-lockfile directory before acquiring", () => {
    tempBase = mkdtempSync(join(tmpdir(), "gsd-stale-lock-"));
    const gsdDir = join(tempBase, ".gsd");
    mkdirSync(join(gsdDir, "auto.lock.lock"), { recursive: true });
    writeFileSync(
      join(gsdDir, "auto.lock"),
      JSON.stringify({
        pid: 999_999_999,
        startedAt: new Date().toISOString(),
        unitType: "execute-task",
        unitId: "M001/S01/T01",
        unitStartedAt: new Date().toISOString(),
      }),
      "utf-8",
    );

    const result = acquireSessionLock(tempBase);

    assert.equal(result.acquired, true);
    assert.equal(existsSync(join(gsdDir, "auto.lock.lock")), true, "new active lock directory is present");
  });
});
