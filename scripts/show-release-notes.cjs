#!/usr/bin/env node
"use strict";

const { execSync } = require("child_process");
const { readFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

// Find the last release tag or release commit
let lastRelease = "";
try {
  // Try tag first (e.g. v2.33.1)
  execSync(`git rev-parse "v${version}" 2>/dev/null`, { cwd: root });
  lastRelease = `v${version}`;
} catch {
  try {
    // Fallback: find "release: vX.Y.Z" commit
    lastRelease = execSync(
      `git log --all --format=%H --grep="release: v${version}" -1`,
      { cwd: root, encoding: "utf8" }
    ).trim();
  } catch {
    // ignore
  }
}

const range = lastRelease ? `${lastRelease}..HEAD` : "-20";
let log = "";
try {
  log = execSync(`git log ${range} --oneline --no-merges`, {
    cwd: root,
    encoding: "utf8",
  }).trim();
} catch {
  log = "";
}

// Colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

const line = "─".repeat(50);

console.log("");
console.log(`${CYAN}${line}${RESET}`);
console.log(`${BOLD}${GREEN} ✔ Build complete${RESET}  ${DIM}v${version}${RESET}`);
console.log(`${CYAN}${line}${RESET}`);

if (!log) {
  console.log(`${DIM}  No changes since last release.${RESET}`);
} else {
  const commits = log.split("\n");
  console.log(`${BOLD} 📋 Changes since v${version}:${RESET}`);
  console.log("");
  for (const c of commits) {
    const match = c.match(/^([a-f0-9]+)\s+(.*)$/);
    if (!match) continue;
    const [, hash, msg] = match;

    // Color by type
    let icon = "•";
    let color = RESET;
    if (msg.startsWith("feat")) { icon = "✦"; color = GREEN; }
    else if (msg.startsWith("fix")) { icon = "✧"; color = YELLOW; }
    else if (msg.startsWith("refactor")) { icon = "↻"; color = CYAN; }

    console.log(`  ${color}${icon} ${DIM}${hash}${RESET} ${msg}`);
  }
  console.log("");
  console.log(`${DIM}  ${commits.length} commit(s) since last release${RESET}`);
}
console.log(`${CYAN}${line}${RESET}`);
console.log("");
