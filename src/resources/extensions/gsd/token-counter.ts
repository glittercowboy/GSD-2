interface TokenEncoder {
	encode(text: string): Uint32Array | number[];
}

let encoder: TokenEncoder | null = null;
let encoderFailed = false;

async function getEncoder(): Promise<TokenEncoder | null> {
	if (encoder) return encoder;
	if (encoderFailed) return null;
	try {
		// @ts-ignore — tiktoken may not have type declarations in extensions tsconfig
		const tiktoken = await import("tiktoken");
		encoder = tiktoken.encoding_for_model("gpt-4o") as TokenEncoder;
		return encoder;
	} catch {
		encoderFailed = true;
		return null;
	}
}

export async function countTokens(text: string): Promise<number> {
	const enc = await getEncoder();
	if (enc) {
		const tokens = enc.encode(text);
		return tokens.length;
	}
	return Math.ceil(text.length / 4);
}

export function countTokensSync(text: string): number {
	if (encoder) {
		return encoder.encode(text).length;
	}
	return Math.ceil(text.length / 4);
}

export async function initTokenCounter(): Promise<boolean> {
	const enc = await getEncoder();
	return enc !== null;
}

export function isAccurateCountingAvailable(): boolean {
	return encoder !== null;
}
