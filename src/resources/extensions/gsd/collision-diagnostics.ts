/**
 * Collision Diagnostics Module
 *
 * Bridges NamespacedRegistry collision data and NamespacedResolver ambiguous
 * resolution into a classified diagnostic taxonomy. Provides two functions:
 * - analyzeCollisions: Scans registry and resolver state to produce classified diagnostics
 * - doctorReport: Formats diagnostics into human-readable output with severity and remediation
 *
 * This module implements R010 (collision reporting) and R011 (doctor advice) for the
 * namespaced component system.
 */

import type { NamespacedRegistry, RegistryDiagnostic } from './namespaced-registry.js';
import type { NamespacedResolver, ResolutionResult } from './namespaced-resolver.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Classification of collision type.
 * - canonical-conflict: Two plugins registered the same canonical name (hard error)
 * - shorthand-overlap: Same bare name exists in multiple namespaces (ambiguity)
 * - alias-conflict: Alias shadows a canonical name or bare component name
 */
export type CollisionClass = 'canonical-conflict' | 'shorthand-overlap' | 'alias-conflict';

/**
 * Severity level for diagnostics.
 * - error: Hard collision that prevents correct resolution
 * - warning: Ambiguity that may cause surprising behavior
 */
export type DiagnosticSeverity = 'error' | 'warning';

/**
 * A classified diagnostic with full context for remediation.
 */
export interface ClassifiedDiagnostic {
	/** The collision classification */
	class: CollisionClass;

	/** Severity level */
	severity: DiagnosticSeverity;

	/** All canonical names involved in the collision */
	involvedCanonicalNames: string[];

	/** File paths to the conflicting components */
	filePaths: string[];

	/** Human-readable remediation advice */
	remediation: string;

	/** Optional: the bare name causing ambiguity (shorthand-overlap only) */
	ambiguousBareName?: string;

	/** Optional: the alias string (alias-conflict only) */
	alias?: string;

	/** Optional: the canonical name the alias points to (alias-conflict only) */
	aliasTarget?: string;

	/** Optional: type of alias conflict */
	aliasConflictType?: 'shadows-canonical' | 'shadows-bare-name';
}

/**
 * Doctor report with summary statistics and formatted entries.
 */
export interface DoctorReport {
	/** Summary counts by class */
	summary: {
		/** Total diagnostics */
		total: number;
		/** Canonical conflicts (errors) */
		canonicalConflicts: number;
		/** Shorthand overlaps (warnings) */
		shorthandOverlaps: number;
		/** Alias conflicts (warnings) */
		aliasConflicts: number;
	};

	/** Formatted report entries */
	entries: string[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Analyze a registry and resolver to produce classified diagnostics.
 *
 * This function:
 * 1. Reads registry.getDiagnostics() for canonical conflicts (→ error severity)
 * 2. Groups registry.getAll() by bare component.name
 * 3. For groups with 2+ entries, calls resolver.resolve(bareName) to confirm ambiguity
 * 4. Produces warning diagnostics for ambiguous shorthand resolution
 *
 * @param registry - The namespaced registry to analyze
 * @param resolver - The resolver to test ambiguity
 * @returns Array of classified diagnostics
 */
export function analyzeCollisions(
	registry: NamespacedRegistry,
	resolver: NamespacedResolver
): ClassifiedDiagnostic[] {
	const diagnostics: ClassifiedDiagnostic[] = [];

	// Step 1: Process canonical conflicts from registry diagnostics
	const registryDiagnostics = registry.getDiagnostics();
	for (const diag of registryDiagnostics) {
		if (diag.type === 'collision') {
			diagnostics.push({
				class: 'canonical-conflict',
				severity: 'error',
				involvedCanonicalNames: [diag.collision.canonicalName],
				filePaths: [diag.collision.winnerPath, diag.collision.loserPath],
				remediation: `Canonical name "${diag.collision.canonicalName}" registered multiple times. ` +
					`The first registration (${diag.collision.winnerSource ?? 'unknown source'}) ` +
					`took precedence over subsequent registration (${diag.collision.loserSource ?? 'unknown source'}). ` +
					`Rename one of the conflicting components to resolve.`,
			});
		}
	}

	// Step 2: Find shorthand overlaps by grouping components by bare name
	const components = registry.getAll();
	const byBareName = new Map<string, typeof components>();

	for (const component of components) {
		const bareName = component.name;
		if (!byBareName.has(bareName)) {
			byBareName.set(bareName, []);
		}
		byBareName.get(bareName)!.push(component);
	}

	// Step 3: For groups with 2+ entries, check if resolver confirms ambiguity
	for (const [bareName, candidates] of byBareName) {
		if (candidates.length >= 2) {
			// Use resolver to confirm ambiguity
			const result = resolver.resolve(bareName);

			if (result.resolution === 'ambiguous') {
				// This is a shorthand overlap
				const canonicalNames = candidates.map(c => c.canonicalName);
				const filePaths = candidates.map(c => c.filePath);

				diagnostics.push({
					class: 'shorthand-overlap',
					severity: 'warning',
					involvedCanonicalNames: canonicalNames,
					filePaths,
					remediation: formatShorthandRemediation(bareName, canonicalNames),
					ambiguousBareName: bareName,
				});
			}
			// If resolution is 'shorthand' or 'local-first', the overlap is resolved
			// unambiguously by the resolver, so we don't warn
		}
	}

	// Step 4: Check for alias conflicts
	const aliases = registry.getAliases();
	const canonicalNamesSet = new Set(components.map(c => c.canonicalName));

	for (const [alias, targetCanonical] of aliases) {
		// Check if alias shadows a canonical name
		// (This can happen if a component was registered AFTER the alias was created)
		if (canonicalNamesSet.has(alias)) {
			const shadowedComponent = components.find(c => c.canonicalName === alias);
			const aliasedComponent = components.find(c => c.canonicalName === targetCanonical);

			diagnostics.push({
				class: 'alias-conflict',
				severity: 'warning',
				involvedCanonicalNames: [alias, targetCanonical],
				filePaths: [
					shadowedComponent?.filePath ?? '<unknown>',
					aliasedComponent?.filePath ?? '<unknown>',
				],
				remediation: formatAliasShadowsCanonicalRemediation(alias, targetCanonical),
				alias,
				aliasTarget: targetCanonical,
				aliasConflictType: 'shadows-canonical',
			});
			continue; // Skip further checks for this alias
		}

		// Check if alias shadows a bare name (matches component.name in any namespace)
		const matchingBareNames = components.filter(c => c.name === alias);
		if (matchingBareNames.length > 0) {
			const filePaths = matchingBareNames.map(c => c.filePath);
			const aliasedComponent = components.find(c => c.canonicalName === targetCanonical);
			if (aliasedComponent) filePaths.push(aliasedComponent.filePath);

			diagnostics.push({
				class: 'alias-conflict',
				severity: 'warning',
				involvedCanonicalNames: [targetCanonical, ...matchingBareNames.map(c => c.canonicalName)],
				filePaths,
				remediation: formatAliasShadowsBareNameRemediation(alias, targetCanonical, matchingBareNames.map(c => c.canonicalName)),
				alias,
				aliasTarget: targetCanonical,
				aliasConflictType: 'shadows-bare-name',
			});
		}
	}

	return diagnostics;
}

/**
 * Format remediation advice for shorthand overlap.
 *
 * @param bareName - The ambiguous bare name
 * @param canonicalNames - All canonical names that match
 * @returns Human-readable remediation message
 */
function formatShorthandRemediation(bareName: string, canonicalNames: string[]): string {
	const suggestions = canonicalNames
		.map(cn => `\`${cn}\``)
		.join(', ');

	return `Bare name "${bareName}" is ambiguous across ${canonicalNames.length} namespaces. ` +
		`Use a canonical name (${suggestions}) to avoid ambiguity.`;
}

/**
 * Format remediation advice for alias shadowing a canonical name.
 *
 * @param alias - The alias that shadows a canonical name
 * @param targetCanonical - The canonical name the alias points to
 * @returns Human-readable remediation message
 */
function formatAliasShadowsCanonicalRemediation(alias: string, targetCanonical: string): string {
	return `Alias "${alias}" shadows an existing canonical name. ` +
		`The alias points to "${targetCanonical}", but resolving "${alias}" will now match the component, not the alias. ` +
		`Consider rename or remove the alias to avoid confusion.`;
}

/**
 * Format remediation advice for alias shadowing a bare name.
 *
 * @param alias - The alias that shadows bare names
 * @param targetCanonical - The canonical name the alias points to
 * @param shadowedCanonicals - The canonical names whose bare names are shadowed
 * @returns Human-readable remediation message
 */
function formatAliasShadowsBareNameRemediation(
	alias: string,
	targetCanonical: string,
	shadowedCanonicals: string[]
): string {
	const shadowed = shadowedCanonicals.map(cn => `\`${cn}\``).join(', ');
	return `Alias "${alias}" shadows ${shadowedCanonicals.length} component(s) with the same bare name (${shadowed}). ` +
		`Resolving "${alias}" will use the alias (pointing to "${targetCanonical}"), not shorthand resolution. ` +
		`Use canonical names to be explicit, or rename the alias if this is unintended.`;
}

/**
 * Format diagnostics into a human-readable doctor report.
 *
 * Each diagnostic is formatted with:
 * - Severity icon (❌ error / ⚠️ warning)
 * - Description of the issue
 * - Involved file paths
 * - Remediation advice
 *
 * @param diagnostics - Array of classified diagnostics
 * @returns Doctor report with summary and formatted entries
 */
export function doctorReport(diagnostics: ClassifiedDiagnostic[]): DoctorReport {
	const summary = {
		total: diagnostics.length,
		canonicalConflicts: diagnostics.filter(d => d.class === 'canonical-conflict').length,
		shorthandOverlaps: diagnostics.filter(d => d.class === 'shorthand-overlap').length,
		aliasConflicts: diagnostics.filter(d => d.class === 'alias-conflict').length,
	};

	const entries = diagnostics.map(diagnostic => formatDiagnosticEntry(diagnostic));

	return { summary, entries };
}

/**
 * Format a single diagnostic entry for display.
 *
 * @param diagnostic - The diagnostic to format
 * @returns Formatted string entry
 */
function formatDiagnosticEntry(diagnostic: ClassifiedDiagnostic): string {
	const icon = diagnostic.severity === 'error' ? '❌' : '⚠️';
	const lines: string[] = [];

	// Header with severity and class
	lines.push(`${icon} ${diagnostic.class.toUpperCase()}`);

	// Description
	if (diagnostic.class === 'canonical-conflict') {
		lines.push(`   Canonical name conflict: ${diagnostic.involvedCanonicalNames[0]}`);
	} else if (diagnostic.class === 'alias-conflict') {
		if (diagnostic.aliasConflictType === 'shadows-canonical') {
			lines.push(`   Alias "${diagnostic.alias}" shadows canonical name (points to ${diagnostic.aliasTarget})`);
		} else {
			lines.push(`   Alias "${diagnostic.alias}" shadows bare name (points to ${diagnostic.aliasTarget})`);
		}
	} else {
		lines.push(`   Shorthand overlap: "${diagnostic.ambiguousBareName}" matches ${diagnostic.involvedCanonicalNames.length} components`);
	}

	// File paths
	lines.push('   Files:');
	for (const path of diagnostic.filePaths) {
		lines.push(`     - ${path}`);
	}

	// Remediation
	lines.push(`   Remediation: ${diagnostic.remediation}`);

	return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export default {
	analyzeCollisions,
	doctorReport,
};
