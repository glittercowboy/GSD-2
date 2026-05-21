/**
 * /gsd show-config command behavior tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { GSDConfigOverlay, formatConfigText } from "../config-overlay.ts";
import { handleCoreCommand } from "../commands/handlers/core.ts";

const theme = {
  bold: (s: string) => s,
  fg: (_name: string, s: string) => s,
};

test("GSDConfigOverlay renders and responds to input", () => {
  let renderRequests = 0;
  let closed = false;
  const overlay = new GSDConfigOverlay(
    { requestRender: () => { renderRequests++; } },
    theme as any,
    () => { closed = true; },
  );

  const lines = overlay.render(60);
  assert.ok(lines.some((line) => line.includes("GSD Configuration")));

  overlay.handleInput("j");
  assert.equal(renderRequests, 1);

  overlay.handleInput("q");
  assert.equal(closed, true);
});

test("formatConfigText provides a text fallback", () => {
  const text = formatConfigText();
  assert.match(text, /GSD Configuration/);
  assert.match(text, /SOURCES/);
});

test("core handler routes show-config to overlay with text fallback", async () => {
  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    ui: {
      custom: async () => undefined,
      notify: (message: string, level: string) => {
        notifications.push({ message, level });
      },
    },
  };

  const handled = await handleCoreCommand("show-config", ctx as any);

  assert.equal(handled, true);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.level, "info");
  assert.match(notifications[0]?.message ?? "", /GSD Configuration/);
});
