// GSD-2 + Visual Brief bundled extension marker

import type { ExtensionAPI } from "@gsd/pi-coding-agent";

export default function visualBrief(_pi: ExtensionAPI) {
	// Visual Brief is invoked through /gsd brief. This module keeps the bundled
	// extension discoverable without adding a second top-level slash command.
}
