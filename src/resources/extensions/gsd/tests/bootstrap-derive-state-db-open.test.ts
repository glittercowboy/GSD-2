import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureDbOpen } from "../bootstrap/dynamic-tools.ts";
import { closeDatabase, isDbAvailable } from "../gsd-db.ts";

afterEach(() => {
  if (isDbAvailable()) closeDatabase();
});

describe("bootstrap deriveState DB guards (#3844)", () => {
  test("ensureDbOpen creates and opens the project DB when .gsd exists", async (t) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-ensure-db-")));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    mkdirSync(join(base, ".gsd"), { recursive: true });

    assert.equal(await ensureDbOpen(base), true);
    assert.equal(isDbAvailable(), true);
  });
});
