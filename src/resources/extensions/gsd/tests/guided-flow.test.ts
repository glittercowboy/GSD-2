import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("guided milestone discussion callsites pass workingDirectory to loadPrompt", () => {
  const source = readFileSync(join(__dirname, "..", "guided-flow.ts"), "utf-8");
  const calls = [...source.matchAll(/loadPrompt\("guided-discuss-milestone",\s*\{([\s\S]*?)\}\)/g)];

  assert.equal(calls.length, 6, "all guided-flow guided-discuss-milestone callsites should be covered");
  for (const call of calls) {
    assert.match(
      call[1] ?? "",
      /\bworkingDirectory:\s*basePath\b/,
      "guided-discuss-milestone prompts need workingDirectory so template validation does not crash",
    );
  }
});
