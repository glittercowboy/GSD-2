// Project/App: GSD-2
// File Purpose: Summarize prompt-context debug events from GSD debug logs.

const fs = require("node:fs");
const path = require("node:path");

function formatChars(value) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function parsePromptContextEvents(text, source = "<memory>") {
  const events = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes('"event":"prompt-context"') && !line.includes("prompt-context")) continue;
    try {
      const event = JSON.parse(line);
      if (event && event.event === "prompt-context") {
        events.push({ ...event, source, line: i + 1 });
      }
    } catch {
      // Ignore non-JSON diagnostic lines that happen to mention prompt-context.
    }
  }
  return events;
}

function addBlock(map, block) {
  const key = `${block.key || "unknown"}:${block.mode || "unknown"}`;
  const current = map.get(key) || {
    key: block.key || "unknown",
    mode: block.mode || "unknown",
    count: 0,
    totalChars: 0,
    maxChars: 0,
    reasons: new Map(),
  };
  const chars = Number(block.chars) || 0;
  current.count += 1;
  current.totalChars += chars;
  current.maxChars = Math.max(current.maxChars, chars);
  if (block.reason) {
    current.reasons.set(block.reason, (current.reasons.get(block.reason) || 0) + 1);
  }
  map.set(key, current);
}

function addSkipped(map, skipped) {
  const key = skipped.key || "unknown";
  const current = map.get(key) || { key, count: 0, reasons: new Map() };
  current.count += 1;
  if (skipped.reason) {
    current.reasons.set(skipped.reason, (current.reasons.get(skipped.reason) || 0) + 1);
  }
  map.set(key, current);
}

function summarizeEvents(events) {
  const units = new Map();
  for (const event of events) {
    const unitType = event.unitType || "unknown";
    const unit = units.get(unitType) || {
      unitType,
      count: 0,
      totalFinalChars: 0,
      maxFinalChars: 0,
      loaded: new Map(),
      skipped: new Map(),
    };
    const finalChars = Number(event.finalChars) || 0;
    unit.count += 1;
    unit.totalFinalChars += finalChars;
    unit.maxFinalChars = Math.max(unit.maxFinalChars, finalChars);
    for (const block of Array.isArray(event.loaded) ? event.loaded : []) addBlock(unit.loaded, block);
    for (const skipped of Array.isArray(event.skipped) ? event.skipped : []) addSkipped(unit.skipped, skipped);
    units.set(unitType, unit);
  }

  return [...units.values()]
    .map(unit => ({
      ...unit,
      avgFinalChars: unit.count > 0 ? unit.totalFinalChars / unit.count : 0,
      loaded: [...unit.loaded.values()].sort((a, b) => b.totalChars - a.totalChars),
      skipped: [...unit.skipped.values()].sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.maxFinalChars - a.maxFinalChars);
}

function formatReasons(reasons) {
  const items = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
  if (items.length === 0) return "";
  return ` (${items.map(([reason, count]) => `${reason} x${count}`).join(", ")})`;
}

function formatSummary(units, options = {}) {
  const maxBlocks = options.maxBlocks || 8;
  const lines = ["Prompt Context Summary"];
  if (units.length === 0) {
    lines.push("No prompt-context events found.");
    return lines.join("\n");
  }

  const eventCount = units.reduce((sum, unit) => sum + unit.count, 0);
  lines.push(`Events: ${eventCount}`);
  lines.push("");
  lines.push("Unit type                 Events  Avg prompt  Max prompt");
  lines.push("------------------------  ------  ----------  ----------");
  for (const unit of units) {
    lines.push(
      `${unit.unitType.padEnd(24)}  ${String(unit.count).padStart(6)}  ${formatChars(unit.avgFinalChars).padStart(10)}  ${formatChars(unit.maxFinalChars).padStart(10)}`,
    );
  }

  for (const unit of units) {
    lines.push("");
    lines.push(`${unit.unitType}`);
    for (const block of unit.loaded.slice(0, maxBlocks)) {
      lines.push(
        `  ${block.key} [${block.mode}] total ${formatChars(block.totalChars)}, max ${formatChars(block.maxChars)}, count ${block.count}${formatReasons(block.reasons)}`,
      );
    }
    if (unit.skipped.length > 0) {
      lines.push(`  skipped: ${unit.skipped.map(item => `${item.key} x${item.count}${formatReasons(item.reasons)}`).join("; ")}`);
    }
  }

  return lines.join("\n");
}

function collectLogFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) continue;
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const file of fs.readdirSync(input)) {
        if (file.startsWith("debug-") && file.endsWith(".log")) files.push(path.join(input, file));
      }
    } else if (stat.isFile()) {
      files.push(input);
    }
  }
  return [...new Set(files)].sort();
}

function summarizeFiles(files) {
  const events = [];
  for (const file of files) {
    events.push(...parsePromptContextEvents(fs.readFileSync(file, "utf8"), file));
  }
  return summarizeEvents(events);
}

function main(argv) {
  const inputs = argv.slice(2);
  if (inputs.length === 0) {
    console.error("Usage: node scripts/summarize-prompt-context.cjs <debug.log|debug-dir> [...]");
    process.exitCode = 1;
    return;
  }
  const files = collectLogFiles(inputs);
  if (files.length === 0) {
    console.error("No debug log files found.");
    process.exitCode = 1;
    return;
  }
  console.log(formatSummary(summarizeFiles(files)));
}

if (require.main === module) main(process.argv);

module.exports = {
  collectLogFiles,
  formatSummary,
  parsePromptContextEvents,
  summarizeEvents,
  summarizeFiles,
};
