import test from "node:test";
import assert from "node:assert/strict";

import {
  clearSessionModelOverride,
  getSessionModelOverride,
  setSessionModelOverride,
} from "../session-model-override.js";

test("setSessionModelOverride stores provider/model for the session", () => {
  const sessionId = `session-override-${Date.now()}`;
  setSessionModelOverride(sessionId, { provider: "openai-codex", id: "gpt-5.4" });

  const override = getSessionModelOverride(sessionId);
  assert.equal(override?.provider, "openai-codex");
  assert.equal(override?.id, "gpt-5.4");
});

test("clearSessionModelOverride removes the session override", () => {
  const sessionId = `session-clear-${Date.now()}`;
  setSessionModelOverride(sessionId, { provider: "anthropic", id: "claude-sonnet-4-6" });
  clearSessionModelOverride(sessionId);
  assert.equal(getSessionModelOverride(sessionId), undefined);
});

test("session model overrides are isolated by session id", () => {
  const first = `session-first-${Date.now()}`;
  const second = `session-second-${Date.now()}`;
  setSessionModelOverride(first, { provider: "openai-codex", id: "gpt-5.4" });
  setSessionModelOverride(second, { provider: "anthropic", id: "claude-sonnet-4-6" });

  assert.deepEqual(getSessionModelOverride(first), {
    provider: "openai-codex",
    id: "gpt-5.4",
  });
  assert.deepEqual(getSessionModelOverride(second), {
    provider: "anthropic",
    id: "claude-sonnet-4-6",
  });
});
