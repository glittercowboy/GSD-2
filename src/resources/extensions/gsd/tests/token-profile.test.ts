// GSD-2 — Token profile behavior tests.

import test from "node:test";
import assert from "node:assert/strict";

import { validatePreferences } from "../preferences-validation.ts";
import {
  getProfileTierMap,
  resolveProfileDefaults,
} from "../preferences-models.ts";

test("profile tier maps define provider-agnostic complexity tiers", () => {
  const expectedPhaseKeys = ["completion", "execution", "execution_simple", "planning", "research", "subagent"];
  const validTiers = new Set(["light", "standard", "heavy"]);

  for (const profile of ["budget", "balanced", "quality"] as const) {
    const tierMap = getProfileTierMap(profile);
    assert.deepEqual(Object.keys(tierMap).sort(), expectedPhaseKeys);
    for (const tier of Object.values(tierMap)) {
      assert.ok(validTiers.has(tier));
      assert.doesNotMatch(tier, /claude-|gpt-|gemini-/);
    }
  }
});

test("profile defaults resolve to available OpenAI models when only OpenAI is available", () => {
  const defaults = resolveProfileDefaults("balanced", ["gpt-4o", "gpt-4o-mini"]);
  assert.ok(defaults.models);
  for (const modelId of Object.values(defaults.models!)) {
    assert.equal(typeof modelId, "string");
    assert.doesNotMatch(String(modelId), /^claude-/);
  }
});

test("budget, balanced, and quality profiles set expected phase skip defaults", () => {
  assert.deepEqual(resolveProfileDefaults("budget").phases, {
    skip_research: true,
    skip_reassess: true,
    skip_slice_research: true,
    skip_milestone_validation: true,
  });
  assert.deepEqual(resolveProfileDefaults("balanced").phases, {
    skip_research: true,
    skip_reassess: true,
    skip_slice_research: true,
  });
  assert.deepEqual(resolveProfileDefaults("quality").phases, {
    skip_research: true,
    skip_slice_research: true,
    skip_reassess: true,
  });
});

test("burn-max preserves user model choices and enables full context defaults", () => {
  const defaults = resolveProfileDefaults("burn-max");
  assert.equal(defaults.models, undefined);
  assert.equal(defaults.dynamic_routing?.enabled, false);
  assert.equal(defaults.context_selection, "full");
  assert.deepEqual(defaults.phases, {
    skip_research: false,
    skip_slice_research: false,
    skip_reassess: false,
    skip_milestone_validation: false,
    reassess_after_slice: true,
  });
});

test("validatePreferences accepts token_profile and strict phase booleans", () => {
  const result = validatePreferences({
    token_profile: "quality",
    phases: {
      skip_research: true,
      skip_reassess: "false" as any,
      skip_slice_research: true,
      reassess_after_slice: false,
    },
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.preferences.token_profile, "quality");
  assert.deepEqual(result.preferences.phases, {
    skip_research: true,
    skip_reassess: false,
    skip_slice_research: true,
    reassess_after_slice: false,
  });
});

test("validatePreferences rejects invalid token profiles and warns on unknown phase keys", () => {
  const result = validatePreferences({
    token_profile: "fast" as any,
    phases: {
      skip_research: true,
      unknown_phase: true,
    } as any,
  });

  assert.ok(result.errors.some((error) => error.includes("token_profile")));
  assert.ok(result.warnings.some((warning) => warning.includes("unknown phases key")));
});
