// Project/App: GSD-2
// File Purpose: Shared render cache helper for interactive TUI components.

export class RenderCache {
	private key?: string;
	private lines?: string[];

	get(key: string): string[] | undefined {
		return this.key === key ? this.lines : undefined;
	}

	set(key: string, lines: string[]): string[] {
		this.key = key;
		this.lines = lines;
		return lines;
	}

	clear(): void {
		this.key = undefined;
		this.lines = undefined;
	}
}
