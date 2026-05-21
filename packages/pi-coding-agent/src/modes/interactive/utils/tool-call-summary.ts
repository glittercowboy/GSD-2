// Project/App: GSD-2
// File Purpose: Compact tool-call summaries for transcript tree rows.

import { shortenPath } from "./shorten-path.js";

export function formatToolCallSummary(name: string, args: Record<string, unknown>): string {
	switch (name) {
		case "read": {
			const path = shortenPath(String(args.path || args.file_path || ""));
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let display = path;
			if (offset !== undefined || limit !== undefined) {
				const start = offset ?? 1;
				const end = limit !== undefined ? start + limit - 1 : "";
				display += `:${start}${end ? `-${end}` : ""}`;
			}
			return `[read: ${display}]`;
		}
		case "write": {
			const path = shortenPath(String(args.path || args.file_path || ""));
			return `[write: ${path}]`;
		}
		case "edit": {
			const path = shortenPath(String(args.path || args.file_path || ""));
			return `[edit: ${path}]`;
		}
		case "bash": {
			const rawCmd = String(args.command || "");
			const cmd = rawCmd
				.replace(/[\n\t]/g, " ")
				.trim()
				.slice(0, 50);
			return `[bash: ${cmd}${rawCmd.length > 50 ? "..." : ""}]`;
		}
		case "grep": {
			const pattern = String(args.pattern || "");
			const path = shortenPath(String(args.path || "."));
			return `[grep: /${pattern}/ in ${path}]`;
		}
		case "find": {
			const pattern = String(args.pattern || "");
			const path = shortenPath(String(args.path || "."));
			return `[find: ${pattern} in ${path}]`;
		}
		case "ls": {
			const path = shortenPath(String(args.path || "."));
			return `[ls: ${path}]`;
		}
		default: {
			const argsJson = JSON.stringify(args);
			const argsPreview = argsJson.slice(0, 40);
			return `[${name}: ${argsPreview}${argsJson.length > 40 ? "..." : ""}]`;
		}
	}
}
