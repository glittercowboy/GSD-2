import test from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"

import {
  buildSubprocessPrefixArgs,
  isUnderNodeModules,
  resolveSubprocessModule,
} from "../../web/ts-subprocess-flags.ts"

// ---------------------------------------------------------------------------
// isUnderNodeModules — exported utility
// ---------------------------------------------------------------------------

test("isUnderNodeModules returns false for paths outside node_modules", () => {
  assert.equal(isUnderNodeModules("/home/user/projects/gsd"), false)
})

test("isUnderNodeModules returns true for Unix paths under node_modules/", () => {
  assert.equal(
    isUnderNodeModules("/usr/lib/node_modules/gsd-pi"),
    true,
  )
})

test("isUnderNodeModules returns true for Windows paths under node_modules/", () => {
  assert.equal(
    isUnderNodeModules("C:\\Users\\dev\\AppData\\node_modules\\gsd-pi"),
    true,
  )
})

test("isUnderNodeModules returns false for substring match without trailing slash", () => {
  assert.equal(
    isUnderNodeModules("/home/user/my_node_modules_backup/gsd"),
    false,
  )
})

// ---------------------------------------------------------------------------
// resolveSubprocessModule — resolves .ts → dist .js under node_modules
// ---------------------------------------------------------------------------

test("resolveSubprocessModule returns source .ts path when NOT under node_modules", () => {
  const packageRoot = "/home/user/projects/gsd"
  const result = resolveSubprocessModule(
    packageRoot,
    "resources/extensions/gsd/workspace-index.ts",
    // existsSync not needed — should return src path without checking dist
  )

  assert.deepEqual(result, {
    modulePath: join(packageRoot, "src", "resources/extensions/gsd/workspace-index.ts"),
    useCompiledJs: false,
  })
})

test("resolveSubprocessModule returns compiled .js path when under node_modules and dist file exists", () => {
  const packageRoot = "/usr/lib/node_modules/gsd-pi"
  const distPath = join(packageRoot, "dist", "resources/extensions/gsd/workspace-index.js")
  const result = resolveSubprocessModule(
    packageRoot,
    "resources/extensions/gsd/workspace-index.ts",
    (p: string) => p === distPath,
  )

  assert.deepEqual(result, {
    modulePath: distPath,
    useCompiledJs: true,
  })
})

test("resolveSubprocessModule falls back to source .ts when under node_modules but dist file missing", () => {
  const packageRoot = "/usr/lib/node_modules/gsd-pi"
  const result = resolveSubprocessModule(
    packageRoot,
    "resources/extensions/gsd/workspace-index.ts",
    () => false, // dist file does not exist
  )

  assert.deepEqual(result, {
    modulePath: join(packageRoot, "src", "resources/extensions/gsd/workspace-index.ts"),
    useCompiledJs: false,
  })
})

test("resolveSubprocessModule handles Windows paths under node_modules", () => {
  const packageRoot = "C:\\Users\\dev\\AppData\\node_modules\\gsd-pi"
  const distPath = join(packageRoot, "dist", "resources/extensions/gsd/auto.js")
  const result = resolveSubprocessModule(
    packageRoot,
    "resources/extensions/gsd/auto.ts",
    (p: string) => p === distPath,
  )

  assert.deepEqual(result, {
    modulePath: distPath,
    useCompiledJs: true,
  })
})

test("resolveSubprocessModule strips .ts extension when building dist .js path", () => {
  const packageRoot = "/usr/lib/node_modules/gsd-pi"
  let checkedPath = ""
  resolveSubprocessModule(
    packageRoot,
    "resources/extensions/gsd/doctor.ts",
    (p: string) => { checkedPath = p; return true },
  )

  assert.equal(
    checkedPath,
    join(packageRoot, "dist", "resources/extensions/gsd/doctor.js"),
    "should check for .js file in dist/, not .ts",
  )
})

// ---------------------------------------------------------------------------
// Integration: bridge-service subprocess resolution pattern
// ---------------------------------------------------------------------------

test("buildSubprocessPrefixArgs omits TS loaders when compiled JS was selected", () => {
  assert.deepEqual(
    buildSubprocessPrefixArgs(
      "/usr/lib/node_modules/gsd-pi",
      {
        modulePath: "/usr/lib/node_modules/gsd-pi/dist/resources/extensions/gsd/workspace-index.js",
        useCompiledJs: true,
      },
      "file:///loader.mjs",
    ),
    ["--input-type=module"],
  )
})

test("buildSubprocessPrefixArgs keeps TS loader path when source TS was selected", () => {
  const args = buildSubprocessPrefixArgs(
    "/home/user/projects/gsd",
    {
      modulePath: "/home/user/projects/gsd/src/resources/extensions/gsd/workspace-index.ts",
      useCompiledJs: false,
    },
    "file:///loader.mjs",
  )

  assert.equal(args[0], "--import")
  assert.equal(args[1], "file:///loader.mjs")
  assert.equal(args.at(-1), "--input-type=module")
})
