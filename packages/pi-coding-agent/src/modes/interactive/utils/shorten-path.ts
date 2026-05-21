// Project/App: GSD-2
// File Purpose: Display-friendly path shortening for interactive UI labels.

import * as os from "node:os";

/**
 * Convert absolute path to tilde notation if it's in home directory.
 * Returns empty string for non-string or empty inputs.
 */
export function shortenPath(path: unknown): string {
	if (typeof path !== "string" || !path) return "";
	const home = os.homedir();
	const displayPath = path.startsWith(home) ? `~${path.slice(home.length)}` : path;
	return displayPath.replace(/\\/g, "/");
}
