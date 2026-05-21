// Project/App: GSD-2
// File Purpose: Pure approval-mode helpers for the VS Code extension.

export type ApprovalMode = "ask" | "auto-approve" | "plan-only";

export const GSD_APPROVAL_CONFIG_SECTION = "gsd";
export const GSD_APPROVAL_CONFIG_KEY = "approvalMode";
export const GSD_APPROVAL_CONFIG_PATH = `${GSD_APPROVAL_CONFIG_SECTION}.${GSD_APPROVAL_CONFIG_KEY}`;

export const APPROVAL_MODES: ApprovalMode[] = ["auto-approve", "ask", "plan-only"];

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
	"auto-approve": "Auto-Approve (agent runs freely)",
	ask: "Ask (prompt before file changes)",
	"plan-only": "Plan Only (read-only, no writes)",
};

export function nextApprovalMode(current: ApprovalMode): ApprovalMode {
	const currentIdx = APPROVAL_MODES.indexOf(current);
	return APPROVAL_MODES[(currentIdx + 1) % APPROVAL_MODES.length];
}

export function describeApprovalEvent(evt: {
	type?: unknown;
	toolName?: unknown;
	toolInput?: unknown;
}): string | null {
	if (evt.type !== "tool_execution_start") return null;

	const toolName = String(evt.toolName ?? "");
	if (toolName !== "Write" && toolName !== "Edit" && toolName !== "Bash") return null;

	const toolInput = (evt.toolInput ?? {}) as Record<string, unknown>;
	switch (toolName) {
		case "Write":
		case "Edit": {
			const filePath = String(toolInput.file_path ?? "");
			const shortPath = filePath.split(/[\\/]/).slice(-3).join("/");
			return `${toolName}: ${shortPath}`;
		}
		case "Bash":
			return `Execute: ${String(toolInput.command ?? "").slice(0, 80)}`;
		default:
			return null;
	}
}
