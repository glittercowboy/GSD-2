// Project/App: GSD-2
// File Purpose: Validate-milestone tool handler for GSD workflow quality gates.

/**
 * validate-milestone handler — the core operation behind gsd_validate_milestone.
 *
 * Persists milestone validation results to the assessments table and
 * quality_gates table, renders VALIDATION.md to disk, and invalidates caches.
 *
 * #2945 Bug 4: Previously only wrote to assessments — quality_gates records
 * were never persisted, causing M002+ milestones to have zero gate records
 * despite passing validation.
 */

import { join } from "node:path";

import {
  transaction,
  insertAssessment,
  getMilestoneSlices,
  getMilestone,
  getArtifact,
} from "../gsd-db.js";
import { gsdProjectionRoot, clearPathCache, resolveSliceFile } from "../paths.js";
import { resolveCanonicalMilestoneRoot } from "../worktree-manager.js";
import { saveFile, clearParseCache, loadFile } from "../files.js";
import { invalidateStateCache } from "../state.js";
import { VALIDATION_VERDICTS, isValidMilestoneVerdict } from "../verdict-parser.js";
import { insertMilestoneValidationGates } from "../milestone-validation-gates.js";
import { logWarning } from "../workflow-logger.js";
import { UokGateRunner } from "../uok/gate-runner.js";
import { loadEffectiveGSDPreferences } from "../preferences.js";
import { resolveUokFlags } from "../uok/flags.js";
import { compactTextParts, hasBrowserEvidenceText, hasBrowserRequiredText } from "../browser-evidence.js";

export interface ValidateMilestoneParams {
  milestoneId: string;
  verdict: "pass" | "needs-attention" | "needs-remediation";
  remediationRound: number;
  successCriteriaChecklist: string;
  sliceDeliveryAudit: string;
  crossSliceIntegration: string;
  requirementCoverage: string;
  verificationClasses?: string;
  verdictRationale: string;
  remediationPlan?: string;
}

export interface ValidateMilestoneResult {
  milestoneId: string;
  verdict: string;
  validationPath: string;
  stale?: boolean;
}

export interface ValidateMilestoneOptions {
  uokGatesEnabled?: boolean;
  traceId?: string;
  turnId?: string;
}

function isVerificationNotApplicable(value: string): boolean {
  const v = (value ?? "").toLowerCase().trim().replace(/[.\s]+$/, "");
  if (!v || v === "none") return true;
  return /^(?:none(?:[\s._\u2014-]+[\s\S]*)?|n\/?a(?:[\s._\u2014-]+[\s\S]*)?|not[\s._-]+(?:applicable|required|needed|provided)(?:[\s._\u2014-]+[\s\S]*)?|no[\s._-]+operational[\s\S]*)$/i.test(v);
}

function getRequiredVerificationClasses(milestoneId: string): string[] {
  const milestone = getMilestone(milestoneId);
  if (!milestone) return [];

  const required: string[] = [];
  if (!isVerificationNotApplicable(milestone.verification_contract)) required.push("Contract");
  if (!isVerificationNotApplicable(milestone.verification_integration)) required.push("Integration");
  if (!isVerificationNotApplicable(milestone.verification_operational)) required.push("Operational");
  if (!isVerificationNotApplicable(milestone.verification_uat)) required.push("UAT");
  return required;
}

async function collectPersistedBrowserEvidence(basePath: string, milestoneId: string): Promise<string> {
  const chunks: string[] = [];
  for (const slice of getMilestoneSlices(milestoneId)) {
    const artifactPath = `milestones/${milestoneId}/slices/${slice.id}/${slice.id}-ASSESSMENT.md`;
    const artifact = getArtifact(artifactPath);
    if (artifact?.full_content) chunks.push(artifact.full_content);

    const assessmentPath = resolveSliceFile(basePath, milestoneId, slice.id, "ASSESSMENT");
    const assessmentContent = assessmentPath ? await loadFile(assessmentPath) : null;
    if (assessmentContent) chunks.push(assessmentContent);
  }
  return chunks.join("\n\n");
}

async function browserEvidenceGateRequiresAttention(
  params: ValidateMilestoneParams,
  basePath: string,
): Promise<boolean> {
  if (params.verdict !== "pass") return false;

  const milestone = getMilestone(params.milestoneId);
  const slices = getMilestoneSlices(params.milestoneId);
  const requirementText = compactTextParts([
    milestone?.vision,
    milestone?.success_criteria,
    milestone?.verification_uat,
    params.successCriteriaChecklist,
    params.verificationClasses,
    ...slices.flatMap((slice) => [
      slice.demo,
      slice.goal,
      slice.success_criteria,
      slice.full_uat_md,
    ]),
  ]);
  if (!hasBrowserRequiredText(requirementText)) return false;

  const persistedEvidence = await collectPersistedBrowserEvidence(basePath, params.milestoneId);
  const validationEvidence = compactTextParts([
    params.successCriteriaChecklist,
    params.verificationClasses,
    params.verdictRationale,
    params.remediationPlan,
  ]);
  return !hasBrowserEvidenceText(`${persistedEvidence}\n\n${validationEvidence}`);
}

function applyBrowserEvidenceGate(params: ValidateMilestoneParams): ValidateMilestoneParams {
  const note = "Browser evidence gate: Browser-observable acceptance criteria were detected, but no persisted ASSESSMENT or validation evidence recorded browser actions with assertions. Downgraded from pass to needs-attention.";
  return {
    ...params,
    verdict: "needs-attention",
    verdictRationale: params.verdictRationale.trim()
      ? `${params.verdictRationale.trim()}\n\n${note}`
      : note,
  };
}

function renderValidationMarkdown(params: ValidateMilestoneParams): string {
  let md = `---
verdict: ${params.verdict}
remediation_round: ${params.remediationRound}
---

# Milestone Validation: ${params.milestoneId}

## Success Criteria Checklist
${params.successCriteriaChecklist}

## Slice Delivery Audit
${params.sliceDeliveryAudit}

## Cross-Slice Integration
${params.crossSliceIntegration}

## Requirement Coverage
${params.requirementCoverage}

${params.verificationClasses ? `## Verification Class Compliance
${params.verificationClasses}

` : ""}
## Verdict Rationale
${params.verdictRationale}
`;

  if (params.verdict === "needs-remediation" && params.remediationPlan) {
    md += `\n## Remediation Plan\n${params.remediationPlan}\n`;
  }

  return md;
}

export async function handleValidateMilestone(
  params: ValidateMilestoneParams,
  basePath: string,
  opts?: ValidateMilestoneOptions,
): Promise<ValidateMilestoneResult | { error: string }> {
  if (!params.milestoneId || typeof params.milestoneId !== "string" || params.milestoneId.trim() === "") {
    return { error: "milestoneId is required and must be a non-empty string" };
  }
  if (!isValidMilestoneVerdict(params.verdict)) {
    return { error: `verdict must be one of: ${VALIDATION_VERDICTS.join(", ")}` };
  }
  const requiredClasses = getRequiredVerificationClasses(params.milestoneId);
  if (requiredClasses.length > 0) {
    const verificationClasses = params.verificationClasses ?? "";
    const missingClass = requiredClasses.find(
      (className) => !new RegExp(`\\b${className}\\b`, "i").test(verificationClasses),
    );
    if (missingClass) {
      return {
        error: `verificationClasses must include canonical row "${missingClass}" because this milestone planned ${missingClass.toLowerCase()} verification`,
      };
    }
  }

  const artifactBasePath = resolveCanonicalMilestoneRoot(basePath, params.milestoneId);
  const effectiveParams = await browserEvidenceGateRequiresAttention(params, artifactBasePath)
    ? applyBrowserEvidenceGate(params)
    : params;

  // ── Resolve paths and render markdown ────────────────────────────────
  // #4761: route through the canonical-root resolver so that when a live
  // worktree exists for this milestone, validation reads/writes the
  // worktree's artifacts instead of stale project-root state.
  const validationMd = renderValidationMarkdown(effectiveParams);
  const validationPath = join(
    gsdProjectionRoot(artifactBasePath),
    "milestones",
    effectiveParams.milestoneId,
    `${effectiveParams.milestoneId}-VALIDATION.md`,
  );

  // ── DB write first — matches complete-task/complete-slice pattern ───
  // Write DB before disk so a crash between the two leaves a recoverable
  // state: the DB row exists but the file is missing, which projection
  // rendering can regenerate. The inverse (file exists, no DB row) is
  // harder to detect and recover from (#2725).
  const validatedAt = new Date().toISOString();
  const slices = getMilestoneSlices(effectiveParams.milestoneId);
  const gateSliceId = slices.length > 0 ? slices[0].id : "_milestone";

  transaction(() => {
    insertAssessment({
      path: validationPath,
      milestoneId: effectiveParams.milestoneId,
      sliceId: null,
      taskId: null,
      status: effectiveParams.verdict,
      scope: 'milestone-validation',
      fullContent: validationMd,
    });

    // #2945 Bug 4: persist quality_gates records alongside the assessment.
    // Previously only the assessment was written, leaving M002+ milestones
    // with zero quality_gate records despite passing validation.
    insertMilestoneValidationGates(
      effectiveParams.milestoneId,
      gateSliceId,
      effectiveParams.verdict,
      validatedAt,
    );
  });

  // ── Filesystem render (outside transaction) ────────────────────────────
  let projectionStale = false;
  try {
    await saveFile(validationPath, validationMd);
  } catch (renderErr) {
    projectionStale = true;
    logWarning("projection", `validate_milestone projection write failed for ${effectiveParams.milestoneId}; DB validation remains committed`, {
      error: (renderErr as Error).message,
    });
  }

  invalidateStateCache();
  clearPathCache();
  clearParseCache();

  const prefs = loadEffectiveGSDPreferences()?.preferences;
  const gatesEnabled = opts?.uokGatesEnabled ?? resolveUokFlags(prefs).gates;
  if (gatesEnabled) {
    try {
      const gateRunner = new UokGateRunner();
      const nonPassVerdict = effectiveParams.verdict !== "pass";
      gateRunner.register({
        id: "milestone-validation-gates",
        type: "verification",
        execute: async () => ({
          outcome: nonPassVerdict ? "manual-attention" : "pass",
          failureClass: nonPassVerdict ? "manual-attention" : "none",
          rationale: `milestone validation verdict: ${effectiveParams.verdict}`,
          findings: nonPassVerdict
            ? [effectiveParams.verdictRationale, effectiveParams.remediationPlan ?? ""].filter(Boolean).join("\n")
            : "",
        }),
      });
      await gateRunner.run("milestone-validation-gates", {
        basePath: artifactBasePath,
        traceId: opts?.traceId ?? `validate-milestone:${effectiveParams.milestoneId}`,
        turnId: opts?.turnId ?? `${effectiveParams.milestoneId}:validate`,
        milestoneId: effectiveParams.milestoneId,
        sliceId: gateSliceId,
        unitType: "validate-milestone",
        unitId: effectiveParams.milestoneId,
      });
    } catch (err) {
      logWarning(
        "tool",
        `validate_milestone — failed to persist UOK gate result: ${(err as Error).message}`,
      );
    }
  }

  return {
    milestoneId: effectiveParams.milestoneId,
    verdict: effectiveParams.verdict,
    validationPath,
    ...(projectionStale ? { stale: true } : {}),
  };
}
