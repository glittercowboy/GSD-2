// GSD2 — Shared barrel import behavior without TUI dependency loading

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("shared/mod.ts imports without resolving @gsd/pi-tui", () => {
  const tmp = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "gsd-shared-mod-"));
  const loaderPath = join(tmp, "block-pi-tui-loader.mjs");
  writeFileSync(
    loaderPath,
    [
      "export async function resolve(specifier, context, nextResolve) {",
      "  if (specifier === '@gsd/pi-tui') throw new Error('unexpected @gsd/pi-tui import');",
      "  return nextResolve(specifier, context);",
      "}",
      "",
    ].join("\n"),
    "utf-8",
  );

  try {
    const sharedModPath = join(__dirname, "../../shared/mod.ts");
    const resolveTsPath = join(__dirname, "resolve-ts.mjs");
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        resolveTsPath,
        "--experimental-loader",
        loaderPath,
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(sharedModPath)});`,
      ],
      { encoding: "utf-8" },
    );

    assert.equal(
      result.status,
      0,
      `shared/mod.ts should import without @gsd/pi-tui; stderr:\n${result.stderr}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
