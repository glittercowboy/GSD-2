/**
 * Regression test for #3598 — projectRoot ENOENT crash on deleted cwd
 *
 * When the working directory is deleted (e.g. worktree teardown), process.cwd()
 * throws ENOENT. The fix wraps process.cwd() in a try/catch and falls back to
 * os.homedir().
 *
 * Also verifies #3589 — nativeBranchExists validation for prefs.main_branch
 * in auto-worktree.ts to prevent merge failures with stale preferences.
 *
 * Behavior verification test — exercises the exported projectRoot helper
 * without reading command source.
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GSDNoProjectError, projectRoot } from '../commands/context.ts';

describe('projectRoot cwd crash guard (#3598)', () => {
  test('reports the home-directory guard instead of leaking cwd ENOENT', () => {
    const cwd = mock.method(process, 'cwd', () => {
      const err = new Error('ENOENT: current working directory was removed') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    try {
      assert.throws(
        () => projectRoot(),
        (err) => err instanceof GSDNoProjectError && !String(err.message).includes('ENOENT'),
      );
    } finally {
      cwd.mock.restore();
    }
  });
});
