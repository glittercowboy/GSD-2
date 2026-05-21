/**
 * Regression test for #3692 — normalizeListParam in complete-task
 *
 * Agents sometimes pass keyFiles/keyDecisions as comma-separated strings
 * instead of arrays.  normalizeListParam coerces both forms to string[].
 *
 * Also verifies roadmap-slices.ts detects dependency column from header.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListParam } from "../tools/complete-task.ts";
import { parseRoadmapSlices } from "../roadmap-slices.ts";

describe('complete-task normalizeListParam (#3692)', () => {
  test('normalizes newline-delimited key file strings', () => {
    assert.deepEqual(
      normalizeListParam("- src/app.ts\n* tests/app.test.ts\n  docs/notes.md"),
      ["src/app.ts", "tests/app.test.ts", "docs/notes.md"],
    );
  });

  test('normalizes arrays and empty values', () => {
    assert.deepEqual(normalizeListParam(["api", 42]), ["api", "42"]);
    assert.deepEqual(normalizeListParam("   "), []);
    assert.deepEqual(normalizeListParam(undefined), []);
  });
});

describe('roadmap-slices depColumnIndex detection (#3692)', () => {
  test('parses dependencies from the dependency table column only', () => {
    const slices = parseRoadmapSlices([
      "## Slices",
      "| ID | Title | Risk | Depends | Status |",
      "| -- | ----- | ---- | ------- | ------ |",
      "| S01 | Foundation | low | none | Done |",
      "| S02 | Title mentions S01 but no dependency | medium | none | Pending |",
      "| S03 | Integration | high | S01, S02 | Pending |",
    ].join("\n"));

    assert.deepEqual(
      slices.map((slice) => ({ id: slice.id, depends: slice.depends })),
      [
        { id: "S01", depends: [] },
        { id: "S02", depends: [] },
        { id: "S03", depends: ["S01", "S02"] },
      ],
    );
  });
});
