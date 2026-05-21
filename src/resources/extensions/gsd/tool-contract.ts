// Project/App: GSD-2
// File Purpose: ADR-015 Tool Contract module for Unit prompt, policy, and tool parity.

import {
  resolveManifest,
  type ArtifactKey,
  type ContextModePolicy,
  type ToolsPolicy,
} from "./unit-context-manifest.js";
import { getRequiredWorkflowToolsForAutoUnit } from "./workflow-mcp.js";

export interface UnitToolContract {
  unitType: string;
  contextMode: ContextModePolicy;
  toolsPolicy: ToolsPolicy;
  requiredWorkflowTools: readonly string[];
  promptObligations: readonly string[];
  validationRules: readonly string[];
  closeoutTools: readonly string[];
  artifacts: {
    inline: readonly ArtifactKey[];
    excerpt: readonly ArtifactKey[];
    onDemand: readonly ArtifactKey[];
  };
}

export type ToolContractResult =
  | { ok: true; contract: UnitToolContract }
  | { ok: false; reason: "unknown-unit-type" | "missing-closeout-tool"; detail: string };

export function compileUnitToolContract(unitType: string): ToolContractResult {
  const manifest = resolveManifest(unitType);
  if (!manifest) {
    return {
      ok: false,
      reason: "unknown-unit-type",
      detail: `No Unit manifest is registered for ${unitType}`,
    };
  }

  const requiredWorkflowTools = getRequiredWorkflowToolsForAutoUnit(unitType);
  const closeoutTools = requiredWorkflowTools.filter((tool) =>
    /^gsd_(?:task|slice|milestone|complete|validate|save|summary)/.test(tool),
  );

  if (requiresCloseoutTool(unitType) && closeoutTools.length === 0) {
    return {
      ok: false,
      reason: "missing-closeout-tool",
      detail: `${unitType} has no closeout workflow tool`,
    };
  }

  return {
    ok: true,
    contract: {
      unitType,
      contextMode: manifest.contextMode,
      toolsPolicy: manifest.tools,
      requiredWorkflowTools,
      promptObligations: [
        `context-mode:${manifest.contextMode}`,
        `tools-policy:${manifest.tools.mode}`,
      ],
      validationRules: [
        "unit-manifest-present",
        "workflow-tool-surface-present",
        ...(requiresCloseoutTool(unitType) ? ["closeout-tool-present"] : []),
      ],
      closeoutTools,
      artifacts: {
        inline: manifest.artifacts.inline,
        excerpt: manifest.artifacts.excerpt,
        onDemand: manifest.artifacts.onDemand,
      },
    },
  };
}

function requiresCloseoutTool(unitType: string): boolean {
  return /^(execute-task|reactive-execute|complete-slice|validate-milestone|complete-milestone|run-uat|gate-evaluate)$/.test(unitType);
}
