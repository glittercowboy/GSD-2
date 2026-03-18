import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'

import { compareSemver, readUpdateCache, writeUpdateCache, checkForUpdates } from '../update-check.js'

// ---------------------------------------------------------------------------
// compareSemver
// ---------------------------------------------------------------------------

test('compareSemver returns 0 for equal versions', () => {
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0)
  assert.equal(compareSemver('2.8.3', '2.8.3'), 0)
})

test('compareSemver returns 1 when first is greater', () => {
  assert.equal(compareSemver('2.0.0', '1.0.0'), 1)
  assert.equal(compareSemver('1.1.0', '1.0.0'), 1)
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1)
  assert.equal(compareSemver('2.8.3', '2.7.1'), 1)
})

test('compareSemver returns -1 when first is smaller', () => {
  assert.equal(compareSemver('1.0.0', '2.0.0'), -1)
  assert.equal(compareSemver('1.0.0', '1.1.0'), -1)
  assert.equal(compareSemver('1.0.0', '1.0.1'), -1)
  assert.equal(compareSemver('2.3.11', '2.8.3'), -1)
})

test('compareSemver handles versions with different segment counts', () => {
  assert.equal(compareSemver('1.0', '1.0.0'), 0)
  assert.equal(compareSemver('1.0.0', '1.0'), 0)
  assert.equal(compareSemver('1.0', '1.0.1'), -1)
  assert.equal(compareSemver('1.0.1', '1.0'), 1)
})

// ---------------------------------------------------------------------------
// readUpdateCache / writeUpdateCache
// ---------------------------------------------------------------------------

test('readUpdateCache returns null for nonexistent file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-cache-'))
  try {
    const result = readUpdateCache(join(tmp, 'nonexistent'))
    assert.equal(result, null)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('readUpdateCache returns null for malformed JSON', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-cache-'))
  try {
    const cachePath = join(tmp, '.update-check')
    writeFileSync(cachePath, 'not json')
    const result = readUpdateCache(cachePath)
    assert.equal(result, null)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('writeUpdateCache + readUpdateCache round-trips correctly', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-cache-'))
  try {
    const cachePath = join(tmp, '.update-check')
    const cache = { lastCheck: Date.now(), latestVersion: '3.0.0' }
    writeUpdateCache(cache, cachePath)
    const result = readUpdateCache(cachePath)
    assert.deepEqual(result, cache)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('writeUpdateCache creates parent directories', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-cache-'))
  try {
    const cachePath = join(tmp, 'nested', 'dir', '.update-check')
    writeUpdateCache({ lastCheck: Date.now(), latestVersion: '1.0.0' }, cachePath)
    const raw = readFileSync(cachePath, 'utf-8')
    assert.ok(raw.includes('1.0.0'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// checkForUpdates — integration tests with a local HTTP server
// ---------------------------------------------------------------------------

function startMockRegistry(responseBody: object, statusCode = 200): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(responseBody))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
  })
}

test('checkForUpdates calls onUpdate when newer version is available', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const registry = await startMockRegistry({ version: '99.0.0' })
  try {
    let called = false
    let reportedCurrent = ''
    let reportedLatest = ''

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath: join(tmp, '.update-check'),
      registryUrl: registry.url,
      checkIntervalMs: 0,
      fetchTimeoutMs: 5000,
      onUpdate: (current, latest) => {
        called = true
        reportedCurrent = current
        reportedLatest = latest
      },
    })

    assert.ok(called, 'onUpdate should have been called')
    assert.equal(reportedCurrent, '1.0.0')
    assert.equal(reportedLatest, '99.0.0')
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates does not call onUpdate when already on latest', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const registry = await startMockRegistry({ version: '1.0.0' })
  try {
    let called = false

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath: join(tmp, '.update-check'),
      registryUrl: registry.url,
      checkIntervalMs: 0,
      fetchTimeoutMs: 5000,
      onUpdate: () => { called = true },
    })

    assert.ok(!called, 'onUpdate should not be called when versions match')
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates does not call onUpdate when current is ahead', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const registry = await startMockRegistry({ version: '1.0.0' })
  try {
    let called = false

    await checkForUpdates({
      currentVersion: '2.0.0',
      cachePath: join(tmp, '.update-check'),
      registryUrl: registry.url,
      checkIntervalMs: 0,
      fetchTimeoutMs: 5000,
      onUpdate: () => { called = true },
    })

    assert.ok(!called, 'onUpdate should not be called when current is ahead')
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates writes cache after successful fetch', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const cachePath = join(tmp, '.update-check')
  const registry = await startMockRegistry({ version: '5.0.0' })
  try {
    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath,
      registryUrl: registry.url,
      checkIntervalMs: 0,
      fetchTimeoutMs: 5000,
      onUpdate: () => {},
    })

    const cache = readUpdateCache(cachePath)
    assert.ok(cache, 'cache should exist after fetch')
    assert.equal(cache!.latestVersion, '5.0.0')
    assert.ok(cache!.lastCheck > 0)
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates uses cache and skips fetch when checked recently', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const cachePath = join(tmp, '.update-check')
  // Write a fresh cache entry
  writeUpdateCache({ lastCheck: Date.now(), latestVersion: '10.0.0' }, cachePath)

  // Start server that would return a different version — should NOT be reached
  const registry = await startMockRegistry({ version: '20.0.0' })
  try {
    let reportedLatest = ''

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath,
      registryUrl: registry.url,
      checkIntervalMs: 60 * 60 * 1000, // 1 hour
      fetchTimeoutMs: 5000,
      onUpdate: (_current, latest) => { reportedLatest = latest },
    })

    // Should use cached version (10.0.0), not the server's (20.0.0)
    assert.equal(reportedLatest, '10.0.0')
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates skips notification when cache is fresh and versions match', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const cachePath = join(tmp, '.update-check')
  writeUpdateCache({ lastCheck: Date.now(), latestVersion: '1.0.0' }, cachePath)

  try {
    let called = false

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath,
      checkIntervalMs: 60 * 60 * 1000,
      fetchTimeoutMs: 5000,
      onUpdate: () => { called = true },
    })

    assert.ok(!called, 'onUpdate should not be called when cached version matches current')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates handles server error gracefully', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const registry = await startMockRegistry({}, 500)
  try {
    let called = false

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath: join(tmp, '.update-check'),
      registryUrl: registry.url,
      checkIntervalMs: 0,
      fetchTimeoutMs: 5000,
      onUpdate: () => { called = true },
    })

    assert.ok(!called, 'onUpdate should not be called on server error')
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates handles network timeout gracefully', async () => {
  // Start a server that never responds
  const server = createServer(() => { /* intentionally never respond */ })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as { port: number }
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))

  try {
    let called = false

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath: join(tmp, '.update-check'),
      registryUrl: `http://127.0.0.1:${addr.port}`,
      checkIntervalMs: 0,
      fetchTimeoutMs: 500, // Very short timeout
      onUpdate: () => { called = true },
    })

    assert.ok(!called, 'onUpdate should not be called on timeout')
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('checkForUpdates handles missing version field in response', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-update-'))
  const registry = await startMockRegistry({ name: 'gsd-pi' }) // no version field
  try {
    let called = false

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath: join(tmp, '.update-check'),
      registryUrl: registry.url,
      checkIntervalMs: 0,
      fetchTimeoutMs: 5000,
      onUpdate: () => { called = true },
    })

    assert.ok(!called, 'onUpdate should not be called when response has no version')
  } finally {
    await registry.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})
