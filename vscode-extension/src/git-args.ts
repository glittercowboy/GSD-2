// Project/App: GSD-2
// File Purpose: Pure git argument builders for agent-scoped VS Code actions.

export function buildAgentGitAddArgs(files: string[]): string[] {
	return ["add", ...files];
}

export function buildAgentGitDiffArgs(files: string[]): string[] {
	return ["diff", "--", ...files];
}

export function buildAgentGitStatusArgs(files: string[]): string[] {
	return ["status", "--short", "--", ...files];
}
