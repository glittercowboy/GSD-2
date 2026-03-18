import { ImageFormat, parseImage } from "@gsd/native/image";

/**
 * Convert image to PNG format for terminal display.
 * Kitty graphics protocol requires PNG format (f=100).
 */
export async function convertToPng(
	base64Data: string,
	mimeType: string,
): Promise<{ data: string; mimeType: string } | null> {
	// Already PNG, no conversion needed
	if (mimeType === "image/png") {
		return { data: base64Data, mimeType };
	}

	try {
		const bytes = new Uint8Array(Buffer.from(base64Data, "base64"));
		const image = await parseImage(bytes);
		const pngBytes = await image.encode(ImageFormat.PNG, 100);
		return {
			data: Buffer.from(new Uint8Array(pngBytes)).toString("base64"),
			mimeType: "image/png",
		};
	} catch {
		// Conversion failed
		return null;
	}
}
