// GSD-2 + Visual Brief artifact policy

import { join } from "node:path";
import { getAgentDir } from "@gsd/pi-coding-agent";

export interface VisualBriefArtifactPolicy {
	outputDir: string;
	filenameStyle: string;
	fileShape: string;
	openers: readonly string[];
	failureBehavior: string;
}

export function getVisualBriefOutputDir(agentDir: string = getAgentDir()): string {
	return join(agentDir, "diagrams");
}

export function createVisualBriefArtifactPolicy(outputDir: string): VisualBriefArtifactPolicy {
	return {
		outputDir,
		filenameStyle: "Use a descriptive kebab-case filename ending in .html.",
		fileShape: "Produce one self-contained responsive HTML file with embedded CSS and minimal JavaScript.",
		openers: [
			"macOS: open",
			"Linux: xdg-open",
			"Windows: cmd /c start",
		],
		failureBehavior: "If opening fails, report the absolute file path.",
	};
}

export function formatArtifactPolicy(policy: VisualBriefArtifactPolicy): string {
	return [
		`- Create the output directory if it does not exist: ${policy.outputDir}`,
		`- ${policy.filenameStyle}`,
		`- ${policy.fileShape}`,
		"- Open the result in a browser when the local platform has an opener available.",
		...policy.openers.map((opener) => `  - ${opener}`),
		`- ${policy.failureBehavior}`,
	].join("\n");
}
