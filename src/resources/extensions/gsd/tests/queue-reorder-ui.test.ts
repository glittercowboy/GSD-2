import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { showQueueReorder } from "../queue-reorder-ui.ts";

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

describe("queue-reorder-ui", () => {
  test("keeps cursor visible while scrolling long queue with arrow keys (#4656)", async () => {
    const originalRowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");
    Object.defineProperty(process.stdout, "rows", { value: 20, configurable: true });

    try {
      const pending = Array.from({ length: 20 }, (_, idx) => ({
        id: `M${String(idx + 1).padStart(3, "0")}`,
        title: `Milestone ${idx + 1}`,
      }));

      let resolved: { order: string[]; depsToRemove: Array<{ milestone: string; dep: string }> } | null = null;
      let lastRender: string[] = [];

      const ctx = {
        hasUI: true,
        ui: {
          custom: async (factory: any) => {
            const component = factory({ requestRender() {} }, fakeTheme, null, (value: any) => {
              resolved = value;
            });

            for (let i = 0; i < 15; i++) component.handleInput("\u001b[B");
            lastRender = component.render(100);
            component.handleInput("\r");
            return resolved;
          },
        },
      } as any;

      await showQueueReorder(ctx, [], pending);

      const joined = lastRender.join("\n");
      assert.ok(joined.includes("M016"), "selected item should stay visible after scrolling");
      assert.ok(lastRender.length <= 16, `overlay should fit terminal max-height, got ${lastRender.length}`);
    } finally {
      if (originalRowsDescriptor) {
        Object.defineProperty(process.stdout, "rows", originalRowsDescriptor);
      } else {
        delete (process.stdout as { rows?: number }).rows;
      }
    }
  });
});
