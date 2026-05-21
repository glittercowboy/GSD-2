/**
 * dashboard-custom-engine.test.ts — custom-step dashboard labels.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { unitVerb, unitPhaseLabel } from "../auto-dashboard.js";
import { unitLabel } from "../dashboard-overlay.ts";

describe("Dashboard custom-engine: unitLabel and related helpers", () => {
  it('unitVerb("custom-step") returns "executing workflow step"', () => {
    assert.equal(unitVerb("custom-step"), "executing workflow step");
  });

  it('unitPhaseLabel("custom-step") returns "WORKFLOW"', () => {
    assert.equal(unitPhaseLabel("custom-step"), "WORKFLOW");
  });

  it('unitLabel("custom-step") returns "Workflow Step"', () => {
    assert.equal(unitLabel("custom-step"), "Workflow Step");
  });
});
