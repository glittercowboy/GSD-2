// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/branch-summary-message.ts - Branch summary message renderer.

import { Box, Markdown, type MarkdownTheme, Spacer, Text } from "@gsd/pi-tui";
import type { BranchSummaryMessage } from "../../../core/messages.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { CollapsibleMessageComponent } from "./collapsible-message.js";
import { editorKey } from "./keybinding-hints.js";

/**
 * Component that renders a branch summary message with collapsed/expanded state.
 * Uses same background color as custom messages for visual consistency.
 */
export class BranchSummaryMessageComponent extends CollapsibleMessageComponent {
	private message: BranchSummaryMessage;
	private markdownTheme: MarkdownTheme;
	private box: Box;

	constructor(message: BranchSummaryMessage, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.message = message;
		this.markdownTheme = markdownTheme;
		this.box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		this.rebuildContent();
	}

	protected rebuildContent(): void {
		this.clear();
		this.box.clear();
		this.addChild(this.box);

		const label = theme.fg("customMessageLabel", theme.bold("[branch]"));
		this.box.addChild(new Text(label, 0, 0));
		this.box.addChild(new Spacer(1));

		if (this.expanded) {
			const header = "**Branch Summary**\n\n";
			this.box.addChild(
				new Markdown(header + this.message.summary, 0, 0, this.markdownTheme, {
					color: (text: string) => theme.fg("customMessageText", text),
				}),
			);
		} else {
			this.box.addChild(
				new Text(
					theme.fg("customMessageText", "Branch summary (") +
						theme.fg("dim", editorKey("expandTools")) +
						theme.fg("customMessageText", " to expand)"),
					0,
					0,
				),
			);
		}
	}
}
