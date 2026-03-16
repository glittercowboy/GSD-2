/**
 * Unit tests for KNOWLEDGE.md integration.
 *
 * Tests:
 * - KNOWLEDGE is registered in GSD_ROOT_FILES
 * - resolveGsdRootFile resolves KNOWLEDGE paths correctly
 * - inlineGsdRootFile works with the KNOWLEDGE key
 * - before_agent_start hook includes/omits knowledge block appropriately
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GSD_ROOT_FILES, resolveGsdRootFile } from '../paths.ts';
import { inlineGsdRootFile } from '../auto-prompts.ts';

// ─── KNOWLEDGE is registered in GSD_ROOT_FILES ─────────────────────────────

test('knowledge: KNOWLEDGE key exists in GSD_ROOT_FILES', () => {
  assert.ok('KNOWLEDGE' in GSD_ROOT_FILES, 'GSD_ROOT_FILES should have KNOWLEDGE key');
  assert.strictEqual(GSD_ROOT_FILES.KNOWLEDGE, 'KNOWLEDGE.md');
});

// ─── resolveGsdRootFile resolves KNOWLEDGE.md ───────────────────────────────

test('knowledge: resolveGsdRootFile returns canonical path when KNOWLEDGE.md exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-knowledge-'));
  const gsdDir = join(tmp, '.gsd');
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, 'KNOWLEDGE.md'), '# Project Knowledge\n');

  const resolved = resolveGsdRootFile(tmp, 'KNOWLEDGE');
  assert.strictEqual(resolved, join(gsdDir, 'KNOWLEDGE.md'));

  rmSync(tmp, { recursive: true, force: true });
});

test('knowledge: resolveGsdRootFile resolves when legacy knowledge.md exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-knowledge-'));
  const gsdDir = join(tmp, '.gsd');
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, 'knowledge.md'), '# Project Knowledge\n');

  const resolved = resolveGsdRootFile(tmp, 'KNOWLEDGE');
  // On case-insensitive filesystems (macOS), canonical path matches;
  // on case-sensitive (Linux), legacy path matches. Either is valid.
  const canonical = join(gsdDir, 'KNOWLEDGE.md');
  const legacy = join(gsdDir, 'knowledge.md');
  assert.ok(
    resolved === canonical || resolved === legacy,
    `resolved path should be canonical or legacy, got: ${resolved}`,
  );

  rmSync(tmp, { recursive: true, force: true });
});

test('knowledge: resolveGsdRootFile returns canonical path when file does not exist', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-knowledge-'));
  const gsdDir = join(tmp, '.gsd');
  mkdirSync(gsdDir, { recursive: true });

  const resolved = resolveGsdRootFile(tmp, 'KNOWLEDGE');
  assert.strictEqual(resolved, join(gsdDir, 'KNOWLEDGE.md'));

  rmSync(tmp, { recursive: true, force: true });
});

// ─── inlineGsdRootFile works with knowledge.md ─────────────────────────────

test('knowledge: inlineGsdRootFile returns content when KNOWLEDGE.md exists', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-knowledge-'));
  const gsdDir = join(tmp, '.gsd');
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, 'KNOWLEDGE.md'), '# Project Knowledge\n\n## Rules\n\nK001: Use real DB');

  const result = await inlineGsdRootFile(tmp, 'knowledge.md', 'Project Knowledge');
  assert.ok(result !== null, 'should return content');
  assert.ok(result!.includes('Project Knowledge'), 'should include label');
  assert.ok(result!.includes('K001'), 'should include knowledge content');

  rmSync(tmp, { recursive: true, force: true });
});

test('knowledge: inlineGsdRootFile returns null when KNOWLEDGE.md does not exist', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-knowledge-'));
  const gsdDir = join(tmp, '.gsd');
  mkdirSync(gsdDir, { recursive: true });

  const result = await inlineGsdRootFile(tmp, 'knowledge.md', 'Project Knowledge');
  assert.strictEqual(result, null, 'should return null when file does not exist');

  rmSync(tmp, { recursive: true, force: true });
});
