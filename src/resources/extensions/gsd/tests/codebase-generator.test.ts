import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

import {
  parseCodebaseMap,
  generateCodebaseMap,
  updateCodebaseMap,
  writeCodebaseMap,
  readCodebaseMap,
  getCodebaseMapStats,
} from "../codebase-generator.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeTmpRepo(): string {
  const base = join(tmpdir(), `gsd-codebase-test-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  execSync("git init", { cwd: base, stdio: "ignore" });
  return base;
}

function addFile(base: string, path: string, content = ""): void {
  const fullPath = join(base, path);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content || `// ${path}\n`, "utf-8");
  execSync(`git add "${path}"`, { cwd: base, stdio: "ignore" });
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

// ─── parseCodebaseMap ────────────────────────────────────────────────────

test("parseCodebaseMap: parses file with description", () => {
  const content = `# Codebase Map

### src/
- \`main.ts\` — Application entry point
- \`utils.ts\` — Shared utilities
`;

  const map = parseCodebaseMap(content);
  assert.equal(map.size, 2);
  assert.equal(map.get("main.ts"), "Application entry point");
  assert.equal(map.get("utils.ts"), "Shared utilities");
});

test("parseCodebaseMap: parses file without description", () => {
  const content = `- \`config.ts\`\n- \`index.ts\` — Entry\n`;
  const map = parseCodebaseMap(content);
  assert.equal(map.size, 2);
  assert.equal(map.get("config.ts"), "");
  assert.equal(map.get("index.ts"), "Entry");
});

test("parseCodebaseMap: empty content returns empty map", () => {
  const map = parseCodebaseMap("");
  assert.equal(map.size, 0);
});

test("parseCodebaseMap: ignores non-matching lines", () => {
  const content = `# Codebase Map\n\nGenerated: 2026-03-23\n\n### src/\n- \`file.ts\` — desc\n`;
  const map = parseCodebaseMap(content);
  assert.equal(map.size, 1);
});

// ─── generateCodebaseMap ─────────────────────────────────────────────────

test("generateCodebaseMap: generates from git ls-files", () => {
  const base = makeTmpRepo();
  try {
    addFile(base, "src/main.ts");
    addFile(base, "src/utils.ts");
    addFile(base, "README.md");

    const result = generateCodebaseMap(base);
    assert.ok(result.content.includes("# Codebase Map"));
    assert.ok(result.content.includes("`src/main.ts`"));
    assert.ok(result.content.includes("`src/utils.ts`"));
    assert.ok(result.content.includes("README.md"));
    assert.equal(result.fileCount, 3);
    assert.equal(result.truncated, false);
  } finally {
    cleanup(base);
  }
});

test("generateCodebaseMap: excludes .gsd/ files", () => {
  const base = makeTmpRepo();
  try {
    addFile(base, "src/main.ts");
    addFile(base, ".gsd/PROJECT.md");

    const result = generateCodebaseMap(base);
    assert.ok(result.content.includes("`src/main.ts`"));
    assert.ok(!result.content.includes("PROJECT.md"));
  } finally {
    cleanup(base);
  }
});

test("generateCodebaseMap: preserves existing descriptions", () => {
  const base = makeTmpRepo();
  try {
    addFile(base, "src/main.ts");
    addFile(base, "src/utils.ts");

    const descriptions = new Map<string, string>();
    descriptions.set("src/main.ts", "App entry point");

    const result = generateCodebaseMap(base, undefined, descriptions);
    assert.ok(result.content.includes("`src/main.ts` — App entry point"));
    // utils.ts should be present but without description
    assert.ok(result.content.includes("`src/utils.ts`"));
  } finally {
    cleanup(base);
  }
});

test("generateCodebaseMap: collapses large directories", () => {
  const base = makeTmpRepo();
  try {
    // Create 25 files in one directory (above default threshold of 20)
    for (let i = 0; i < 25; i++) {
      addFile(base, `src/components/comp${String(i).padStart(2, "0")}.ts`);
    }

    const result = generateCodebaseMap(base);
    // Should be collapsed
    assert.ok(result.content.includes("25 files"));
    assert.ok(result.content.includes(".ts"));
  } finally {
    cleanup(base);
  }
});

test("generateCodebaseMap: respects maxFiles", () => {
  const base = makeTmpRepo();
  try {
    for (let i = 0; i < 10; i++) {
      addFile(base, `file${i}.ts`);
    }

    const result = generateCodebaseMap(base, { maxFiles: 5 });
    assert.equal(result.fileCount, 5);
    assert.equal(result.truncated, true);
  } finally {
    cleanup(base);
  }
});

// ─── updateCodebaseMap ───────────────────────────────────────────────────

test("updateCodebaseMap: preserves descriptions on update", () => {
  const base = makeTmpRepo();
  try {
    addFile(base, "src/main.ts");
    addFile(base, "src/utils.ts");

    // Generate initial map with a description
    const initial = generateCodebaseMap(base, undefined, new Map([["src/main.ts", "Entry point"]]));
    writeCodebaseMap(base, initial.content);

    // Add a new file
    addFile(base, "src/new.ts");

    // Update should preserve the description
    const result = updateCodebaseMap(base);
    assert.ok(result.content.includes("`src/main.ts` — Entry point"));
    assert.equal(result.added, 1);
    assert.equal(result.fileCount, 3);
  } finally {
    cleanup(base);
  }
});

// ─── writeCodebaseMap / readCodebaseMap ──────────────────────────────────

test("writeCodebaseMap + readCodebaseMap roundtrip", () => {
  const base = makeTmpRepo();
  try {
    const content = "# Codebase Map\n\n- `test.ts` — A test file\n";
    const outPath = writeCodebaseMap(base, content);
    assert.ok(existsSync(outPath));

    const read = readCodebaseMap(base);
    assert.equal(read, content);
  } finally {
    cleanup(base);
  }
});

test("readCodebaseMap: returns null when file missing", () => {
  const base = makeTmpRepo();
  try {
    const result = readCodebaseMap(base);
    assert.equal(result, null);
  } finally {
    cleanup(base);
  }
});

// ─── getCodebaseMapStats ─────────────────────────────────────────────────

test("getCodebaseMapStats: no map returns exists=false", () => {
  const base = makeTmpRepo();
  try {
    const stats = getCodebaseMapStats(base);
    assert.equal(stats.exists, false);
    assert.equal(stats.fileCount, 0);
  } finally {
    cleanup(base);
  }
});

test("getCodebaseMapStats: reports coverage", () => {
  const base = makeTmpRepo();
  try {
    const content = `# Codebase Map\n\nGenerated: 2026-03-23T14:00:00Z\n\n- \`a.ts\` — Has desc\n- \`b.ts\`\n- \`c.ts\` — Also has\n`;
    writeCodebaseMap(base, content);

    const stats = getCodebaseMapStats(base);
    assert.equal(stats.exists, true);
    assert.equal(stats.fileCount, 3);
    assert.equal(stats.describedCount, 2);
    assert.equal(stats.undescribedCount, 1);
    assert.equal(stats.generatedAt, "2026-03-23T14:00:00Z");
  } finally {
    cleanup(base);
  }
});
