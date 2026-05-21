// Project/App: GSD-2
// File Purpose: Regression tests for user-facing milestone lease conflict notices.

import test from "node:test";
import assert from "node:assert/strict";

import { formatLeaseConflictNotice } from "../auto/lease-conflict-notice.ts";

test("lease conflict notice explains the retry action before worker details", () => {
  const message = formatLeaseConflictNotice({
    milestoneId: "M012",
    unitType: "run-uat",
    unitId: "M012/S01",
    reason: "Milestone M012 is held by worker auto-Jeremys-MacBook-Pro-9.local-34036-ee4ef385 until 2026-05-20T18:58:59.275Z.",
    now: new Date("2026-05-20T18:58:14.275Z"),
  });

  const lines = message.split("\n");
  assert.match(lines[0] ?? "", /^Blocked: M012 is already active in another GSD worker\./);
  assert.match(lines[0] ?? "", /Retry with \/gsd auto/);
  assert.match(lines[0] ?? "", /about 45s/);
  assert.equal(lines[1], "Waiting unit: run-uat M012/S01.");
  assert.equal(lines[2], "Details: held by auto-Jeremys-MacBook-Pro-9.local-34036-ee4ef385.");
  assert.doesNotMatch(lines[0] ?? "", /auto-Jeremys/);
});

test("lease conflict notice keeps unknown reasons as details", () => {
  const message = formatLeaseConflictNotice({
    milestoneId: "M012",
    unitType: "run-uat",
    unitId: "M012/S01",
    reason: "stale_lease",
  });

  assert.match(message, /^Blocked: M012 is already active in another GSD worker\./);
  assert.match(message, /Try \/gsd status/);
  assert.match(message, /Details: stale_lease/);
});
