// GSD-2 — Regression test for #3615: unstructured "continue" must inject task context

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isLowEntropyResumePrompt } from "../bootstrap/system-context.ts";

describe("#3615 — RESUME_INTENT_PATTERNS behavior", () => {
  const shouldMatch = [
    "continue",
    "Continue",
    "CONTINUE",
    "continue.",
    "continue!",
    "resume",
    "ok",
    "OK",
    "Ok!",
    "go",
    "go ahead",
    "Go ahead.",
    "proceed",
    "keep going",
    "carry on",
    "next",
    "yes",
    "yeah",
    "yep",
    "sure",
    "do it",
    "let's go",
    "pick up where you left off",
    "  continue  ",
  ];

  const shouldNotMatch = [
    "help",
    "status",
    "/gsd auto",
    "/gsd stats",
    "what's the plan?",
    "show me the logs",
    "abort",
    "stop",
    "cancel",
    "replan this slice",
    "I think we should change the approach",
    "can you explain what you just did?",
    "run the tests",
    "check the build",
    "Execute the next task: T01",
    "what files were changed",
    "",
  ];

  for (const prompt of shouldMatch) {
    test(`matches resume prompt: "${prompt}"`, () => {
      assert.equal(isLowEntropyResumePrompt(prompt), true);
    });
  }

  for (const prompt of shouldNotMatch) {
    test(`rejects non-resume prompt: "${prompt}"`, () => {
      assert.equal(isLowEntropyResumePrompt(prompt), false);
    });
  }
});
