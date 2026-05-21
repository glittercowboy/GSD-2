// GSD-2 + /gsd brief command behavior tests

import test from "node:test";
import assert from "node:assert/strict";

import { GSD_COMMAND_DESCRIPTION, getGsdArgumentCompletions } from "../commands/catalog.ts";
import { handleCoreCommand, showHelp } from "../commands/handlers/core.ts";
import { VISUAL_BRIEF_USAGE } from "../../visual-brief/prompts.ts";

function createMockCtx() {
  const notifications: { message: string; level: string }[] = [];
  return {
    notifications,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      custom: async () => undefined,
    },
  };
}

function createMockPi() {
  const sentMessages: string[] = [];
  return {
    sentMessages,
    sendUserMessage(content: string) {
      sentMessages.push(content);
    },
  };
}

test("/gsd brief appears in the command description and top-level completions", () => {
  assert.match(GSD_COMMAND_DESCRIPTION, /brief/);

  const completions = getGsdArgumentCompletions("br");
  const entry = completions.find((completion) => completion.value === "brief");

  assert.ok(entry, "brief should appear in top-level completions");
  assert.match(entry.description, /visual HTML brief/i);
});

test("/gsd brief exposes Visual Brief mode completions", () => {
  const completions = getGsdArgumentCompletions("brief d");

  assert.ok(
    completions.some((completion) => completion.value === "brief diagram"),
    "diagram should be suggested as a /gsd brief mode",
  );
  assert.ok(
    getGsdArgumentCompletions("brief ").some((completion) => completion.value === "brief diff"),
    "diff should be suggested after /gsd brief",
  );
});

test("/gsd brief sends a Visual Brief prompt for valid args", async () => {
  const ctx = createMockCtx();
  const pi = createMockPi();

  const handled = await handleCoreCommand("brief diagram extension loading lifecycle", ctx as any, pi as any);

  assert.equal(handled, true);
  assert.equal(ctx.notifications.length, 0);
  assert.equal(pi.sentMessages.length, 1);
  assert.match(pi.sentMessages[0], /Mode: diagram/);
  assert.match(pi.sentMessages[0], /Subject: extension loading lifecycle/);
  assert.match(pi.sentMessages[0], /Output directory:/);
});

test("/gsd brief reports usage for empty args instead of sending a prompt", async () => {
  const ctx = createMockCtx();
  const pi = createMockPi();

  const handled = await handleCoreCommand("brief", ctx as any, pi as any);

  assert.equal(handled, true);
  assert.equal(pi.sentMessages.length, 0);
  assert.deepEqual(ctx.notifications, [{ message: VISUAL_BRIEF_USAGE, level: "info" }]);
});

test("/gsd help full lists brief separately from visualize", () => {
  const ctx = createMockCtx();

  showHelp(ctx as any, "full");

  const help = ctx.notifications.at(0)?.message ?? "";
  assert.match(help, /\/gsd visualize\s+Interactive 10-tab TUI/);
  assert.match(help, /\/gsd brief <mode>\s+Generate a visual HTML brief/);
});
