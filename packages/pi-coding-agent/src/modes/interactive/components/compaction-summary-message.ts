// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/compaction-summary-message.ts - Compaction summary message renderer.

import { Markdown, type MarkdownTheme, Text } from "@gsd/pi-tui";
import type { CompactionSummaryMessage } from "../../../core/messages.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { CollapsibleMessageComponent } from "./collapsible-message.js";
import { renderChatFrame } from "./transcript-design.js";
import { editorKey } from "./keybinding-hints.js";

/**
 * Renders a compaction notice in the shared chat-frame style (top rule,
 * `• compaction` header, `│ ` body margin) with purple border/label so it
 * visually matches the other framed messages (user / assistant / tool
 * execution) while standing apart from the conversation flow.
 */
export class CompactionSummaryMessageComponent extends CollapsibleMessageComponent {
	private message: CompactionSummaryMessage;
	private markdownTheme: MarkdownTheme;

	constructor(
		message: CompactionSummaryMessage,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
	) {
		super();
		this.message = message;
		this.markdownTheme = markdownTheme;
		this.rebuildContent();
	}

	protected rebuildContent(): void {
		this.clear();

		const tokenStr = this.message.tokensBefore.toLocaleString();

		if (this.expanded) {
			const header = `**Compacted from ${tokenStr} tokens**\n\n`;
			this.addChild(
				new Markdown(header + this.message.summary, 0, 0, this.markdownTheme, {
					color: (text: string) => theme.fg("customMessageText", text),
				}),
			);
		} else {
			this.addChild(
				new Text(
					theme.fg(
						"customMessageText",
						`Compacted from ${tokenStr} tokens (`,
					) +
						theme.fg("dim", editorKey("expandTools")) +
						theme.fg("customMessageText", " to expand)"),
					0,
					0,
				),
			);
		}
	}

	override render(width: number): string[] {
		const cached = this.getCachedRender(width);
		if (cached) return cached;

		const frameWidth = Math.max(20, width);
		const contentWidth = Math.max(1, frameWidth - 4);
		const lines = super.render(contentWidth);
		const framed = renderChatFrame(lines, frameWidth, {
			label: "compaction",
			tone: "compaction",
			timestampFormat: "date-time-iso",
			showTimestamp: false,
		});
		return this.setCachedRender(width, framed.length > 0 ? ["", ...framed] : framed);
	}
}
