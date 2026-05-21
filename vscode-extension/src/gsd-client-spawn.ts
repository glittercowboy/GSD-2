// Project/App: GSD-2
// File Purpose: Pure spawn planning for the VS Code GSD RPC client.

import type { SpawnOptions } from "node:child_process";

export interface GsdClientSpawnPlan {
	command: string;
	args: string[];
	options: SpawnOptions;
}

export function buildGsdClientSpawnPlan(
	binaryPath: string,
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): GsdClientSpawnPlan {
	return {
		command: binaryPath,
		args: ["--mode", "rpc"],
		options: {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...env },
			shell: platform === "win32",
		},
	};
}
