// Project/App: GSD-2
// File Purpose: Handles manual milestone validation verdict overrides.

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { loadFile } from "./files.js";
import { resolveMilestoneFile } from "./paths.js";
import { deriveState } from "./state.js";
import { executeValidateMilestone } from "./tools/workflow-tool-executors.js";
import { ensureDbOpen } from "./bootstrap/dynamic-tools.js";
import { getLatestAssessmentByScope } from "./gsd-db.js";
import {
  VALIDATION_VERDICTS,
  extractVerdict,
  isValidMilestoneVerdict,
  type ValidationVerdict,
} from "./verdict-parser.js";

const USAGE =
  'Usage: /gsd verdict <pass|needs-attention|needs-remediation> [--milestone Mxxx] [--rationale "..."]';

interface ParsedArgs {
  verdict?: ValidationVerdict;
  milestoneId?: string;
  rationale?: string;
}

interface ParsedValidation {
  verdict: string | undefined;
  remediationRound: number;
  successCriteriaChecklist: string;
  sliceDeliveryAudit: string;
  crossSliceIntegration: string;
  requirementCoverage: string;
  verificationClasses?: string;
  verdictRationale: string;
  remediationPlan?: string;
}

interface ExistingValidation {
  content: string;
  source: string;
}

function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    tokens.push(match[1] ?? match[2]);
  }
  return tokens;
}

function parseArgs(raw: string): ParsedArgs | { error: string } {
  const tokens = tokenize(raw);
  const out: ParsedArgs = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--milestone") {
      const next = tokens[++i];
      if (!next) return { error: "--milestone requires a milestone ID" };
      out.milestoneId = next;
    } else if (t === "--rationale") {
      const next = tokens[++i];
      if (next == null) return { error: "--rationale requires a value" };
      out.rationale = next;
    } else if (!out.verdict) {
      if (!isValidMilestoneVerdict(t)) {
        return {
          error: `Invalid verdict "${t}". Must be one of: ${VALIDATION_VERDICTS.join(", ")}`,
        };
      }
      out.verdict = t;
    } else {
      return { error: `Unexpected argument: ${t}` };
    }
  }
  return out;
}

function extractRemediationRound(content: string): number {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return 0;
  const m = fm[1].match(/^remediation_round:\s*(\d+)/im);
  return m ? Number.parseInt(m[1], 10) : 0;
}

function extractSection(content: string, heading: string): string | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match section bodies bounded by the next "## " heading or end-of-string.
  // Leading "\n" prefix lets a single pattern handle first-line headings too.
  // No /m flag — we want `$` to mean end-of-string, not end-of-line.
  const re = new RegExp(`\\n## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = ("\n" + content).match(re);
  if (!m) return undefined;
  return m[1].replace(/\s+$/, "");
}

export function parseValidationFile(content: string): ParsedValidation {
  return {
    verdict: extractVerdict(content),
    remediationRound: extractRemediationRound(content),
    successCriteriaChecklist: extractSection(content, "Success Criteria Checklist") ?? "",
    sliceDeliveryAudit: extractSection(content, "Slice Delivery Audit") ?? "",
    crossSliceIntegration: extractSection(content, "Cross-Slice Integration") ?? "",
    requirementCoverage: extractSection(content, "Requirement Coverage") ?? "",
    verificationClasses: extractSection(content, "Verification Class Compliance"),
    verdictRationale: extractSection(content, "Verdict Rationale") ?? "",
    remediationPlan: extractSection(content, "Remediation Plan"),
  };
}

async function loadExistingValidation(
  basePath: string,
  milestoneId: string,
): Promise<ExistingValidation | null> {
  const validationPath = resolveMilestoneFile(basePath, milestoneId, "VALIDATION");
  if (validationPath) {
    const content = await loadFile(validationPath);
    if (content) return { content, source: validationPath };
  }

  await ensureDbOpen(basePath);
  const assessment = getLatestAssessmentByScope(milestoneId, "milestone-validation");
  const content = typeof assessment?.full_content === "string"
    ? assessment.full_content
    : typeof assessment?.fullContent === "string"
      ? assessment.fullContent
      : "";
  if (!content.trim()) return null;

  const source = typeof assessment?.path === "string"
    ? assessment.path
    : `DB assessment: ${milestoneId}/milestone-validation`;
  return { content, source };
}

export async function handleVerdict(
  rawArgs: string,
  ctx: ExtensionCommandContext,
  basePath: string,
): Promise<void> {
  if (!rawArgs.trim()) {
    ctx.ui.notify(USAGE, "warning");
    return;
  }

  const parsed = parseArgs(rawArgs);
  if ("error" in parsed) {
    ctx.ui.notify(`${parsed.error}\n${USAGE}`, "warning");
    return;
  }
  if (!parsed.verdict) {
    ctx.ui.notify(USAGE, "warning");
    return;
  }

  let milestoneId = parsed.milestoneId;
  if (!milestoneId) {
    const state = await deriveState(basePath);
    if (!state.activeMilestone) {
      ctx.ui.notify(
        "No active milestone — pass --milestone Mxxx to target a specific milestone.",
        "warning",
      );
      return;
    }
    milestoneId = state.activeMilestone.id;
  }

  const existingValidation = await loadExistingValidation(basePath, milestoneId);
  if (!existingValidation) {
    ctx.ui.notify(
      `No milestone validation found for ${milestoneId}. Run /gsd auto to validate first, then retry /gsd verdict.`,
      "warning",
    );
    return;
  }

  const current = parseValidationFile(existingValidation.content);

  if (parsed.verdict !== "pass" && !parsed.rationale) {
    ctx.ui.notify(
      `--rationale is required when overriding to ${parsed.verdict}.`,
      "warning",
    );
    return;
  }

  const verdictRationale =
    parsed.rationale ?? "Manually overridden via /gsd verdict";

  const result = await executeValidateMilestone(
    {
      milestoneId,
      verdict: parsed.verdict,
      remediationRound: current.remediationRound,
      successCriteriaChecklist: current.successCriteriaChecklist,
      sliceDeliveryAudit: current.sliceDeliveryAudit,
      crossSliceIntegration: current.crossSliceIntegration,
      requirementCoverage: current.requirementCoverage,
      verificationClasses: current.verificationClasses,
      verdictRationale,
      remediationPlan: current.remediationPlan,
    },
    basePath,
  );

  if (result.isError) {
    const msg =
      result.content[0]?.type === "text" ? result.content[0].text : "Unknown error";
    ctx.ui.notify(msg, "error");
    return;
  }

  const prevVerdict = current.verdict ?? "unknown";
  ctx.ui.notify(
    `Milestone ${milestoneId} verdict: ${prevVerdict} -> ${parsed.verdict} (${existingValidation.source})`,
    "success",
  );

  if (parsed.verdict === "needs-remediation") {
    ctx.ui.notify(
      "Follow up with gsd_reassess_roadmap to add remediation slices, then re-run /gsd auto.",
      "info",
    );
  }
}
