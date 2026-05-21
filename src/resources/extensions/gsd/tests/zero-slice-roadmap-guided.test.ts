// GSD-2 — Guided roadmap slice detection regression tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { _roadmapHasParseableSlicesForTest } from "../guided-flow.ts";

test("guided flow treats placeholder roadmaps with zero slices as not runnable", () => {
  assert.equal(
    _roadmapHasParseableSlicesForTest("# M001 Roadmap\n\nPlanning notes only.\n"),
    false,
  );
});

test("guided flow accepts roadmaps with parseable slices", () => {
  assert.equal(
    _roadmapHasParseableSlicesForTest([
      "# M001 Roadmap",
      "",
      "## Slices",
      "- [ ] **S01: First slice** `risk:low` `depends:[]`",
    ].join("\n")),
    true,
  );
});
