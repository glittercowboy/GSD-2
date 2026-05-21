/**
 * Regression test for #3693 — suppress repeated frontmatter parse warnings
 *
 * parseFrontmatterBlock was logging a YAML parse warning on every call.
 * The fix adds a _warnedFrontmatterParse flag so the warning only fires once.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { _resetParseWarningFlag, parsePreferencesMarkdown } from "../preferences.ts";
import { drainLogs } from "../workflow-logger.ts";

describe('frontmatter parse noise suppression (#3693)', () => {
  test('invalid frontmatter emits one warning per reset', () => {
    _resetParseWarningFlag();
    drainLogs();

    const invalidPrefs = [
      "---",
      "models: [unterminated",
      "---",
    ].join("\n");

    assert.deepEqual(parsePreferencesMarkdown(invalidPrefs), {});
    assert.deepEqual(parsePreferencesMarkdown(invalidPrefs), {});

    const warnings = drainLogs().filter((entry) =>
      entry.severity === "warn" &&
      entry.component === "guided" &&
      entry.message.includes("YAML parse error in preferences frontmatter")
    );
    assert.equal(warnings.length, 1);
  });
});
