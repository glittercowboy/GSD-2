/**
 * auto-pr-bugs.test.ts — Regression tests for #2302.
 *
 * Verifies the PR creation command behavior directly instead of asserting on
 * git-service.ts source text.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createDraftPR } from "../git-service.ts";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("#2302 createDraftPR passes head and base branch parameters to gh", (t) => {
  const dir = makeTempDir("gsd-auto-pr-");
  const bin = join(dir, "bin");
  const logPath = join(dir, "gh-args.json");
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(bin, { recursive: true });
  const ghPath = join(bin, "gh");
  writeFileSync(
    ghPath,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)));`,
      "process.stdout.write('https://example.test/pr/1\\n');",
    ].join("\n"),
    "utf-8",
  );
  chmodSync(ghPath, 0o755);

  const prUrl = createDraftPR(
    dir,
    "M001",
    "Draft title",
    "Draft body",
    {
      head: "milestone/M001",
      base: "main",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    },
  );

  assert.equal(prUrl, "https://example.test/pr/1");
  assert.deepEqual(JSON.parse(readFileSync(logPath, "utf-8")), [
    "pr",
    "create",
    "--draft",
    "--title",
    "Draft title",
    "--body",
    "Draft body",
    "--head",
    "milestone/M001",
    "--base",
    "main",
  ]);
});
