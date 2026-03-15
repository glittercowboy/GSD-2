/**
 * preferences-git.test.ts — Validates git preference parsing for isolation
 * plus the deprecated merge_to_main warning.
 */

import { createTestContext } from "./test-helpers.ts";
import { validatePreferences } from "../preferences.ts";

const { assertEq, assertTrue, report } = createTestContext();

async function main(): Promise<void> {
  console.log("\n=== git.isolation validation ===");

  {
    const { preferences, errors, warnings } = validatePreferences({ git: { isolation: "worktree" } });
    assertEq(errors.length, 0, "isolation: worktree — no errors");
    assertEq(warnings.length, 0, "isolation: worktree — no warnings");
    assertEq(preferences.git?.isolation, "worktree", "isolation: worktree — stored");
  }
  {
    const { preferences, errors, warnings } = validatePreferences({ git: { isolation: "branch" } });
    assertEq(errors.length, 0, "isolation: branch — no errors");
    assertEq(warnings.length, 0, "isolation: branch — no warnings");
    assertEq(preferences.git?.isolation, "branch", "isolation: branch — stored");
  }
  {
    const { errors } = validatePreferences({ git: { isolation: "bad-mode" as never } });
    assertTrue(errors.some(error => error.includes("git.isolation")), "isolation: invalid value — produces error");
  }

  {
    const { preferences, warnings } = validatePreferences({ git: { auto_push: true } });
    assertEq(warnings.length, 0, "isolation: undefined — no warnings");
    assertEq(preferences.git?.isolation, undefined, "isolation: undefined — not set");
  }

  console.log("\n=== git.merge_to_main deprecated ===");

  // Any value produces a deprecation warning
  {
    const { warnings } = validatePreferences({ git: { merge_to_main: "milestone" } });
    assertTrue(warnings.length > 0, "merge_to_main: milestone — produces deprecation warning");
    assertTrue(warnings[0].includes("deprecated"), "merge_to_main: milestone — warning mentions deprecated");
  }
  {
    const { warnings } = validatePreferences({ git: { merge_to_main: "slice" } });
    assertTrue(warnings.length > 0, "merge_to_main: slice — produces deprecation warning");
    assertTrue(warnings[0].includes("deprecated"), "merge_to_main: slice — warning mentions deprecated");
  }

  // Undefined passes through without warning
  {
    const { preferences, warnings } = validatePreferences({ git: { auto_push: true } });
    assertEq(warnings.length, 0, "merge_to_main: undefined — no warnings");
    assertEq(preferences.git?.merge_to_main, undefined, "merge_to_main: undefined — not set");
  }

  console.log("\n=== isolation + merge_to_main together ===");
  {
    const { preferences, warnings, errors } = validatePreferences({
      git: { isolation: "worktree", merge_to_main: "slice" },
    });
    assertEq(errors.length, 0, "combined fields — no errors");
    assertEq(preferences.git?.isolation, "worktree", "combined fields — isolation stored");
    assertEq(warnings.length, 1, "combined fields — only merge_to_main warns");
    assertTrue(warnings.some(w => w.includes("merge_to_main")), "one warning mentions merge_to_main");
  }

  report();
}

main();
