// Project/App: GSD-2
// File Purpose: Regression tests for the prompt-context debug log summarizer.

const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  collectLogFiles,
  formatSummary,
  parsePromptContextEvents,
  summarizeEvents,
} = require("../summarize-prompt-context.cjs");

test("parsePromptContextEvents reads only prompt-context JSONL events", () => {
  const text = [
    JSON.stringify({ event: "autoLoop", phase: "enter" }),
    JSON.stringify({
      event: "prompt-context",
      unitType: "execute-task",
      finalChars: 1200,
      loaded: [{ key: "task-plan", mode: "inline", chars: 500 }],
      skipped: [{ key: "knowledge", reason: "missing" }],
    }),
    "not json prompt-context",
  ].join("\n");

  const events = parsePromptContextEvents(text, "debug.log");

  assert.equal(events.length, 1);
  assert.equal(events[0].unitType, "execute-task");
  assert.equal(events[0].source, "debug.log");
  assert.equal(events[0].line, 2);
});

test("summarizeEvents aggregates prompt sizes and loaded block costs", () => {
  const units = summarizeEvents([
    {
      event: "prompt-context",
      unitType: "plan-slice",
      finalChars: 1000,
      loaded: [
        { key: "templates", mode: "inline", chars: 700 },
        { key: "decisions", mode: "on-demand", chars: 100 },
      ],
      skipped: [{ key: "knowledge", reason: "missing" }],
    },
    {
      event: "prompt-context",
      unitType: "plan-slice",
      finalChars: 2000,
      loaded: [{ key: "templates", mode: "inline", chars: 800 }],
      skipped: [{ key: "knowledge", reason: "missing" }],
    },
  ]);

  assert.equal(units.length, 1);
  assert.equal(units[0].count, 2);
  assert.equal(units[0].avgFinalChars, 1500);
  assert.equal(units[0].maxFinalChars, 2000);
  assert.equal(units[0].loaded[0].key, "templates");
  assert.equal(units[0].loaded[0].totalChars, 1500);
  assert.equal(units[0].skipped[0].key, "knowledge");
  assert.equal(units[0].skipped[0].count, 2);
});

test("formatSummary renders a compact operator report", () => {
  const output = formatSummary(summarizeEvents([
    {
      event: "prompt-context",
      unitType: "complete-milestone",
      finalChars: 16000,
      loaded: [{ key: "project", mode: "inline", chars: 2500 }],
      skipped: [],
    },
  ]));

  assert.match(output, /Prompt Context Summary/);
  assert.match(output, /complete-milestone/);
  assert.match(output, /project \[inline\] total 2\.5K/);
});

test("collectLogFiles accepts a debug directory", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gsd-prompt-context-"));
  const logPath = path.join(dir, "debug-example.log");
  writeFileSync(logPath, "");
  writeFileSync(path.join(dir, "notes.txt"), "");

  assert.deepEqual(collectLogFiles([dir]), [logPath]);
});
