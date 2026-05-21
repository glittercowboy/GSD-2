// Project/App: GSD-2
// File Purpose: Tests for step-mode completion messages in auto-post-unit.

import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";

import {
  buildStepCompleteOutcome,
  buildStepCompleteMessage,
  setStepCompleteFallbackSurface,
  setStepCompleteSurface,
  shouldReturnStepWizardAfterUnit,
  STEP_COMPLETE_FALLBACK_MESSAGE,
} from "../auto-post-unit.ts";
import type { GSDState } from "../types.ts";

function makeState(overrides: Partial<GSDState>): GSDState {
  return {
    activeMilestone: null,
    activeSlice: null,
    activeTask: null,
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
    ...overrides,
  };
}

function plain(message: string): string {
  return stripVTControlCharacters(message);
}

test("buildStepCompleteMessage: terminal milestone completion leaves the roll-up as the only closeout message", () => {
  const msg = buildStepCompleteMessage(makeState({ phase: "complete" }));
  assert.equal(msg, null);
});

test("buildStepCompleteMessage: mid-flight step renders only the completion receipt", () => {
  const state = makeState({
    phase: "executing",
    activeSlice: { id: "S01", title: "Core" },
    activeTask: { id: "T03", title: "Wire notify" },
  });
  const msg = buildStepCompleteMessage(state);
  assert.ok(msg);
  assert.match(msg, /\x1b\[/);
  const text = plain(msg);
  assert.match(text, /╭─ ✓ GSD Step Complete/);
  assert.match(text, /Completed: Step complete/);
  assert.match(text, /^    ╭─/m);
  assert.doesNotMatch(text, /^          ╭─/m);
  assert.doesNotMatch(text, /╭─ Next step/);
  assert.doesNotMatch(text, /Next: Execute T03: Wire notify/);
  assert.doesNotMatch(text, /\/clear/);
  assert.doesNotMatch(text, /Continue: \/gsd next/);
  assert.doesNotMatch(text, /Auto-run: \/gsd auto/);
  assert.doesNotMatch(text, /\/gsd next/);
  assert.doesNotMatch(text, /\/gsd auto/);
  assert.doesNotMatch(text, /\n│\n/);
  assert.doesNotMatch(text, /Ctrl\+N/);
});

test("buildStepCompleteMessage: unknown phase still renders only the completion receipt", () => {
  // Cast to bypass Phase union so we exercise the default branch of describeNextUnit.
  const state = makeState({ phase: "totally-unknown" as unknown as GSDState["phase"] });
  const msg = buildStepCompleteMessage(state);
  assert.ok(msg);
  const text = plain(msg);
  assert.match(text, /╭─ ✓ GSD Step Complete/);
  assert.doesNotMatch(text, /╭─ Next step/);
  assert.doesNotMatch(text, /Next: Continue/);
  assert.doesNotMatch(text, /\/clear/);
});

test("STEP_COMPLETE_FALLBACK_MESSAGE: used when deriveState throws, stays a receipt without command hints", () => {
  const text = plain(STEP_COMPLETE_FALLBACK_MESSAGE);
  assert.match(text, /╭─ ✓ GSD Step Complete/);
  assert.doesNotMatch(text, /╭─ Next step/);
  assert.doesNotMatch(text, /\/clear/);
  assert.doesNotMatch(text, /\/gsd next/);
  assert.doesNotMatch(text, /\/gsd auto/);
  assert.doesNotMatch(text, /Next: Continue/);
  assert.doesNotMatch(text, /Ctrl\+N/);
});

test("buildStepCompleteOutcome: durable handoff includes next commands", () => {
  const state = makeState({
    phase: "executing",
    activeSlice: { id: "S01", title: "Core" },
    activeTask: { id: "T03", title: "Wire notify" },
  });

  const outcome = buildStepCompleteOutcome(state, {
    type: "complete-slice",
    id: "M011/S01",
    startedAt: 123,
  });

  assert.ok(outcome);
  assert.equal(outcome.status, "step");
  assert.equal(outcome.title, "Step complete");
  assert.match(outcome.detail ?? "", /Execute T03: Wire notify/);
  assert.equal(outcome.unitLabel, "completing M011/S01");
  assert.equal(outcome.nextAction, "Advance one step, or resume automatic mode.");
  assert.doesNotMatch(outcome.nextAction, /\/gsd/);
  assert.deepEqual(outcome.commands, ["/gsd next", "/gsd auto", "/gsd status for overview"]);
});

test("setStepCompleteSurface: clears stale progress and installs durable outcome panel", () => {
  const calls: Array<[string, unknown]> = [];
  const state = makeState({
    phase: "executing",
    activeSlice: { id: "S01", title: "Core" },
    activeTask: { id: "T03", title: "Wire notify" },
  });

  const message = setStepCompleteSurface(
    {
      hasUI: true,
      ui: {
        setWidget(key: string, value: unknown) {
          calls.push([key, value]);
        },
      },
    } as any,
    state,
    { type: "complete-slice", id: "M011/S01", startedAt: 123 },
  );

  assert.ok(message);
  assert.match(plain(message), /╭─ ✓ GSD Step Complete/);
  assert.ok(
    calls.some(([key, value]) => key === "gsd-progress" && value === undefined),
    "step completion must clear the live progress widget so stale provider-idle state is not preserved",
  );
  const outcome = calls.find(([key, value]) => key === "gsd-outcome" && typeof value === "function");
  assert.ok(outcome, "step completion must install the durable outcome widget");

  const component = (outcome[1] as any)(
    { requestRender() {} },
    { fg: (_color: string, text: string) => text, bold: (text: string) => text },
  );
  const output = component.render(120).join("\n");
  assert.match(output, /Step complete/);
  assert.match(output, /completing M011\/S01/);
  assert.match(output, /Advance one step, or resume automatic mode/);
  assert.match(output, /\/gsd next/);
  assert.match(output, /\/gsd auto/);
});

test("setStepCompleteSurface: execute-task renders only the task completion receipt", () => {
  const calls: Array<[string, unknown]> = [];
  const state = makeState({
    phase: "planning",
    activeSlice: { id: "S02", title: "Follow-up" },
  });

  const message = setStepCompleteSurface(
    {
      hasUI: true,
      ui: {
        setWidget(key: string, value: unknown) {
          calls.push([key, value]);
        },
      },
    } as any,
    state,
    { type: "execute-task", id: "M011/S01/T02", startedAt: 123 },
  );

  assert.ok(message);
  const text = plain(message);
  assert.match(text, /╭─ ✓ GSD Task Complete/);
  assert.match(text, /Completed: executing M011\/S01\/T02/);
  assert.match(text, /^    ╭─/m);
  assert.doesNotMatch(text, /^          ╭─/m);
  assert.doesNotMatch(text, /╭─ Next step/);
  assert.doesNotMatch(text, /Next: Plan S02: Follow-up/);
  assert.doesNotMatch(text, /│/);
});

test("setStepCompleteFallbackSurface: fallback also clears progress and points to status", () => {
  const calls: Array<[string, unknown]> = [];
  const message = setStepCompleteFallbackSurface(
    {
      hasUI: true,
      ui: {
        setWidget(key: string, value: unknown) {
          calls.push([key, value]);
        },
      },
    } as any,
    { type: "complete-slice", id: "M011/S01", startedAt: 123 },
  );

  assert.match(plain(message), /╭─ ✓ GSD Step Complete/);
  assert.ok(calls.some(([key, value]) => key === "gsd-progress" && value === undefined));
  const outcome = calls.find(([key, value]) => key === "gsd-outcome" && typeof value === "function");
  assert.ok(outcome);
  const component = (outcome[1] as any)(
    { requestRender() {} },
    { fg: (_color: string, text: string) => text, bold: (text: string) => text },
  );
  const output = component.render(120).join("\n");
  assert.match(output, /\/gsd status/);
  assert.match(output, /\/gsd next/);
  assert.match(output, /\/gsd auto/);
});

test("shouldReturnStepWizardAfterUnit: terminal milestone completion continues to merge-back path", () => {
  assert.equal(shouldReturnStepWizardAfterUnit("complete-milestone", "complete"), false);
  assert.equal(shouldReturnStepWizardAfterUnit("complete-milestone", null), false);
  assert.equal(shouldReturnStepWizardAfterUnit("execute-task", "complete"), false);
  assert.equal(shouldReturnStepWizardAfterUnit("execute-task", "executing"), true);
});
