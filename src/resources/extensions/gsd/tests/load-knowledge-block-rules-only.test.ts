// ADR-013 follow-up — loadKnowledgeBlock injects only Rules from project
// KNOWLEDGE.md to avoid duplicating Patterns + Lessons content already
// injected via loadMemoryBlock (Stage 2b cutover).
//
// Global KNOWLEDGE.md (~/.gsd/agent/KNOWLEDGE.md) is NOT memory-projected
// and still passes through with all three sections intact.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadKnowledgeBlock } from "../bootstrap/system-context.ts";
import { extractIntroAndRules } from "../knowledge-parser.ts";

function makeTmpProject(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-knowledge-rules-only-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function makeTmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), "gsd-knowledge-home-"));
  mkdirSync(join(home, "agent"), { recursive: true });
  return home;
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
}

const FULL_KNOWLEDGE = `# Project Knowledge

Append-only register of project-specific rules, patterns, and lessons learned.

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | All timestamps in UTC | clarity | 2026-01-01 |
| K002 | M001 | Never trust user input | safety | 2026-01-02 |

## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P001 | Repository pattern | services/ | guards |

## Lessons Learned

| # | What Happened | Root Cause | Fix | Scope |
|---|--------------|------------|-----|-------|
| L001 | Cache poisoning | reused key | versioned key | project |
`;

// ─── extractIntroAndRules unit tests ───────────────────────────────────────

test("extractIntroAndRules keeps intro + Rules, drops Patterns + Lessons", () => {
  const out = extractIntroAndRules(FULL_KNOWLEDGE);
  assert.match(out, /# Project Knowledge/);
  assert.match(out, /## Rules/);
  assert.match(out, /\| K001 \| project \| All timestamps in UTC/);
  assert.match(out, /\| K002 \| M001 \| Never trust user input/);

  assert.equal(out.includes("## Patterns"), false, "Patterns heading must be dropped");
  assert.equal(out.includes("P001"), false, "Pattern rows must be dropped");
  assert.equal(out.includes("## Lessons Learned"), false, "Lessons heading must be dropped");
  assert.equal(out.includes("L001"), false, "Lesson rows must be dropped");
});

test("extractIntroAndRules returns content unchanged when no `## Rules` heading", () => {
  const content = "# Notes\n\nfreeform content without standard sections\n";
  assert.equal(extractIntroAndRules(content), content);
});

test("extractIntroAndRules returns empty for empty input", () => {
  assert.equal(extractIntroAndRules(""), "");
  assert.equal(extractIntroAndRules("   \n\n"), "");
});

test("extractIntroAndRules handles Rules as the only section (no Patterns/Lessons to drop)", () => {
  const content = `# Project Knowledge

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | only rule | reason | 2026-01-01 |
`;
  const out = extractIntroAndRules(content);
  assert.match(out, /K001/);
  assert.match(out, /## Rules/);
});

// ─── loadKnowledgeBlock integration ────────────────────────────────────────

test("loadKnowledgeBlock trims project KNOWLEDGE.md to intro + Rules", () => {
  const base = makeTmpProject();
  const home = makeTmpHome();
  try {
    writeFileSync(join(base, ".gsd", "KNOWLEDGE.md"), FULL_KNOWLEDGE, "utf-8");
    const { block } = loadKnowledgeBlock(home, base);

    assert.match(block, /## Project Knowledge/);
    assert.match(block, /K001/);
    assert.match(block, /K002/);
    assert.equal(block.includes("P001"), false, "project Patterns must not appear in the block");
    assert.equal(block.includes("L001"), false, "project Lessons must not appear in the block");
    assert.equal(block.includes("## Patterns"), false);
    assert.equal(block.includes("## Lessons Learned"), false);
  } finally {
    cleanup(base, home);
  }
});

test("loadKnowledgeBlock leaves global KNOWLEDGE.md intact (no memory projection there)", () => {
  const base = makeTmpProject();
  const home = makeTmpHome();
  try {
    writeFileSync(join(home, "agent", "KNOWLEDGE.md"), FULL_KNOWLEDGE, "utf-8");
    const { block, globalSizeKb } = loadKnowledgeBlock(home, base);

    assert.match(block, /## Global Knowledge/);
    // Global is full-fidelity: all three sections intact.
    assert.match(block, /K001/);
    assert.match(block, /P001/);
    assert.match(block, /L001/);
    assert.match(block, /## Patterns/);
    assert.match(block, /## Lessons Learned/);
    assert.ok(globalSizeKb > 0, "globalSizeKb should report the global file size");
  } finally {
    cleanup(base, home);
  }
});

test("loadKnowledgeBlock with both global and project: global keeps full content, project trimmed", () => {
  const base = makeTmpProject();
  const home = makeTmpHome();
  try {
    writeFileSync(join(home, "agent", "KNOWLEDGE.md"), FULL_KNOWLEDGE, "utf-8");
    writeFileSync(join(base, ".gsd", "KNOWLEDGE.md"), FULL_KNOWLEDGE, "utf-8");
    const { block } = loadKnowledgeBlock(home, base);

    // Both sections present.
    assert.match(block, /## Global Knowledge/);
    assert.match(block, /## Project Knowledge/);

    // Project's Patterns/Lessons headings must be gone. But global keeps
    // them, so a substring count of e.g. "## Patterns" should equal 1.
    const patternsCount = (block.match(/## Patterns/g) ?? []).length;
    const lessonsCount = (block.match(/## Lessons Learned/g) ?? []).length;
    assert.equal(patternsCount, 1, "Patterns heading appears exactly once (in global)");
    assert.equal(lessonsCount, 1, "Lessons heading appears exactly once (in global)");

    // K/P/L rows: K appears twice (global + project), P/L appear once (global).
    const k001Count = (block.match(/K001/g) ?? []).length;
    const p001Count = (block.match(/P001/g) ?? []).length;
    const l001Count = (block.match(/L001/g) ?? []).length;
    assert.equal(k001Count, 2, "K001 in both global and project");
    assert.equal(p001Count, 1, "P001 only in global");
    assert.equal(l001Count, 1, "L001 only in global");
  } finally {
    cleanup(base, home);
  }
});

test("loadKnowledgeBlock returns empty block when neither file exists", () => {
  const base = makeTmpProject();
  const home = makeTmpHome();
  try {
    const result = loadKnowledgeBlock(home, base);
    assert.equal(result.block, "");
    assert.equal(result.globalSizeKb, 0);
  } finally {
    cleanup(base, home);
  }
});

test("loadKnowledgeBlock injects only Rules when project KNOWLEDGE.md has no Patterns/Lessons", () => {
  const base = makeTmpProject();
  const home = makeTmpHome();
  try {
    writeFileSync(
      join(base, ".gsd", "KNOWLEDGE.md"),
      `# Project Knowledge

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | rule one | reason | 2026-01-01 |
`,
      "utf-8",
    );
    const { block } = loadKnowledgeBlock(home, base);
    assert.match(block, /K001/);
    // Block heading reflects the new contract.
    assert.match(block, /Rules from KNOWLEDGE\.md/);
  } finally {
    cleanup(base, home);
  }
});
