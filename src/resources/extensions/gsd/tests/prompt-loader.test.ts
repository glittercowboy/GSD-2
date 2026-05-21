import test from "node:test";
import assert from "node:assert/strict";

import { loadPrompt } from "../prompt-loader.ts";

test("loadPrompt reports missing template variables with balanced braces", () => {
  assert.throws(
    () => loadPrompt("guided-discuss-milestone", {
      milestoneId: "M001",
      milestoneTitle: "Missing working directory",
      structuredQuestionsAvailable: "false",
      fastPathInstruction: "",
      inlinedTemplates: "context template",
      commitInstruction: "Do not commit during this test.",
    }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /template declares \{\{workingDirectory\}\} but no value was provided/);
      assert.doesNotMatch(error.message, /\{\{workingDirectory\}\}\}/);
      return true;
    },
  );
});
