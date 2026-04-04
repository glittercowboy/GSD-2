/**
 * Verify that auto-mode catch blocks emit diagnostic output instead of
 * silently swallowing errors (#3348, #3345).
 *
 * This test scans the auto-mode source files and asserts that no empty
 * catch blocks remain — every catch must contain at least one statement
 * beyond comments.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

function getAutoModeFiles(): string[] {
  const files: string[] = [];

  // Top-level auto*.ts files
  for (const f of readdirSync(gsdDir)) {
    if (f.startsWith("auto") && f.endsWith(".ts") && !f.endsWith(".test.ts")) {
      files.push(join(gsdDir, f));
    }
  }

  // auto/ subdirectory
  const autoSubDir = join(gsdDir, "auto");
  for (const f of readdirSync(autoSubDir)) {
    if (f.endsWith(".ts") && !f.endsWith(".test.ts")) {
      files.push(join(autoSubDir, f));
    }
  }

  return files;
}

/**
 * Scan a file for empty catch blocks — catches whose body contains
 * only whitespace and/or comments but no executable statements.
 */
function findEmptyCatches(filePath: string): Array<{ line: number; text: string }> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results: Array<{ line: number; text: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match catch block opening
    if (!/\}\s*catch\s*(\([^)]*\))?\s*\{/.test(line)) continue;

    // Inline single-line catch: } catch { ... }
    const inlineMatch = line.match(/\}\s*catch\s*(\([^)]*\))?\s*\{(.*)\}\s*;?\s*$/);
    if (inlineMatch) {
      const body = inlineMatch[2].trim();
      // Check if body is only comments
      const stripped = body.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*/g, "").trim();
      if (!stripped) {
        results.push({ line: i + 1, text: line.trim() });
      }
      continue;
    }

    // Multi-line catch — scan until matching }
    let j = i + 1;
    let depth = 1;
    const bodyLines: string[] = [];
    while (j < lines.length && depth > 0) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      bodyLines.push(lines[j].trim());
      j++;
    }

    // Check if body (excluding closing brace) has any executable statements
    const meaningful = bodyLines.slice(0, -1).filter(
      (l) => l && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*") && l !== "}",
    );

    if (meaningful.length === 0) {
      results.push({ line: i + 1, text: line.trim() });
    }
  }

  return results;
}

describe("auto-mode diagnostic catch blocks (#3348)", () => {
  test("no empty catch blocks remain in auto-mode files", () => {
    const files = getAutoModeFiles();
    assert.ok(files.length > 0, "should find auto-mode source files");

    const violations: string[] = [];
    for (const file of files) {
      const empties = findEmptyCatches(file);
      for (const empty of empties) {
        const rel = file.replace(gsdDir + "/", "");
        violations.push(`${rel}:${empty.line} — ${empty.text}`);
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} empty catch block(s) in auto-mode files:\n${violations.join("\n")}`,
    );
  });
});
