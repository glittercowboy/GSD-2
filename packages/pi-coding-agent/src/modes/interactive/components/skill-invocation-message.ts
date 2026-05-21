// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/skill-invocation-message.ts - Skill invocation message renderer.

import { Markdown, type MarkdownTheme, Text } from "@gsd/pi-tui";
import type { ParsedSkillBlock } from "../../../core/agent-session.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { CollapsibleMessageComponent } from "./collapsible-message.js";
import { renderChatFrame } from "./transcript-design.js";
import { editorKey } from "./keybinding-hints.js";

/**
 * Renders a skill invocation in the shared chat-frame style (top rule,
 * `• skill - <name>` header, `│ ` body margin) with purple border/label
 * matching compaction so it visually aligns with user/assistant messages.
 */
export class SkillInvocationMessageComponent extends CollapsibleMessageComponent {
	private skillBlock: ParsedSkillBlock;
	private markdownTheme: MarkdownTheme;

	constructor(skillBlock: ParsedSkillBlock, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.skillBlock = skillBlock;
		this.markdownTheme = markdownTheme;
		this.rebuildContent();
	}

	protected rebuildContent(): void {
		this.clear();

		if (this.expanded) {
			this.addChild(
				new Markdown(this.skillBlock.content, 0, 0, this.markdownTheme, {
					color: (text: string) => theme.fg("customMessageText", text),
				}),
			);
		} else {
			this.addChild(
				new Text(
					theme.fg("dim", `(${editorKey("expandTools")} to expand)`),
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
			label: `skill - ${this.skillBlock.name}`,
			tone: "skill",
			timestampFormat: "date-time-iso",
			showTimestamp: false,
		});
		return this.setCachedRender(width, framed.length > 0 ? ["", ...framed] : framed);
	}
}
