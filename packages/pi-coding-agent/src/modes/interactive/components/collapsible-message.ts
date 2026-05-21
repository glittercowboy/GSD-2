// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/collapsible-message.ts - Shared collapsible message lifecycle.

import { Container } from "@gsd/pi-tui";
import { RenderCache } from "./render-cache.js";

/**
 * Base component for message surfaces with a collapsed/expanded state.
 */
export abstract class CollapsibleMessageComponent extends Container {
	private _expanded = false;
	private renderCache = new RenderCache();
	private renderVersion = 0;

	protected get expanded(): boolean {
		return this._expanded;
	}

	setExpanded(expanded: boolean): void {
		if (this._expanded === expanded) return;
		this._expanded = expanded;
		this.clearRenderCache();
		this.rebuildContent();
	}

	override invalidate(): void {
		super.invalidate();
		this.clearRenderCache();
		this.rebuildContent();
	}

	protected getCachedRender(width: number): string[] | undefined {
		return this.renderCache.get(`${width}:${this.renderVersion}`);
	}

	protected setCachedRender(width: number, lines: string[]): string[] {
		return this.renderCache.set(`${width}:${this.renderVersion}`, lines);
	}

	protected clearRenderCache(): void {
		this.renderVersion++;
		this.renderCache.clear();
	}

	protected abstract rebuildContent(): void;
}
