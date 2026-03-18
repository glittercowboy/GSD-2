import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load the native addon directly
const addonDir = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "native",
  "addon",
);
const platformTag = `${process.platform}-${process.arch}`;
const candidates = [
  path.join(addonDir, `gsd_engine.${platformTag}.node`),
  path.join(addonDir, "gsd_engine.dev.node"),
];

let native;
for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // try next
  }
}

if (!native) {
  console.error(
    "Native addon not found. Run `npm run build:native -w @gsd/native` first.",
  );
  process.exit(1);
}

// ── normalizeForFuzzyMatch ──────────────────────────────────────────────

describe("normalizeForFuzzyMatch", () => {
  test("strips trailing whitespace per line", () => {
    assert.equal(native.normalizeForFuzzyMatch("hello   \nworld  "), "hello\nworld");
  });

  test("normalizes smart quotes to ASCII", () => {
    assert.equal(
      native.normalizeForFuzzyMatch("\u201Chello\u201D \u2018world\u2019"),
      '"hello" \'world\'',
    );
  });

  test("normalizes dashes to ASCII hyphen", () => {
    assert.equal(native.normalizeForFuzzyMatch("a\u2013b\u2014c"), "a-b-c");
  });

  test("normalizes special spaces to regular space", () => {
    assert.equal(native.normalizeForFuzzyMatch("a\u00A0b\u3000c"), "a b c");
  });

  test("handles empty string", () => {
    assert.equal(native.normalizeForFuzzyMatch(""), "");
  });

  test("preserves leading whitespace", () => {
    assert.equal(native.normalizeForFuzzyMatch("  hello  "), "  hello");
  });
});

// ── fuzzyFindText ───────────────────────────────────────────────────────

describe("fuzzyFindText", () => {
  test("finds exact match", () => {
    const result = native.fuzzyFindText("hello world", "world");
    assert.equal(result.found, true);
    assert.equal(result.index, 6);
    assert.equal(result.matchLength, 5);
    assert.equal(result.usedFuzzyMatch, false);
    assert.equal(result.contentForReplacement, "hello world");
  });

  test("finds fuzzy match with smart quotes", () => {
    const content = 'let x = \u201Chello\u201D;';
    const oldText = 'let x = "hello";';
    const result = native.fuzzyFindText(content, oldText);
    assert.equal(result.found, true);
    assert.equal(result.usedFuzzyMatch, true);
  });

  test("returns not found for missing text", () => {
    const result = native.fuzzyFindText("hello world", "xyz");
    assert.equal(result.found, false);
    assert.equal(result.index, -1);
    assert.equal(result.matchLength, 0);
  });

  test("returns correct UTF-16 index for non-ASCII content", () => {
    // Emoji U+1F600 is 2 UTF-16 code units (surrogate pair), 4 UTF-8 bytes
    const content = "\u{1F600}hello";
    const result = native.fuzzyFindText(content, "hello");
    assert.equal(result.found, true);
    // Emoji is 2 UTF-16 code units, so "hello" starts at index 2
    assert.equal(result.index, 2);
    assert.equal(result.matchLength, 5);
  });

  test("index is compatible with JS substring()", () => {
    const content = "abc\u{1F600}def";
    const result = native.fuzzyFindText(content, "def");
    assert.equal(result.found, true);
    // "abc" = 3, emoji = 2 UTF-16 code units → index 5
    assert.equal(result.index, 5);
    // Verify substring works correctly with the returned index
    const extracted = result.contentForReplacement.substring(
      result.index,
      result.index + result.matchLength,
    );
    assert.equal(extracted, "def");
  });

  test("fuzzy match with trailing whitespace differences", () => {
    const content = "hello   \nworld  ";
    const oldText = "hello\nworld";
    const result = native.fuzzyFindText(content, oldText);
    assert.equal(result.found, true);
    assert.equal(result.usedFuzzyMatch, true);
  });
});

// ── generateDiff ────────────────────────────────────────────────────────

describe("generateDiff", () => {
  test("generates diff for a line change", () => {
    const old = "line1\nline2\nline3";
    const newText = "line1\nmodified\nline3";
    const result = native.generateDiff(old, newText);
    assert.ok(result.diff.includes("line2"));
    assert.ok(result.diff.includes("modified"));
    assert.ok(result.diff.includes("-"));
    assert.ok(result.diff.includes("+"));
    assert.notEqual(result.firstChangedLine, null);
  });

  test("generates diff for an addition", () => {
    const old = "line1\nline3";
    const newText = "line1\nline2\nline3";
    const result = native.generateDiff(old, newText);
    assert.ok(result.diff.includes("+"));
    assert.ok(result.diff.includes("line2"));
  });

  test("generates diff for a deletion", () => {
    const old = "line1\nline2\nline3";
    const newText = "line1\nline3";
    const result = native.generateDiff(old, newText);
    assert.ok(result.diff.includes("-"));
    assert.ok(result.diff.includes("line2"));
  });

  test("returns empty diff for identical content", () => {
    const result = native.generateDiff("same", "same");
    assert.equal(result.diff, "");
    // napi-rs maps Option::None to undefined (not null)
    assert.equal(result.firstChangedLine, undefined);
  });

  test("respects context lines parameter", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const old = lines.join("\n");
    lines[10] = "modified";
    const newText = lines.join("\n");
    const result = native.generateDiff(old, newText, 2);
    assert.ok(result.diff.includes("..."));
  });

  test("default context is 4 lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const old = lines.join("\n");
    lines[10] = "modified";
    const newText = lines.join("\n");
    const result = native.generateDiff(old, newText);
    // Should show 4 context lines before and after
    assert.ok(result.diff.length > 0);
  });
});
