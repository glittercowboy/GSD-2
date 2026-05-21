/**
 * error-success-mask.test.ts — #3664
 *
 * Verify that the agent-end-recovery error handler detects when errorMessage
 * is uninformative (e.g. "success", "ok", "unknown") and falls back to
 * extracting the real error from the assistant message text content.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveAgentEndErrorDisplay } from "../bootstrap/agent-end-recovery.ts";

describe("error-success mask detection (#3664)", () => {
  test("falls back to assistant text when errorMessage is uninformative", () => {
    assert.equal(
      resolveAgentEndErrorDisplay("success", [
        { type: "tool_use", name: "noop" },
        { type: "text", text: "provider failed with a useful message" },
      ]),
      "provider failed with a useful message",
    );
  });

  test("keeps informative raw error messages", () => {
    assert.equal(
      resolveAgentEndErrorDisplay("rate limit exceeded", [
        { type: "text", text: "prose should not replace useful raw error" },
      ]),
      "rate limit exceeded",
    );
  });
});
