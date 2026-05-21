// GSD-2 — Extension template import path validation
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));

const extensionApiStubs = `
declare module "@gsd/pi-coding-agent" {
	export interface ExtensionContext {
		hasUI: boolean;
		sessionManager: { getBranch(): Array<{ type: string; message: { role?: string; toolName?: string; details?: unknown } }> };
		ui: { notify(message: string, level: string): void; custom<T>(view: unknown): Promise<T> };
	}
	export interface ExtensionAPI {
		on(event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown): void;
		registerTool(tool: Record<string, unknown>): void;
		registerCommand(name: string, command: {
			description: string;
			handler: (args: string, ctx: ExtensionContext) => unknown;
		}): void;
	}
}

declare module "@sinclair/typebox" {
	export const Type: {
		Object(shape: Record<string, unknown>): unknown;
		Optional(schema: unknown): unknown;
		String(options?: Record<string, unknown>): unknown;
		Number(options?: Record<string, unknown>): unknown;
	};
}

declare module "@gsd/pi-ai" {
	export function StringEnum<T extends readonly string[]>(values: T): unknown;
}

declare module "@gsd/pi-tui" {
	export class Text {
		constructor(text: string, x: number, y: number);
	}
	export function truncateToWidth(text: string, width: number): string;
	export function matchesKey(data: string, key: string): boolean;
	export const Key: { escape: string };
}
`;

function renderTemplate(template: string): string {
	return template
		.replaceAll("{{EXTENSION_NAME}}", "Sample Extension")
		.replaceAll("{{DESCRIPTION}}", "Sample extension")
		.replaceAll("{{CAPABILITIES_LIST}}", "- sample")
		.replaceAll("{{tool_name}}", "sample_tool")
		.replaceAll("{{Tool Label}}", "Sample Tool")
		.replaceAll("{{Tool description for LLM}}", "Sample tool description")
		.replaceAll("{{command_name}}", "sample")
		.replaceAll("{{Command description}}", "Sample command")
		.replaceAll("{{ItemType}}", "SampleItem")
		.replaceAll("{{ToolDetails}}", "SampleToolDetails")
		.replaceAll("{{Description for LLM}}", "Sample stateful tool description")
		.replaceAll("{{items}}", "items")
		.replaceAll("{{Items}}", "Items");
}

describe("extension templates use @gsd/* imports", () => {
	const templates = ["extension-skeleton.ts", "stateful-tool-skeleton.ts"];

	for (const template of templates) {
		it(`${template} renders as a compilable extension module`, () => {
			const dir = mkdtempSync(join(tmpdir(), "create-gsd-extension-template-"));
			try {
				const stubsPath = join(dir, "extension-api-stubs.d.ts");
				const renderedPath = join(dir, template);
				writeFileSync(stubsPath, extensionApiStubs, "utf-8");
				const rendered = renderTemplate(readFileSync(join(__dirname, template), "utf-8"));
				writeFileSync(renderedPath, rendered, "utf-8");

				const program = ts.createProgram([stubsPath, renderedPath], {
					allowJs: false,
					esModuleInterop: true,
					module: ts.ModuleKind.NodeNext,
					moduleResolution: ts.ModuleResolutionKind.NodeNext,
					noEmit: true,
					skipLibCheck: true,
					strict: false,
					target: ts.ScriptTarget.ES2022,
				});
				const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
				assert.deepEqual(
					diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
					[],
				);
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	}
});
