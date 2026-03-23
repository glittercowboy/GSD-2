import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);

if (!process.stdin.isTTY || !process.stdout.isTTY) {
	console.error("[visual-manual] This command must be run from an interactive terminal (TTY).");
	process.exit(1);
}

const tempHome = mkdtempSync(join(tmpdir(), "gsd-visual-manual-"));
const agentDir = join(tempHome, ".gsd", "agent");
const extDir = join(agentDir, "extensions");
mkdirSync(extDir, { recursive: true });

const fixtures = [
	"src/tests/integration/fixtures/status-activity-visual-extension.ts",
	"src/tests/integration/fixtures/animation-manual-extension.ts",
];
for (const fixture of fixtures) {
	const src = join(repoRoot, fixture);
	const dest = join(extDir, fixture.split("/").at(-1));
	cpSync(src, dest);
}

const readmePath = join(tempHome, "VISUAL-MANUAL-CHECKLIST.txt");
writeFileSync(
	readmePath,
	[
		"Visual Manual Animation Checklist",
		"",
		"Run these commands in GSD:",
		"  /anim-help",
		"  /anim-all",
		"  # Remaining core-only visuals:",
		"  !sleep 3",
		"  /arminsayshi",
		"  /daxnuts",
		"  /reload",
		"",
		"CLI lane (onboarding) check:",
		"  exit GSD and rerun with a new temp home to force onboarding.",
	].join("\n"),
	"utf-8",
);

console.log("[visual-manual] isolated HOME:", tempHome);
console.log("[visual-manual] extension dir:", extDir);
console.log("[visual-manual] checklist:", readmePath);
console.log("[visual-manual] launching GSD...");

const child = spawn(process.execPath, [join(repoRoot, "scripts", "dev-cli.js")], {
	cwd: repoRoot,
	stdio: "inherit",
	env: {
		...process.env,
		HOME: tempHome,
		GSD_CODING_AGENT_DIR: agentDir,
	},
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});
