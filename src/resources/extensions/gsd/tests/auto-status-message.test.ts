// Project/App: GSD-2
// File Purpose: Visual contract tests for compact GSD status notification cards.

import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";

import {
  formatConnectedStepStack,
  formatPostUnitStatusCard,
} from "../auto-status-message.ts";

test("formatPostUnitStatusCard wraps verification metadata in a compact card", () => {
  const message = formatPostUnitStatusCard("✓ Verification Gate", "2/2 checks passed");
  const plain = stripVTControlCharacters(message);

  assert.match(message, /\x1b\[/);
  assert.match(plain, /^    ╭─ ✓ Verification Gate/m);
  assert.match(plain, /^       2\/2 checks passed/m);
  assert.match(plain, /^    ╰/m);
  assert.doesNotMatch(plain, /^          ╭─/m);
  assert.doesNotMatch(plain, /│/);
});

test("formatConnectedStepStack renders task completion as a compact receipt", () => {
  const message = formatConnectedStepStack(
    "✓ GSD Task Complete",
    "executing M011/S03/T01",
  );
  const plain = stripVTControlCharacters(message);

  assert.match(message, /\x1b\[/);
  assert.doesNotMatch(plain.split("\n")[0] ?? "", /╰────╮/);
  assert.match(plain, /^    ╭─ ✓ GSD Task Complete/m);
  assert.match(plain, /^       Completed: executing M011\/S03\/T01/m);
  assert.match(plain, /^    ╰/m);
  assert.doesNotMatch(plain, /^    ╰────╮/m);
  assert.doesNotMatch(plain, /^    ╭─ Next step/m);
  assert.doesNotMatch(plain, /Next: Execute T02: Build tag filter nav/);
  assert.doesNotMatch(plain, /Continue: \/gsd next/);
  assert.doesNotMatch(plain, /Auto-run: \/gsd auto/);
  assert.doesNotMatch(plain, /\/gsd next/);
  assert.doesNotMatch(plain, /\/gsd auto/);
  assert.doesNotMatch(plain, /^          ╭─/m);
  assert.doesNotMatch(plain, /│/);
});
