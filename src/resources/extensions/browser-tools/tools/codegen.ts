import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";
import { getActionTimeline } from "../state.js";

/**
 * Test code generation — transform recorded browser session into a Playwright test script.
 */

export function registerCodegenTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_generate_test",
		label: "Browser Generate Test",
		description:
			"Generate a runnable Playwright test script from the recorded action timeline. " +
			"Transforms navigation, click, type, and assertion actions into standard Playwright test syntax. " +
			"Uses stable selectors (role-based preferred). Writes the test file to a configurable path.",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({ description: "Test name (used for describe/test block and filename). Default: 'recorded-session'." }),
			),
			outputPath: Type.Optional(
				Type.String({
					description:
						"Output file path for the generated test. Default: writes to session artifacts directory. " +
						"Use a path ending in .spec.ts for standard Playwright test convention.",
				}),
			),
			includeAssertions: Type.Optional(
				Type.Boolean({ description: "Include assertion steps from the timeline (default: true)." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				await deps.ensureBrowser();
				const timeline = getActionTimeline();

				if (timeline.entries.length === 0) {
					return {
						content: [{ type: "text", text: "No actions recorded in the current session. Interact with pages first, then generate a test." }],
						details: { error: "no_actions" },
						isError: true,
					};
				}

				const testName = params.name ?? "recorded-session";
				const includeAssertions = params.includeAssertions ?? true;

				// Transform timeline entries into Playwright test code
				const testLines: string[] = [];
				const imports = new Set<string>();
				imports.add("test");
				imports.add("expect");

				testLines.push(`test.describe('${escapeString(testName)}', () => {`);
				testLines.push(`  test('recorded session', async ({ page }) => {`);

				let lastUrl = "";
				let actionCount = 0;

				for (const entry of timeline.entries) {
					if (entry.status === "error" && entry.tool !== "browser_assert") continue;

					const params = parseParamsSummary(entry.paramsSummary);

					switch (entry.tool) {
						case "browser_navigate": {
							const url = params.url;
							if (url && url !== lastUrl) {
								testLines.push(`    await page.goto(${quote(url)});`);
								lastUrl = url;
								actionCount++;
							}
							break;
						}

						case "browser_click": {
							const selector = params.selector;
							if (selector) {
								testLines.push(`    await page.locator(${quote(selector)}).click();`);
								actionCount++;
							}
							break;
						}

						case "browser_click_ref": {
							// Refs are session-specific — add comment
							testLines.push(`    // browser_click_ref: ${entry.paramsSummary} — replace with stable selector`);
							actionCount++;
							break;
						}

						case "browser_type": {
							const selector = params.selector;
							const text = params.text;
							if (selector && text) {
								testLines.push(`    await page.locator(${quote(selector)}).fill(${quote(text)});`);
								actionCount++;
							}
							break;
						}

						case "browser_fill_ref": {
							testLines.push(`    // browser_fill_ref: ${entry.paramsSummary} — replace with stable selector`);
							actionCount++;
							break;
						}

						case "browser_key_press": {
							const key = params.key;
							if (key) {
								testLines.push(`    await page.keyboard.press(${quote(key)});`);
								actionCount++;
							}
							break;
						}

						case "browser_select_option": {
							const selector = params.selector;
							const option = params.option;
							if (selector && option) {
								testLines.push(`    await page.locator(${quote(selector)}).selectOption(${quote(option)});`);
								actionCount++;
							}
							break;
						}

						case "browser_set_checked": {
							const selector = params.selector;
							const checked = params.checked;
							if (selector) {
								testLines.push(`    await page.locator(${quote(selector)}).setChecked(${checked === "true"});`);
								actionCount++;
							}
							break;
						}

						case "browser_hover": {
							const selector = params.selector;
							if (selector) {
								testLines.push(`    await page.locator(${quote(selector)}).hover();`);
								actionCount++;
							}
							break;
						}

						case "browser_wait_for": {
							const condition = params.condition;
							const value = params.value;
							if (condition === "selector_visible" && value) {
								testLines.push(`    await expect(page.locator(${quote(value)})).toBeVisible();`);
								actionCount++;
							} else if (condition === "text_visible" && value) {
								testLines.push(`    await expect(page.locator('body')).toContainText(${quote(value)});`);
								actionCount++;
							} else if (condition === "url_contains" && value) {
								testLines.push(`    await page.waitForURL(${quote(`**/*${value}*`)});`);
								actionCount++;
							} else if (condition === "network_idle") {
								testLines.push(`    await page.waitForLoadState('networkidle');`);
								actionCount++;
							} else if (condition === "delay" && value) {
								testLines.push(`    await page.waitForTimeout(${value});`);
								actionCount++;
							}
							break;
						}

						case "browser_assert": {
							if (!includeAssertions) break;
							// The assertion details are in verificationSummary
							if (entry.verificationSummary) {
								testLines.push(`    // Assertion: ${entry.verificationSummary}`);
							}
							actionCount++;
							break;
						}

						case "browser_scroll": {
							const direction = params.direction;
							const amount = params.amount ?? "300";
							const delta = direction === "up" ? `-${amount}` : amount;
							testLines.push(`    await page.mouse.wheel(0, ${delta});`);
							actionCount++;
							break;
						}

						case "browser_set_viewport": {
							const width = params.width;
							const height = params.height;
							if (width && height) {
								testLines.push(`    await page.setViewportSize({ width: ${width}, height: ${height} });`);
								actionCount++;
							}
							break;
						}

						default:
							// Skip tools that don't map to Playwright test actions
							break;
					}
				}

				testLines.push(`  });`);
				testLines.push(`});`);

				const importLine = `import { ${[...imports].join(", ")} } from '@playwright/test';`;
				const fullTest = `${importLine}\n\n${testLines.join("\n")}\n`;

				// Write to file
				let outputPath: string;
				if (params.outputPath) {
					outputPath = params.outputPath;
				} else {
					const safeName = deps.sanitizeArtifactName(testName, "recorded-session");
					outputPath = deps.buildSessionArtifactPath(`${safeName}.spec.ts`);
				}

				await deps.ensureSessionArtifactDir();
				const { path: writtenPath, bytes } = await deps.writeArtifactFile(outputPath, fullTest);

				return {
					content: [{
						type: "text",
						text: `Test generated: ${writtenPath}\nActions: ${actionCount}\nTimeline entries processed: ${timeline.entries.length}\n\n${fullTest}`,
					}],
					details: {
						path: writtenPath,
						bytes,
						actionCount,
						timelineEntries: timeline.entries.length,
						testCode: fullTest,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Test generation failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}

function escapeString(s: string): string {
	return s.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
}

function quote(s: string): string {
	// Use single quotes for simple strings, backtick for those with quotes
	if (!s.includes("'")) return `'${s}'`;
	if (!s.includes("`")) return `\`${s}\``;
	return `'${s.replace(/'/g, "\\'")}'`;
}

/**
 * Parse the paramsSummary string back into key-value pairs.
 * Format: key="value", key=value, key=[N], key={...}
 */
function parseParamsSummary(summary: string): Record<string, string> {
	const result: Record<string, string> = {};
	if (!summary) return result;

	const regex = /(\w+)=(?:"([^"]*(?:\\"[^"]*)*)"|([^,\s]+))/g;
	let match;
	while ((match = regex.exec(summary)) !== null) {
		const key = match[1];
		const value = match[2] ?? match[3];
		result[key] = value;
	}
	return result;
}
