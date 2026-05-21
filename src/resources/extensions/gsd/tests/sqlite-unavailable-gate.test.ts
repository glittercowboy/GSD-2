// GSD-2 — SQLite unavailable bootstrap gate regression tests.

import test from "node:test";
import assert from "node:assert/strict";

import { _shouldAbortBootstrapForUnavailableDbForTest } from "../auto-start.ts";

test("bootstrap abort gate trips when DB exists but SQLite remains unavailable", () => {
  const dbPath = "/repo/.gsd/gsd.db";
  const exists = (path: string) => path === dbPath;

  assert.equal(
    _shouldAbortBootstrapForUnavailableDbForTest(dbPath, false, exists),
    true,
  );
});

test("bootstrap abort gate stays open when DB is available or absent", () => {
  const dbPath = "/repo/.gsd/gsd.db";

  assert.equal(
    _shouldAbortBootstrapForUnavailableDbForTest(dbPath, true, () => true),
    false,
  );
  assert.equal(
    _shouldAbortBootstrapForUnavailableDbForTest(dbPath, false, () => false),
    false,
  );
});
