import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

export function registerPdfTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_save_pdf",
		label: "Browser Save PDF",
		description:
			"Render current page as PDF artifact via Playwright's page.pdf(). " +
			"Supports A4/Letter/custom page formats and optional background graphics. " +
			"Writes to session artifacts directory. Chromium only.",
		parameters: Type.Object({
			filename: Type.Optional(
				Type.String({ description: "Output filename (default: auto-generated from page title + timestamp)." }),
			),
			format: Type.Optional(
				Type.String({
					description:
						"Page format: 'A4' (default), 'Letter', 'Legal', 'Tabloid', or custom like '8.5in x 11in'. " +
						"Custom format uses CSS dimension syntax for width x height.",
				}),
			),
			printBackground: Type.Optional(
				Type.Boolean({ description: "Include background graphics (default: true)." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();

				const url = p.url();
				const title = await p.title().catch(() => "untitled");

				// Resolve filename
				const timestamp = deps.formatArtifactTimestamp(Date.now());
				const safeName = deps.sanitizeArtifactName(params.filename || `${title}-${timestamp}`, `pdf-${timestamp}`);
				const filename = safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`;

				// Resolve format
				const knownFormats = new Set(["A4", "Letter", "Legal", "Tabloid", "Ledger", "A0", "A1", "A2", "A3", "A5", "A6"]);
				const formatInput = params.format ?? "A4";
				let pdfOptions: Record<string, unknown> = {};

				if (knownFormats.has(formatInput)) {
					pdfOptions.format = formatInput;
				} else {
					// Custom format: parse "WIDTHin x HEIGHTin" or "WIDTHcm x HEIGHTcm" etc.
					const customMatch = formatInput.match(/^(.+?)\s*[xX×]\s*(.+)$/);
					if (customMatch) {
						pdfOptions.width = customMatch[1]!.trim();
						pdfOptions.height = customMatch[2]!.trim();
					} else {
						pdfOptions.format = "A4"; // fallback
					}
				}

				pdfOptions.printBackground = params.printBackground ?? true;

				// Generate PDF
				await deps.ensureSessionArtifactDir();
				const outputPath = deps.buildSessionArtifactPath(filename);
				pdfOptions.path = outputPath;

				await p.pdf(pdfOptions as any);

				// Read file size
				const { stat } = await import("node:fs/promises");
				const fileStat = await stat(outputPath);
				const sizeBytes = fileStat.size;
				const sizeKB = (sizeBytes / 1024).toFixed(1);

				return {
					content: [
						{
							type: "text",
							text: `PDF saved: ${outputPath}\nSize: ${sizeKB} KB\nFormat: ${formatInput}\nPage: ${title}\nURL: ${url}`,
						},
					],
					details: { path: outputPath, sizeBytes, format: formatInput, pageUrl: url, pageTitle: title },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `PDF generation failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}
