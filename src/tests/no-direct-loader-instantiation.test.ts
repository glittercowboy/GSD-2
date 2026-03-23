import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..", "..");
const codingAgentSrc = join(root, "packages", "pi-coding-agent", "src");
const onboardingPath = join(root, "src", "onboarding.ts");

const allowed = new Set<string>();

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			walk(full, files);
		} else if (entry.endsWith(".ts")) {
			files.push(full);
		}
	}
	return files;
}

test("feature code does not instantiate Loader/CancellableLoader outside centralized animation modules", () => {
	const offenders: string[] = [];
	for (const file of walk(codingAgentSrc)) {
		const rel = relative(codingAgentSrc, file).replaceAll("\\", "/");
		const content = readFileSync(file, "utf-8");
		if (!content.includes("new Loader(") && !content.includes("new CancellableLoader(")) continue;
		if (!allowed.has(rel)) {
			offenders.push(rel);
		}
	}

	assert.deepEqual(
		offenders,
		[],
		`Found direct loader instantiation outside centralized modules:\n${offenders.join("\n")}`,
	);
});

test("coding-agent runtime does not use shared animation clock directly", () => {
	const offenders: string[] = [];
	for (const file of walk(codingAgentSrc)) {
		const rel = relative(codingAgentSrc, file).replaceAll("\\", "/");
		const content = readFileSync(file, "utf-8");
		if (content.includes("getSharedAnimationClock(")) {
			offenders.push(rel);
		}
	}

	assert.deepEqual(
		offenders,
		[],
		`Found direct getSharedAnimationClock usage in coding-agent runtime:\n${offenders.join("\n")}`,
	);
});

test("onboarding does not instantiate clack spinner directly", () => {
	const content = readFileSync(onboardingPath, "utf-8");
	assert.equal(
		content.includes("p.spinner("),
		false,
		"onboarding must render activity via ActivityManager-driven cli lane adapter",
	);
});
