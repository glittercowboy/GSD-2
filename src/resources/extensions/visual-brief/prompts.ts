// GSD-2 + Visual Brief prompt construction

import {
	createVisualBriefArtifactPolicy,
	formatArtifactPolicy,
} from "./artifact-policy.js";
import {
	formatPageRules,
	getVisualBriefModeProfile,
} from "./page-contract.js";
import { renderHtmlShellTemplate } from "../shared/html-shell.js";

export type VisualBriefMode = "diagram" | "plan" | "diff" | "recap" | "table" | "slides";

export interface VisualBriefRequest {
	mode: VisualBriefMode;
	subject: string;
	slides: boolean;
	rawArgs: string;
}

export interface VisualBriefModeInfo {
	mode: VisualBriefMode;
	aliases: readonly string[];
	description: string;
	defaultSubject?: string;
}

export const VISUAL_BRIEF_MODES: readonly VisualBriefModeInfo[] = [
	{
		mode: "diagram",
		aliases: ["diagram", "flow", "architecture", "arch", "web-diagram"],
		description: "Generate a visual system, architecture, flow, state, or data diagram",
	},
	{
		mode: "plan",
		aliases: ["plan", "visual-plan", "implementation-plan"],
		description: "Generate a visual implementation plan with risks, files, edge cases, and tests",
	},
	{
		mode: "diff",
		aliases: ["diff", "review", "diff-review", "changes"],
		description: "Generate a visual review of staged and unstaged changes",
		defaultSubject: "the current staged and unstaged repository changes",
	},
	{
		mode: "recap",
		aliases: ["recap", "project-recap", "summary"],
		description: "Generate a visual project recap for context switching",
		defaultSubject: "the current project",
	},
	{
		mode: "table",
		aliases: ["table", "comparison", "matrix", "audit"],
		description: "Render a dense comparison, audit, or status report as a readable HTML table",
	},
	{
		mode: "slides",
		aliases: ["slides", "deck", "slide-deck"],
		description: "Generate a visual slide deck",
	},
];

export const VISUAL_BRIEF_USAGE =
	"Usage: /gsd brief <diagram|plan|diff|recap|table|slides> [topic] [--slides]";

const VISUAL_BRIEF_KIND: Record<VisualBriefMode, string> = {
	diff: "Diff Brief",
	recap: "Project Recap",
	plan: "Implementation Plan",
	diagram: "Diagram",
	table: "Comparison",
	slides: "Slide Deck",
};

export function parseVisualBriefArgs(args: string): VisualBriefRequest | null {
	const rawArgs = args.trim();
	if (!rawArgs) return null;

	const tokens = rawArgs.split(/\s+/).filter(Boolean);
	const slidesFlag = tokens.includes("--slides");
	const contentTokens = tokens.filter((token) => token !== "--slides");
	if (contentTokens.length === 0) return null;

	const firstToken = normalizeToken(contentTokens[0] ?? "");
	const modeInfo = findMode(firstToken);
	const mode = modeInfo?.mode ?? "diagram";
	const subjectTokens = modeInfo ? contentTokens.slice(1) : contentTokens;
	const subject = subjectTokens.join(" ").trim() || modeInfo?.defaultSubject;

	if (!subject) return null;

	return {
		mode,
		subject,
		slides: slidesFlag || mode === "slides",
		rawArgs,
	};
}

export interface VisualBriefPromptOptions {
	outputDir: string;
	/** GSD version rendered in the shell header/footer. Falls back to "0.0.0" when not provided. */
	version?: string;
}

export function buildVisualBriefPrompt(
	request: VisualBriefRequest,
	options: VisualBriefPromptOptions,
): string {
	const profile = getVisualBriefModeProfile(request.mode, request.slides);
	const artifactPolicy = createVisualBriefArtifactPolicy(options.outputDir);
	const outputFormat = request.slides ? "slide deck" : "scrollable explanation page";
	const version = options.version?.trim() || undefined;
	const shell = renderHtmlShellTemplate({
		title: request.subject,
		documentTitle: `GSD ${VISUAL_BRIEF_KIND[request.mode]} - ${request.subject}`,
		subtitle: "Visual brief",
		kind: VISUAL_BRIEF_KIND[request.mode],
		version,
		mainPlaceholder: "{{MAIN_HTML}}",
		footerNote: request.subject,
	});

	return `Create a visual brief as a single HTML file.

## Request

- Mode: ${request.mode}
- Subject: ${request.subject}
- Output format: ${outputFormat}
- Output directory: ${options.outputDir}

## Goal

${profile.goal}

## Required workflow

1. Gather evidence before writing the page.
${profile.evidenceSteps.map((step) => `   - ${step}`).join("\n")}
2. Build the visual structure from the evidence.
${formatPageRules()}
3. Write the HTML file.
${formatArtifactPolicy(artifactPolicy).split("\n").map((line) => `   ${line}`).join("\n")}

## Required HTML shell

Use this scaffold verbatim. Replace {{MAIN_HTML}} with the authored <main> contents and {{GENERATED_AT}} with the current ISO timestamp. Do not add new <style> blocks or replace the header, footer, CSS, or script. The <h1> is the subject only; the kind chip is the only visual carrier of artifact type.

\`\`\`html
${shell}
\`\`\`

Author only section-level content for {{MAIN_HTML}}. Use the shell utility classes where they fit: .kv-grid, .tbl, .card-row, .card, .callout-info, .callout-warn, .callout-ok, .dot-active, .dot-complete, .dot-pending.

## Page sections

${profile.sections.map((section) => `- ${section}`).join("\n")}

## Final response

Keep the chat response short: state the output file path, whether the browser opened, and any uncertainty discovered during evidence gathering.`;
}

export function getVisualBriefCompletions(prefix: string): Array<{ value: string; label: string; description: string }> {
	const firstPart = prefix.trim().split(/\s+/)[0] ?? "";
	return VISUAL_BRIEF_MODES
		.filter((mode) => mode.mode.startsWith(firstPart) || mode.aliases.some((alias) => alias.startsWith(firstPart)))
		.map((mode) => ({
			value: mode.mode,
			label: mode.mode,
			description: mode.description,
		}));
}

function findMode(token: string): VisualBriefModeInfo | undefined {
	return VISUAL_BRIEF_MODES.find((mode) => mode.aliases.includes(token));
}

function normalizeToken(token: string): string {
	return token.trim().toLowerCase();
}
