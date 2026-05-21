// GSD-2 + Visual Brief page contract

import type { VisualBriefMode } from "./prompts.js";

export interface VisualBriefModeProfile {
	goal: string;
	evidenceSteps: readonly string[];
	sections: readonly string[];
}

export const VISUAL_BRIEF_PAGE_RULES: readonly string[] = [
	"Use Mermaid for topology-heavy diagrams when it improves readability.",
	"Use semantic HTML tables for comparisons, audits, matrices, status reports, and dense lists.",
	"Use CSS grid/card layouts when text-heavy module details matter more than edge routing.",
	"For 15+ entities, use a small overview diagram plus detailed cards instead of one crowded diagram.",
	"Include accessible headings, readable contrast, responsive tables, and no horizontal body overflow.",
	"Include source references for factual claims, file relationships, commands, and inferred behavior.",
	"Keep the design distinctive and appropriate to the content; avoid generic purple/blue gradient styling.",
	"CDN libraries are acceptable for Mermaid or charts, but the page must still show useful written context if a CDN fails.",
	"Do not include provider-specific claims, branding, or assumptions.",
];

export function getVisualBriefModeProfile(mode: VisualBriefMode, slides: boolean): VisualBriefModeProfile {
	if (slides || mode === "slides") {
		return {
			goal: "Turn the subject into a concise, visually paced deck that someone can present or skim quickly.",
			evidenceSteps: [
				"Identify the intended audience and the main decision or understanding the deck should support.",
				"Read the relevant files, diffs, docs, or command output before making factual claims.",
				"Extract the smallest set of concepts, risks, and examples needed for a clear narrative.",
			],
			sections: [
				"Title slide with the subject and one-line takeaway",
				"Problem or context slide",
				"System or concept diagram slide",
				"Key evidence slide",
				"Risks, tradeoffs, or unknowns slide",
				"Recommended next steps slide",
			],
		};
	}

	switch (mode) {
		case "plan":
			return {
				goal: "Create a visual implementation plan that is detailed enough to guide coding without pretending uncertain facts are verified.",
				evidenceSteps: [
					"Read the relevant exports, immediate callers, tests, docs, and shared utilities.",
					"Identify the likely file changes, existing conventions, edge cases, and test requirements.",
					"Mark any assumption that cannot be verified from the repository.",
				],
				sections: [
					"Feature summary and scope boundaries",
					"Before/after workflow comparison",
					"Architecture or state-flow diagram",
					"Files to change with precise responsibilities",
					"API, command, or data-shape changes",
					"Edge cases and failure behavior",
					"Test plan with success and failure paths",
					"Open questions and assumptions",
				],
			};
		case "diff":
			return {
				goal: "Review the current changes visually so risk, intent, and affected areas are easy to scan.",
				evidenceSteps: [
					"Inspect git status plus staged and unstaged diffs.",
					"Read changed files where needed to understand behavior, not just line changes.",
					"Separate confirmed findings from questions or residual risk.",
				],
				sections: [
					"Change map by file and subsystem",
					"Intent summary inferred from the diff",
					"Risk heatmap",
					"Behavior changes and compatibility notes",
					"Test coverage matrix",
					"Actionable findings and open questions",
				],
			};
		case "recap":
			return {
				goal: "Create a context-switching snapshot that helps someone regain the project mental model quickly.",
				evidenceSteps: [
					"Read the current project docs, recent git status, relevant plans, and high-signal source files.",
					"Identify active work, stable architecture, uncertain areas, and likely next actions.",
					"Prefer concrete file references and verified facts over broad summaries.",
				],
				sections: [
					"Current project state",
					"Architecture map",
					"Active work and changed files",
					"Important decisions and constraints",
					"Risks or unresolved questions",
					"Recommended next actions",
				],
			};
		case "table":
			return {
				goal: "Turn dense structured information into an accessible visual table that is easier to compare than terminal output.",
				evidenceSteps: [
					"Identify the row and column meanings before choosing table structure.",
					"Verify each cell from source material, command output, or code when possible.",
					"Use status labels and short notes so the table remains scannable.",
				],
				sections: [
					"Short summary of what is being compared",
					"Primary responsive table with sticky header",
					"Legend for statuses or scoring",
					"Notable patterns, outliers, and caveats",
					"Source references",
				],
			};
		case "diagram":
			return {
				goal: "Explain the subject visually with a diagram plus enough context to make the diagram trustworthy.",
				evidenceSteps: [
					"Read relevant files, docs, or command output before drawing relationships.",
					"Choose the right diagram type: flowchart, sequence, state, ER/schema, C4-style, timeline, or dashboard.",
					"Keep complex diagrams readable by splitting overview and details.",
				],
				sections: [
					"One-line takeaway",
					"Primary diagram with readable labels",
					"Component or step details",
					"Data/control flow notes",
					"Assumptions, limitations, and source references",
				],
			};
		default:
			throw new Error(`Unknown visual brief mode: ${mode as string}`);
	}
}

export function formatPageRules(rules: readonly string[] = VISUAL_BRIEF_PAGE_RULES): string {
	return rules.map((rule) => `   - ${rule}`).join("\n");
}
