import test from "node:test";
import assert from "node:assert/strict";
import { classifyProviderError } from "../provider-error-pause.ts";

// ── Rate limit detection ─────────────────────────────────────────────────────

test("classifyProviderError detects rate limit from 429", () => {
  const result = classifyProviderError("HTTP 429 Too Many Requests");
  assert.ok(result.isTransient);
  assert.ok(result.isRateLimit);
  assert.ok(result.suggestedDelayMs > 0);
});

test("classifyProviderError detects rate limit from message", () => {
  const result = classifyProviderError("rate limit exceeded");
  assert.ok(result.isTransient);
  assert.ok(result.isRateLimit);
});

test("classifyProviderError extracts reset delay from message", () => {
  const result = classifyProviderError("rate limit exceeded, reset in 45s");
  assert.equal(result.suggestedDelayMs, 45000);
});

test("classifyProviderError defaults to 60s for rate limit without reset", () => {
  const result = classifyProviderError("too many requests");
  assert.equal(result.suggestedDelayMs, 60000);
});

// ── Server error detection ───────────────────────────────────────────────────

test("classifyProviderError detects Anthropic internal server error", () => {
  const msg = '{"type":"error","error":{"details":null,"type":"api_error","message":"Internal server error"}}';
  const result = classifyProviderError(msg);
  assert.ok(result.isTransient, "should be transient");
  assert.ok(!result.isRateLimit, "should not be rate limit");
  assert.equal(result.suggestedDelayMs, 30000, "should suggest 30s delay");
});

test("classifyProviderError detects overloaded error", () => {
  const result = classifyProviderError("overloaded_error: Overloaded");
  assert.ok(result.isTransient);
  assert.equal(result.suggestedDelayMs, 30000);
});

test("classifyProviderError detects 503 service unavailable", () => {
  const result = classifyProviderError("503 Service Unavailable");
  assert.ok(result.isTransient);
});

test("classifyProviderError detects 502 bad gateway", () => {
  const result = classifyProviderError("502 Bad Gateway");
  assert.ok(result.isTransient);
});

// ── Permanent error detection ────────────────────────────────────────────────

test("classifyProviderError detects auth error as permanent", () => {
  const result = classifyProviderError("unauthorized: invalid API key");
  assert.ok(!result.isTransient);
  assert.ok(!result.isRateLimit);
  assert.equal(result.suggestedDelayMs, 0);
});

test("classifyProviderError detects billing error as permanent", () => {
  const result = classifyProviderError("billing issue: payment required");
  assert.ok(!result.isTransient);
});

test("classifyProviderError detects quota exceeded as permanent", () => {
  const result = classifyProviderError("quota exceeded for this account");
  assert.ok(!result.isTransient);
});

// ── Unknown errors ───────────────────────────────────────────────────────────

test("classifyProviderError treats unknown error as permanent", () => {
  const result = classifyProviderError("something went wrong");
  assert.ok(!result.isTransient);
  assert.equal(result.suggestedDelayMs, 0);
});

test("classifyProviderError treats empty string as permanent", () => {
  const result = classifyProviderError("");
  assert.ok(!result.isTransient);
});

// ── Edge: rate limit + auth (rate limit wins) ────────────────────────────────

test("classifyProviderError: rate limit takes precedence over auth keywords", () => {
  // Edge case: "rate limit" in message that also mentions auth
  const result = classifyProviderError("rate limit on auth endpoint");
  assert.ok(result.isTransient);
  assert.ok(result.isRateLimit);
});
