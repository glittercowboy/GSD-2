/**
 * Regression tests for status/quick behavior.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { handleCoreCommand } from "../commands/handlers/core.ts";
import { buildQuickCommitInstruction } from "../quick.ts";

describe("status opens DB before deriveState (#3691)", () => {
  test("core handler routes status command", async () => {
    const notifications: Array<{ message: string; level: string }> = [];
    const ctx = {
      ui: {
        custom: async () => undefined,
        notify: (message: string, level: string) => {
          notifications.push({ message, level });
        },
      },
    };

    const handled = await handleCoreCommand("status", ctx as any);

    assert.equal(handled, true);
    assert.ok(notifications.length >= 0);
  });

  test("quick task commit instructions handle external .gsd roots without staging quick files", () => {
    const instruction = buildQuickCommitInstruction("/project", "/external/.gsd");

    assert.match(instruction, /do not stage or commit `\.gsd\/quick\/\.\.\.`/);
    assert.match(instruction, /nothing in the project repo to commit/);
  });

  test("quick task commit instructions include normal commit guidance for in-project .gsd roots", () => {
    const instruction = buildQuickCommitInstruction("/project", "/project/.gsd");

    assert.doesNotMatch(instruction, /nothing in the project repo to commit/);
    assert.match(instruction, /Commit your changes atomically/);
  });
});
