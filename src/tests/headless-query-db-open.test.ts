/**
 * Regression test for #4123: headless-query must open the project DB
 * before deriveState(), otherwise it falls back to filesystem parsing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runHeadlessQuery } from "../headless-query.ts";

test("headless-query opens the DB before deriveState (#4123)", async () => {
  const calls: string[] = [];
  let output = "";

  const result = await runHeadlessQuery(
    "/tmp/project",
    {
      openProjectDbIfPresent: async (basePath: string) => {
        calls.push(`open:${basePath}`);
      },
      deriveState: async (basePath: string) => {
        calls.push(`derive:${basePath}`);
        return {
          phase: "complete",
          nextAction: "done",
          activeMilestone: undefined,
        };
      },
      resolveDispatch: async () => {
        throw new Error("resolveDispatch should not run without an active milestone");
      },
      readAllSessionStatuses: () => {
        calls.push("statuses");
        return [{ milestoneId: "M001", pid: 123, state: "running", cost: 1.25, lastHeartbeat: 10 }];
      },
      loadEffectiveGSDPreferences: () => ({ preferences: {} }),
    } as any,
    (text) => {
      output += text;
    },
  );

  assert.deepEqual(calls, ["open:/tmp/project", "derive:/tmp/project", "statuses"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.data?.cost.total, 1.25);
  assert.equal(JSON.parse(output).cost.total, 1.25);
});
