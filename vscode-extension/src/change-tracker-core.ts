// Project/App: GSD-2
// File Purpose: VS Code change-tracker event and snapshot helpers.

import * as path from "node:path";

export interface ChangeTrackerAgentEvent {
	type: string;
	[key: string]: unknown;
}

export interface ChangeTrackerFileSystem {
	existsSync(filePath: string): boolean;
	readFileSync(filePath: string, encoding: "utf8"): string;
}

export function getToolInput(evt: ChangeTrackerAgentEvent): Record<string, unknown> {
	const input = evt.args ?? evt.toolInput ?? evt.input ?? {};
	return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

export function getToolUseId(evt: ChangeTrackerAgentEvent): string {
	return String(evt.toolCallId ?? evt.toolUseId ?? "");
}

export function normalizeToolName(toolName: unknown): string {
	return String(toolName ?? "").toLowerCase();
}

export function isFileMutationTool(toolName: string): boolean {
	return toolName === "write" || toolName === "write_file" || toolName === "edit";
}

export function resolveToolPath(workspaceRoot: string, input: Record<string, unknown>): string {
	const rawPath = String(input.file_path ?? input.path ?? "");
	if (!rawPath) return "";
	return path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceRoot, rawPath);
}

export function captureOriginalContent(filePath: string, fsImpl: ChangeTrackerFileSystem): string | null | undefined {
	try {
		return fsImpl.existsSync(filePath) ? fsImpl.readFileSync(filePath, "utf8") : null;
	} catch {
		return undefined;
	}
}

export function captureCurrentSnapshots(
	filePaths: Iterable<string>,
	fsImpl: ChangeTrackerFileSystem,
): Map<string, string | null> {
	const snapshots = new Map<string, string | null>();
	for (const filePath of filePaths) {
		try {
			snapshots.set(filePath, fsImpl.existsSync(filePath) ? fsImpl.readFileSync(filePath, "utf8") : null);
		} catch {
			snapshots.set(filePath, null);
		}
	}
	return snapshots;
}

export function describeAction(toolName: string, input: Record<string, unknown>): string {
	switch (toolName.toLowerCase()) {
		case "read": {
			const p = String(input.file_path ?? input.path ?? "");
			return `Read ${p.split(/[\\/]/).pop() ?? p}`;
		}
		case "write":
		case "write_file": {
			const p = String(input.file_path ?? "");
			return `Write ${p.split(/[\\/]/).pop() ?? p}`;
		}
		case "edit": {
			const p = String(input.file_path ?? "");
			return `Edit ${p.split(/[\\/]/).pop() ?? p}`;
		}
		case "bash":
			return `$ ${String(input.command ?? "").slice(0, 40)}`;
		case "grep":
			return `Grep: ${String(input.pattern ?? "").slice(0, 30)}`;
		case "glob":
			return `Glob: ${String(input.pattern ?? "").slice(0, 30)}`;
		default:
			return toolName;
	}
}
