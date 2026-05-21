/**
 * Regression test for #3578 — note captures marked as executed
 *
 * Note-classified captures were stuck in "resolved but not executed" limbo
 * because executeTriageResolutions only handled inject/replan/defer. The fix
 * adds a filter for classification === "note" and calls markCaptureExecuted
 * for each matching capture.
 *
 * Behavior test — resolved note captures should be marked executed without
 * dispatching inject/replan work.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAllCaptures } from '../captures.ts';
import { executeTriageResolutions } from '../triage-resolution.ts';

describe('note captures executed in triage resolution (#3578)', () => {
  test('resolved note captures are stamped executed', () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-note-capture-'));
    try {
      mkdirSync(join(base, '.gsd'), { recursive: true });
      writeFileSync(join(base, '.gsd', 'CAPTURES.md'), [
        '# Captures',
        '',
        '### cap-note',
        '**Text:** Remember this',
        '**Captured:** 2026-01-01T00:00:00.000Z',
        '**Status:** resolved',
        '**Classification:** note',
        '**Resolution:** informational only',
        '**Resolved:** 2026-01-01T00:01:00.000Z',
        '',
      ].join('\n'));

      const result = executeTriageResolutions(base, 'M001', 'S01');
      const [capture] = loadAllCaptures(base);

      assert.equal(result.injected, 0);
      assert.equal(result.replanned, 0);
      assert.ok(result.actions.some((action) => action.includes('Note acknowledged: cap-note')));
      assert.equal(capture?.executed, true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
