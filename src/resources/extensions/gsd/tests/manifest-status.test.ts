/**
 * Tests for getManifestStatus() — the S01→S02 boundary contract.
 *
 * Verifies that manifest entries are correctly categorized into
 * pending, collected, skipped, and existing arrays based on
 * manifest status and environment presence.
 *
 * Uses temp directories with real .gsd/milestones/M001/ structure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getManifestStatus } from '../files.ts';

function makeTempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create the .gsd/milestones/M001/ directory structure and write a secrets manifest. */
function writeManifest(base: string, content: string): void {
  const mDir = join(base, '.gsd', 'milestones', 'M001');
  mkdirSync(mDir, { recursive: true });
  writeFileSync(join(mDir, 'M001-SECRETS.md'), content);
}

// ─── Mixed statuses ──────────────────────────────────────────────────────────

test('getManifestStatus: mixed statuses — categorizes entries correctly', async () => {
  const tmp = makeTempDir('manifest-mixed');
  const savedVal = process.env.GSD_TEST_EXISTING_KEY_001;
  try {
    process.env.GSD_TEST_EXISTING_KEY_001 = 'some-value';

    writeManifest(tmp, `# Secrets Manifest

**Milestone:** M001
**Generated:** 2025-06-20T10:00:00Z

### PENDING_KEY

**Service:** SomeService
**Status:** pending
**Destination:** dotenv

1. Get the key

### COLLECTED_KEY

**Service:** AnotherService
**Status:** collected
**Destination:** dotenv

1. Already collected

### SKIPPED_KEY

**Service:** OptionalService
**Status:** skipped
**Destination:** dotenv

1. Not needed

### GSD_TEST_EXISTING_KEY_001

**Service:** EnvService
**Status:** pending
**Destination:** dotenv

1. Already in env
`);

    const result = await getManifestStatus(tmp, 'M001');
    assert.notStrictEqual(result, null, 'should not be null');
    assert.deepStrictEqual(result!.pending, ['PENDING_KEY']);
    assert.deepStrictEqual(result!.collected, ['COLLECTED_KEY']);
    assert.deepStrictEqual(result!.skipped, ['SKIPPED_KEY']);
    assert.deepStrictEqual(result!.existing, ['GSD_TEST_EXISTING_KEY_001']);
  } finally {
    delete process.env.GSD_TEST_EXISTING_KEY_001;
    if (savedVal !== undefined) process.env.GSD_TEST_EXISTING_KEY_001 = savedVal;
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── All pending ─────────────────────────────────────────────────────────────

test('getManifestStatus: all pending — 3 pending entries, none in env', async () => {
  const tmp = makeTempDir('manifest-pending');
  try {
    // Ensure none of these are in process.env
    delete process.env.PEND_A;
    delete process.env.PEND_B;
    delete process.env.PEND_C;

    writeManifest(tmp, `# Secrets Manifest

**Milestone:** M001
**Generated:** 2025-06-20T10:00:00Z

### PEND_A

**Service:** A
**Status:** pending
**Destination:** dotenv

1. Step one

### PEND_B

**Service:** B
**Status:** pending
**Destination:** dotenv

1. Step one

### PEND_C

**Service:** C
**Status:** pending
**Destination:** dotenv

1. Step one
`);

    const result = await getManifestStatus(tmp, 'M001');
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.pending, ['PEND_A', 'PEND_B', 'PEND_C']);
    assert.deepStrictEqual(result!.collected, []);
    assert.deepStrictEqual(result!.skipped, []);
    assert.deepStrictEqual(result!.existing, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── All collected ───────────────────────────────────────────────────────────

test('getManifestStatus: all collected — 2 collected entries, none in env', async () => {
  const tmp = makeTempDir('manifest-collected');
  try {
    delete process.env.COLL_X;
    delete process.env.COLL_Y;

    writeManifest(tmp, `# Secrets Manifest

**Milestone:** M001
**Generated:** 2025-06-20T10:00:00Z

### COLL_X

**Service:** X
**Status:** collected
**Destination:** dotenv

1. Done

### COLL_Y

**Service:** Y
**Status:** collected
**Destination:** dotenv

1. Done
`);

    const result = await getManifestStatus(tmp, 'M001');
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.pending, []);
    assert.deepStrictEqual(result!.collected, ['COLL_X', 'COLL_Y']);
    assert.deepStrictEqual(result!.skipped, []);
    assert.deepStrictEqual(result!.existing, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Key in env overrides manifest status ────────────────────────────────────

test('getManifestStatus: key in env overrides manifest status — collected key in env goes to existing', async () => {
  const tmp = makeTempDir('manifest-override');
  const savedVal = process.env.GSD_TEST_OVERRIDE_KEY;
  try {
    process.env.GSD_TEST_OVERRIDE_KEY = 'already-here';

    writeManifest(tmp, `# Secrets Manifest

**Milestone:** M001
**Generated:** 2025-06-20T10:00:00Z

### GSD_TEST_OVERRIDE_KEY

**Service:** Override
**Status:** collected
**Destination:** dotenv

1. Was collected but now in env
`);

    const result = await getManifestStatus(tmp, 'M001');
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.pending, []);
    assert.deepStrictEqual(result!.collected, []);
    assert.deepStrictEqual(result!.skipped, []);
    assert.deepStrictEqual(result!.existing, ['GSD_TEST_OVERRIDE_KEY']);
  } finally {
    delete process.env.GSD_TEST_OVERRIDE_KEY;
    if (savedVal !== undefined) process.env.GSD_TEST_OVERRIDE_KEY = savedVal;
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Missing manifest ────────────────────────────────────────────────────────

test('getManifestStatus: missing manifest — returns null', async () => {
  const tmp = makeTempDir('manifest-missing');
  try {
    // No .gsd directory at all
    const result = await getManifestStatus(tmp, 'M001');
    assert.strictEqual(result, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Empty manifest (no entries) ─────────────────────────────────────────────

test('getManifestStatus: empty manifest — exists but no H3 sections', async () => {
  const tmp = makeTempDir('manifest-empty');
  try {
    writeManifest(tmp, `# Secrets Manifest

**Milestone:** M001
**Generated:** 2025-06-20T10:00:00Z
`);

    const result = await getManifestStatus(tmp, 'M001');
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.pending, []);
    assert.deepStrictEqual(result!.collected, []);
    assert.deepStrictEqual(result!.skipped, []);
    assert.deepStrictEqual(result!.existing, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Env via .env file (not just process.env) ────────────────────────────────

test('getManifestStatus: key in .env file counts as existing', async () => {
  const tmp = makeTempDir('manifest-dotenv');
  try {
    delete process.env.DOTENV_ONLY_KEY;

    writeManifest(tmp, `# Secrets Manifest

**Milestone:** M001
**Generated:** 2025-06-20T10:00:00Z

### DOTENV_ONLY_KEY

**Service:** DotenvService
**Status:** pending
**Destination:** dotenv

1. Get key
`);

    // Write a .env file at the project root with the key
    writeFileSync(join(tmp, '.env'), 'DOTENV_ONLY_KEY=from-dotenv-file\n');

    const result = await getManifestStatus(tmp, 'M001');
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.existing, ['DOTENV_ONLY_KEY']);
    assert.deepStrictEqual(result!.pending, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
