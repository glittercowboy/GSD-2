import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Regression test for #1881: Windows web mode — hardcoded Linux CI path in
 * standalone build.
 *
 * The Next.js standalone build bakes import.meta.url into compiled chunks as
 * the CI runner's absolute Linux path (file:///home/runner/work/gsd-2/gsd-2/…).
 * On Windows, fileURLToPath() rejects this with "File URL path must be
 * absolute". The fix wraps the derivation in safePackageRootFromImportUrl()
 * so the module-level constant never throws, and resolveBridgeRuntimeConfig
 * falls through to the GSD_WEB_PACKAGE_ROOT env var.
 */

import { safePackageRootFromImportUrl } from '../web/safe-import-meta-resolve.ts'
import { resolveBridgeRuntimeConfig } from '../web/bridge-service.ts'

test('safePackageRootFromImportUrl returns a path for a valid native file URL', () => {
  const result = safePackageRootFromImportUrl(import.meta.url)
  assert.ok(result !== null, 'should return a path for a valid native file URL')
  assert.ok(typeof result === 'string')
  assert.ok(result.length > 0)
})

test('safePackageRootFromImportUrl returns null for a non-file URL', () => {
  const result = safePackageRootFromImportUrl('https://example.com/foo/bar.ts')
  assert.equal(result, null)
})

test('safePackageRootFromImportUrl returns null for empty input', () => {
  const result = safePackageRootFromImportUrl('')
  assert.equal(result, null)
})

test('safePackageRootFromImportUrl returns null for malformed URL', () => {
  const result = safePackageRootFromImportUrl('not-a-url')
  assert.equal(result, null)
})

test('safePackageRootFromImportUrl respects ancestorLevels', () => {
  // With 0 levels, should return the directory of the module itself
  const level0 = safePackageRootFromImportUrl(import.meta.url, 0)
  const level2 = safePackageRootFromImportUrl(import.meta.url, 2)
  assert.ok(level0 !== null)
  assert.ok(level2 !== null)
  // level0 is deeper than level2
  assert.ok(level0.length > level2.length)
})

test('resolveBridgeRuntimeConfig accepts explicit package root when standalone import.meta.url is unusable', () => {
  const config = resolveBridgeRuntimeConfig({
    GSD_WEB_PROJECT_CWD: '/tmp/project',
    GSD_WEB_PROJECT_SESSIONS_DIR: '/tmp/sessions',
    GSD_WEB_PACKAGE_ROOT: '/tmp/package-root',
  } as NodeJS.ProcessEnv)

  assert.deepEqual(config, {
    projectCwd: '/tmp/project',
    projectSessionsDir: '/tmp/sessions',
    packageRoot: '/tmp/package-root',
  })
})

test('resolveBridgeRuntimeConfig falls back to a lazy default package root', () => {
  const config = resolveBridgeRuntimeConfig({
    GSD_WEB_PROJECT_CWD: '/tmp/project',
    GSD_WEB_PROJECT_SESSIONS_DIR: '/tmp/sessions',
  } as NodeJS.ProcessEnv)

  assert.equal(config.projectCwd, '/tmp/project')
  assert.equal(config.projectSessionsDir, '/tmp/sessions')
  assert.equal(typeof config.packageRoot, 'string')
  assert.ok(config.packageRoot.length > 0)
})
