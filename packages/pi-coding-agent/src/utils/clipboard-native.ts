/**
 * Re-export native clipboard utilities from @gsd/native.
 *
 * This module exists for backward compatibility. Prefer importing
 * directly from "@gsd/native/clipboard" in new code.
 */
export {
	copyToClipboard,
	readTextFromClipboard,
	readImageFromClipboard,
} from "@gsd/native/clipboard";
