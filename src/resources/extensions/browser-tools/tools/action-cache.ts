import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Action caching — cache semantic intent → selector mappings to skip LLM inference on repeat visits.
 * Internal optimization that hooks into browser_find_best / browser_act.
 */

interface CacheEntry {
	selector: string;
	score: number;
	url: string;
	domHash: string;
	timestamp: number;
	hitCount: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 200;

export function registerActionCacheTools(pi: ExtensionAPI, deps: ToolDeps): void {
	// -------------------------------------------------------------------------
	// browser_action_cache
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_action_cache",
		label: "Browser Action Cache",
		description:
			"Manage the action cache that maps page structure + intent → resolved selectors. " +
			"Cache reduces token cost on repeat visits to same pages. " +
			"Actions: 'stats' (show cache metrics), 'get' (lookup cached selector), " +
			"'put' (store a selector mapping), 'clear' (flush cache).",
		parameters: Type.Object({
			action: Type.String({
				description: "Cache action: 'stats', 'get', 'put', or 'clear'.",
			}),
			intent: Type.Optional(
				Type.String({ description: "Semantic intent key (for get/put). E.g., 'submit_form', 'close_dialog'." }),
			),
			selector: Type.Optional(
				Type.String({ description: "CSS selector to cache (for put)." }),
			),
			score: Type.Optional(
				Type.Number({ description: "Confidence score 0–1 for the cached selector (for put)." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();
				const url = p.url();

				switch (params.action) {
					case "stats": {
						const entries = [...cache.values()];
						const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0);
						return {
							content: [{
								type: "text",
								text: `Action cache: ${cache.size} entries, ${totalHits} total hits\nMax size: ${MAX_CACHE_SIZE}`,
							}],
							details: {
								size: cache.size,
								maxSize: MAX_CACHE_SIZE,
								totalHits,
								entries: entries.map((e) => ({
									url: e.url,
									selector: e.selector,
									hitCount: e.hitCount,
									score: e.score,
								})),
							},
						};
					}

					case "get": {
						if (!params.intent) {
							return {
								content: [{ type: "text", text: "Intent parameter required for 'get' action." }],
								details: { error: "missing_intent" },
								isError: true,
							};
						}

						const domHash = await computeDomHash(p);
						const key = buildCacheKey(url, domHash, params.intent);
						const entry = cache.get(key);

						if (!entry) {
							return {
								content: [{ type: "text", text: `Cache miss for intent "${params.intent}" on ${url}` }],
								details: { hit: false, intent: params.intent, url },
							};
						}

						// Validate the cached selector still exists
						const exists = await p.locator(entry.selector).first().isVisible().catch(() => false);
						if (!exists) {
							cache.delete(key);
							return {
								content: [{ type: "text", text: `Cache entry stale (selector no longer visible): ${entry.selector}` }],
								details: { hit: false, stale: true, selector: entry.selector },
							};
						}

						entry.hitCount++;
						return {
							content: [{
								type: "text",
								text: `Cache hit: "${params.intent}" → ${entry.selector} (score: ${entry.score}, hits: ${entry.hitCount})`,
							}],
							details: { hit: true, ...entry },
						};
					}

					case "put": {
						if (!params.intent || !params.selector) {
							return {
								content: [{ type: "text", text: "Intent and selector parameters required for 'put' action." }],
								details: { error: "missing_params" },
								isError: true,
							};
						}

						const domHash = await computeDomHash(p);
						const key = buildCacheKey(url, domHash, params.intent);

						// Evict oldest entries if at capacity
						if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
							const oldestKey = [...cache.entries()]
								.sort(([, a], [, b]) => a.timestamp - b.timestamp)[0]?.[0];
							if (oldestKey) cache.delete(oldestKey);
						}

						const entry: CacheEntry = {
							selector: params.selector,
							score: params.score ?? 1.0,
							url,
							domHash,
							timestamp: Date.now(),
							hitCount: 0,
						};
						cache.set(key, entry);

						return {
							content: [{
								type: "text",
								text: `Cached: "${params.intent}" → ${params.selector} (cache size: ${cache.size})`,
							}],
							details: { stored: true, key, ...entry, cacheSize: cache.size },
						};
					}

					case "clear": {
						const size = cache.size;
						cache.clear();
						return {
							content: [{ type: "text", text: `Action cache cleared (${size} entries removed).` }],
							details: { cleared: size },
						};
					}

					default:
						return {
							content: [{ type: "text", text: `Unknown action: ${params.action}. Use 'stats', 'get', 'put', or 'clear'.` }],
							details: { error: "unknown_action" },
							isError: true,
						};
				}
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Action cache error: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}

function buildCacheKey(url: string, domHash: string, intent: string): string {
	// Normalize URL — strip hash and query params for broader matching
	let normalized: string;
	try {
		const u = new URL(url);
		normalized = `${u.origin}${u.pathname}`;
	} catch {
		normalized = url;
	}
	return `${normalized}|${domHash}|${intent}`;
}

async function computeDomHash(page: any): Promise<string> {
	try {
		return await page.evaluate(() => {
			// Structural hash based on element count + tag distribution
			const tags = new Map<string, number>();
			const all = document.querySelectorAll("*");
			for (const el of all) {
				const tag = el.tagName;
				tags.set(tag, (tags.get(tag) ?? 0) + 1);
			}
			const entries = [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0]));
			const str = entries.map(([t, c]) => `${t}:${c}`).join("|");
			// Simple hash
			let h = 5381;
			for (let i = 0; i < str.length; i++) {
				h = ((h << 5) - h + str.charCodeAt(i)) | 0;
			}
			return (h >>> 0).toString(16);
		});
	} catch {
		return "unknown";
	}
}
