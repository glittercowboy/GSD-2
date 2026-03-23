import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const promptPath = join(process.cwd(), "src/resources/extensions/gsd/prompts/discuss.md");
const discussPrompt = readFileSync(promptPath, "utf-8");

const guidedPath = join(process.cwd(), "src/resources/extensions/gsd/prompts/guided-discuss-milestone.md");
const guidedPrompt = readFileSync(guidedPath, "utf-8");

test("discuss prompt: resilient vision framing", () => {
  const hardenedPattern = /Say exactly:\s*"What's the vision\?"/;
  assert.ok(!hardenedPattern.test(discussPrompt), "prompt no longer uses exact-verbosity lock");
  assert.ok(discussPrompt.includes('Ask: "What\'s the vision?" once'), "prompt asks for vision exactly once");
  assert.ok(discussPrompt.includes("Special handling"), "prompt documents special handling");
  assert.ok(discussPrompt.includes('instead of repeating "What\'s the vision?"'), "prompt forbids repeating");
});

test("discuss prompt: dimension-specific depth verification IDs present", () => {
  assert.ok(
    discussPrompt.includes("depth_verification_what"),
    "prompt contains depth_verification_what"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_risks"),
    "prompt contains depth_verification_risks"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_dependencies"),
    "prompt contains depth_verification_dependencies"
  );
});

test("discuss prompt: backward compat note for bare depth_verification", () => {
  assert.ok(
    discussPrompt.includes("Bare `depth_verification`"),
    "prompt mentions bare depth_verification backward compat"
  );
  assert.ok(
    discussPrompt.includes("backward compatibility"),
    "prompt references backward compatibility"
  );
});

test("discuss prompt: multi-milestone uses dimension-specific IDs", () => {
  // Multi-milestone section should reference dimension-specific patterns with milestone IDs
  assert.ok(
    discussPrompt.includes("depth_verification_what_M002"),
    "multi-milestone section shows depth_verification_what_M002 example"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_risks_M002"),
    "multi-milestone section shows depth_verification_risks_M002 example"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_dependencies_M002"),
    "multi-milestone section shows depth_verification_dependencies_M002 example"
  );
});

test("discuss prompt: no remnant single-confirmation pattern", () => {
  // The old single-confirmation example should not remain
  assert.ok(
    !discussPrompt.includes("depth_verification_confirm"),
    "old depth_verification_confirm example removed"
  );
  assert.ok(
    !discussPrompt.includes('"Did I capture the depth right?"'),
    "old single-question example removed"
  );
});

// --- Deep Abstraction Pass contract tests ---

test("discuss prompt: Deep Abstraction Pass section exists", () => {
  assert.ok(
    discussPrompt.includes("## Deep Abstraction Pass"),
    "discuss.md contains '## Deep Abstraction Pass' section header"
  );
});

test("discuss prompt: Deep Abstraction Pass has confidence tags", () => {
  assert.ok(discussPrompt.includes("CLEAR"), "discuss.md contains CLEAR confidence tag");
  assert.ok(discussPrompt.includes("INTERPRETED"), "discuss.md contains INTERPRETED confidence tag");
  assert.ok(discussPrompt.includes("UNCERTAIN"), "discuss.md contains UNCERTAIN confidence tag");
});

test("discuss prompt: Deep Abstraction Pass references deep_abstraction preference", () => {
  assert.ok(
    discussPrompt.includes("deep_abstraction"),
    "discuss.md references deep_abstraction preference"
  );
  assert.ok(
    discussPrompt.includes("deep_abstraction_threshold"),
    "discuss.md references deep_abstraction_threshold preference"
  );
});

test("discuss prompt: Deep Abstraction Pass uses batched ask_user_questions", () => {
  // The section between Deep Abstraction Pass and Vision Mapping should reference batched confirmations
  const dapStart = discussPrompt.indexOf("## Deep Abstraction Pass");
  const vmStart = discussPrompt.indexOf("## Vision Mapping");
  const dapSection = discussPrompt.slice(dapStart, vmStart);
  assert.ok(
    dapSection.includes("ask_user_questions"),
    "Deep Abstraction Pass section references ask_user_questions"
  );
  assert.ok(
    dapSection.includes("batches of ~3"),
    "Deep Abstraction Pass section specifies batches of ~3"
  );
});

test("discuss prompt: Deep Abstraction Pass includes gap surfacing", () => {
  const dapStart = discussPrompt.indexOf("## Deep Abstraction Pass");
  const vmStart = discussPrompt.indexOf("## Vision Mapping");
  const dapSection = discussPrompt.slice(dapStart, vmStart);
  assert.ok(
    dapSection.includes("gap") || dapSection.includes("Gap"),
    "Deep Abstraction Pass section includes gap surfacing"
  );
});

// --- Research Calibration contract tests ---

test("discuss prompt: Research Calibration section exists", () => {
  assert.ok(
    discussPrompt.includes("## Research Calibration"),
    "discuss.md contains '## Research Calibration' section header"
  );
});

test("discuss prompt: Research Calibration references research_depth", () => {
  const rcStart = discussPrompt.indexOf("## Research Calibration");
  const rcEnd = discussPrompt.indexOf("## Capability Contract");
  const rcSection = discussPrompt.slice(rcStart, rcEnd);
  assert.ok(
    rcSection.includes("research_depth"),
    "Research Calibration section references research_depth"
  );
  assert.ok(
    rcSection.includes("research_signals"),
    "Research Calibration section references research_signals"
  );
  assert.ok(
    rcSection.includes("research_focus"),
    "Research Calibration section references research_focus"
  );
});

test("discuss prompt: Research Calibration recommends tiers", () => {
  const rcStart = discussPrompt.indexOf("## Research Calibration");
  const rcEnd = discussPrompt.indexOf("## Capability Contract");
  const rcSection = discussPrompt.slice(rcStart, rcEnd);
  for (const tier of ["skip", "light", "standard", "deep"]) {
    assert.ok(
      rcSection.includes(`**${tier}**`),
      `Research Calibration section contains ${tier} tier`
    );
  }
});

// --- Guided prompt contract tests ---

test("guided prompt: multi-dimension depth verification IDs present", () => {
  assert.ok(
    guidedPrompt.includes("depth_verification_what"),
    "guided prompt contains depth_verification_what"
  );
  assert.ok(
    guidedPrompt.includes("depth_verification_risks"),
    "guided prompt contains depth_verification_risks"
  );
  assert.ok(
    guidedPrompt.includes("depth_verification_dependencies"),
    "guided prompt contains depth_verification_dependencies"
  );
});

test("guided prompt: no legacy depth_verification_confirm", () => {
  assert.ok(
    !guidedPrompt.includes("depth_verification_confirm"),
    "guided prompt does not contain legacy depth_verification_confirm"
  );
});

test("guided prompt: contains Deep Abstraction instructions", () => {
  assert.ok(
    guidedPrompt.includes("Deep Abstraction"),
    "guided prompt contains Deep Abstraction instructions"
  );
  assert.ok(
    guidedPrompt.includes("CLEAR"),
    "guided prompt references CLEAR confidence tag"
  );
  assert.ok(
    guidedPrompt.includes("INTERPRETED"),
    "guided prompt references INTERPRETED confidence tag"
  );
  assert.ok(
    guidedPrompt.includes("UNCERTAIN"),
    "guided prompt references UNCERTAIN confidence tag"
  );
});

test("guided prompt: contains Research Calibration instructions", () => {
  assert.ok(
    guidedPrompt.includes("research_depth") || guidedPrompt.includes("Research Calibration") || guidedPrompt.includes("Research calibration"),
    "guided prompt references research calibration"
  );
  assert.ok(
    guidedPrompt.includes("research_focus"),
    "guided prompt references research_focus frontmatter field"
  );
});
