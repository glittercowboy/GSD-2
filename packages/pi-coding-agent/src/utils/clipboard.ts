import { copyToClipboard as nativeCopy } from "@gsd/native/clipboard";

export function copyToClipboard(text: string): void {
	// Always emit OSC 52 - works over SSH/mosh, harmless locally
	const encoded = Buffer.from(text).toString("base64");
	process.stdout.write(`\x1b]52;c;${encoded}\x07`);

	// Use native clipboard for local sessions (best effort)
	try {
		nativeCopy(text);
	} catch {
		// Ignore - OSC 52 already emitted as fallback
	}
}
