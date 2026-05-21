/**
 * Tests that /gsd quick is blocked when auto-mode is active.
 *
 * Relates to #2417: /gsd quick freezes terminal when auto-mode is active.
 * The fix adds an isAutoActive() guard in handleWorkflowCommand before
 * delegating to handleQuick.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { _setAutoActiveForTest } from "../auto.ts";
import { handleWorkflowCommand } from "../commands/handlers/workflow.ts";

describe("/gsd quick auto-mode guard (#2417)", () => {
  it("returns handled and notifies when auto-mode is active", async () => {
    const notifications: Array<{ message: string; level?: string }> = [];
    _setAutoActiveForTest(true);
    try {
      const handled = await handleWorkflowCommand("quick fix the docs", {
        ui: {
          notify(message: string, level?: string) {
            notifications.push({ message, level });
          },
        },
      } as any, {} as any);

      assert.equal(handled, true);
      assert.deepEqual(notifications, [{
        message: "/gsd quick cannot run while auto-mode is active.\nStop auto-mode first with /gsd stop, then run /gsd quick.",
        level: "error",
      }]);
    } finally {
      _setAutoActiveForTest(false);
    }
  });
});
