// Project/App: GSD-2
// File Purpose: Left-edge user message rail renderer for interactive chat transcripts.

import { Container, Markdown, type MarkdownTheme } from "@gsd/pi-tui";
import { getMarkdownTheme } from "../theme/theme.js";
import { RenderCache } from "./render-cache.js";
import { formatTimestamp, type TimestampFormat } from "./timestamp.js";
import { chatMessageWidth, renderUserRail } from "./transcript-design.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";

function shouldEmitOsc133Zones(): boolean {
	if (process.env.GSD_DISABLE_OSC133_ZONES === "1") return false;
	if (process.env.GSD_ENABLE_OSC133_ZONES === "1") return true;
	return process.env.TERM_PROGRAM === "iTerm.app";
}

/**
 * Component that renders a user message against the left edge of the chat transcript.
 */
export class UserMessageComponent extends Container {
	private timestamp: number | undefined;
	private timestampFormat: TimestampFormat;
	private renderCache = new RenderCache();
	private renderVersion = 0;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme(), timestamp?: number, timestampFormat: TimestampFormat = "date-time-iso") {
		super();
		this.timestamp = timestamp;
		this.timestampFormat = timestampFormat;
		this.addChild(new Markdown(text, 0, 0, markdownTheme));
	}

	override invalidate(): void {
		super.invalidate();
		this.clearRenderCache();
	}

	override render(width: number): string[] {
		const emitOsc133Zones = shouldEmitOsc133Zones();
		const cacheKey = `${width}:${this.renderVersion}:${emitOsc133Zones ? 1 : 0}`;
		const cached = this.renderCache.get(cacheKey);
		if (cached) return cached;

		const frameWidth = Math.max(20, width);
		const messageWidth = chatMessageWidth(frameWidth);
		const contentWidth = Math.max(1, messageWidth - 2);
		const lines = super.render(contentWidth);
		const meta =
			this.timestamp !== undefined
				? formatTimestamp(this.timestamp, this.timestampFormat)
				: undefined;
		const framed = renderUserRail(lines, frameWidth, {
			label: "You",
			meta,
		});
		if (framed.length === 0) {
			return framed;
		}
		const out = ["", ...framed];
		if (!emitOsc133Zones) {
			return this.renderCache.set(cacheKey, out);
		}
		const firstFrameLine = 1;
		const lastFrameLine = out.length - 1;
		out[firstFrameLine] = OSC133_ZONE_START + out[firstFrameLine];
		out[lastFrameLine] = out[lastFrameLine] + OSC133_ZONE_END;
		return this.renderCache.set(cacheKey, out);
	}

	private clearRenderCache(): void {
		this.renderVersion++;
		this.renderCache.clear();
	}
}
