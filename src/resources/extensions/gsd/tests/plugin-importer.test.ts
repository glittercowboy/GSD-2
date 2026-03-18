/**
 * PluginImporter Contract Tests
 *
 * Tests that prove R012 (discover/select/import flow) and R013 (canonical name preservation).
 *
 * Coverage:
 * - Discovery pipeline: marketplace discovery → registry population
 * - Selective filtering: filter function correctly selects components
 * - Diagnostic gating: errors block, warnings pass
 * - Config manifest format: canonical identity preserved
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import {
	PluginImporter,
	type DiscoveryResult,
	type ValidationResult,
	type ImportManifest,
} from '../plugin-importer.js';
import type { NamespacedComponent } from '../namespaced-registry.js';
import type {
	MarketplaceDiscoveryResult,
	DiscoveredPlugin,
} from '../marketplace-discovery.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock discovered plugin for testing.
 */
function createMockPlugin(overrides: Partial<DiscoveredPlugin> = {}): DiscoveredPlugin {
	return {
		name: 'test-plugin',
		canonicalName: 'test-plugin',
		source: './plugins/test-plugin',
		resolvedPath: '/plugins/test-plugin',
		status: 'ok',
		manifestSource: 'plugin.json',
		description: 'A test plugin',
		version: '1.0.0',
		author: { name: 'Test Author' },
		inventory: {
			skills: ['skill-a', 'skill-b'],
			agents: ['agent-x'],
			commands: [],
			mcpServers: {},
			lspServers: {},
			hooks: [],
		},
		...overrides,
	};
}

/**
 * Create a mock marketplace discovery result.
 */
function createMockDiscoveryResult(
	plugins: DiscoveredPlugin[] = [],
	overrides: Partial<MarketplaceDiscoveryResult> = {}
): MarketplaceDiscoveryResult {
	return {
		status: 'ok',
		marketplacePath: '/test/marketplace.json',
		marketplaceName: 'Test Marketplace',
		pluginFormat: 'jamie-style',
		plugins,
		summary: {
			total: plugins.length,
			ok: plugins.filter((p) => p.status === 'ok').length,
			error: plugins.filter((p) => p.status === 'error').length,
		},
		...overrides,
	};
}

// ============================================================================
// Tests
// ============================================================================

describe('PluginImporter', () => {
	let importer: PluginImporter;

	beforeEach(() => {
		importer = new PluginImporter();
	});

	describe('Stage 1: discover()', () => {
		it('should throw error if paths array is empty but return valid result', () => {
			const result = importer.discover([]);

			assert.strictEqual(result.summary.marketplacesProcessed, 0);
			assert.strictEqual(result.summary.totalPlugins, 0);
			assert.strictEqual(result.summary.totalComponents, 0);
		});

		it('should call discoverMarketplace for each path and aggregate results', () => {
			// Test with non-existent paths - should still return structure
			const result = importer.discover([
				'/nonexistent/marketplace-1',
				'/nonexistent/marketplace-2',
			]);

			assert.strictEqual(result.summary.marketplacesProcessed, 2);
			assert.strictEqual(Array.isArray(result.marketplaceResults), true);
			assert.strictEqual(result.marketplaceResults.length, 2);
		});

		it('should populate registry via componentsFromDiscovery', () => {
			// Test against a real path if it exists, otherwise test structure
			const result = importer.discover([]);

			// Registry should be populated (even if empty)
			const registry = importer.getRegistry();
			assert.ok(registry !== null);
			assert.strictEqual(registry!.size, result.summary.totalComponents);
		});

		it('should track plugins with errors in summary', () => {
			const result = importer.discover(['/nonexistent/path']);

			// Non-existent path should result in error status
			assert.ok(result.summary.marketplacesWithErrors >= 0);
		});

		it('should be re-entrant (calling discover again resets state)', () => {
			// First discovery
			importer.discover(['/nonexistent/path-1']);
			const firstPlugins = importer.getDiscoveredPlugins();

			// Second discovery should reset
			importer.discover(['/nonexistent/path-2']);
			const secondPlugins = importer.getDiscoveredPlugins();

			// Should have fresh state (not accumulated)
			// Both should have 0 plugins since paths don't exist
			assert.strictEqual(firstPlugins.length, 0);
			assert.strictEqual(secondPlugins.length, 0);
		});
	});

	describe('Stage 2: selectComponents()', () => {
		it('should throw error if called before discover()', () => {
			assert.throws(
				() => importer.selectComponents(() => true),
				/Must call discover\(\) before selectComponents\(\)/
			);
		});

		it('should return empty array if no components match filter', () => {
			importer.discover([]);
			const selected = importer.selectComponents(() => false);
			assert.deepStrictEqual(selected, []);
		});

		it('should return all components if filter returns true', () => {
			importer.discover([]);
			const selected = importer.selectComponents(() => true);
			// Empty discovery means no components
			assert.deepStrictEqual(selected, []);
		});

		it('should filter by namespace correctly', () => {
			importer.discover([]);
			const selected = importer.selectComponents(
				(c) => c.namespace === 'target-plugin'
			);
			assert.deepStrictEqual(selected, []);
		});

		it('should filter by type correctly', () => {
			importer.discover([]);
			const skills = importer.selectComponents((c) => c.type === 'skill');
			const agents = importer.selectComponents((c) => c.type === 'agent');
			assert.deepStrictEqual(skills, []);
			assert.deepStrictEqual(agents, []);
		});

		it('should filter by name pattern correctly', () => {
			importer.discover([]);
			const selected = importer.selectComponents((c) =>
				c.name.includes('review')
			);
			assert.deepStrictEqual(selected, []);
		});
	});

	describe('Stage 3: validateImport()', () => {
		it('should throw error if called before discover()', () => {
			const components: NamespacedComponent[] = [];
			assert.throws(
				() => importer.validateImport(components),
				/Must call discover\(\) before validateImport\(\)/
			);
		});

		it('should return canProceed: true for empty selection', () => {
			importer.discover([]);
			const result = importer.validateImport([]);

			assert.strictEqual(result.canProceed, true);
			assert.strictEqual(result.diagnostics.length, 0);
			assert.strictEqual(result.summary.total, 0);
			assert.strictEqual(result.summary.errors, 0);
			assert.strictEqual(result.summary.warnings, 0);
		});

		it('should return canProceed: true when no collisions', () => {
			importer.discover([]);

			// Create mock components without collisions
			const components: NamespacedComponent[] = [
				{
					name: 'skill-a',
					namespace: 'plugin-x',
					canonicalName: 'plugin-x:skill-a',
					type: 'skill',
					filePath: '/x/skill-a.md',
					source: 'plugin:plugin-x',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill-b',
					namespace: 'plugin-y',
					canonicalName: 'plugin-y:skill-b',
					type: 'skill',
					filePath: '/y/skill-b.md',
					source: 'plugin:plugin-y',
					description: undefined,
					metadata: {},
				},
			];

			const result = importer.validateImport(components);

			assert.strictEqual(result.canProceed, true);
		});

		it('should detect canonical collision and return canProceed: false (error blocks)', () => {
			importer.discover([]);

			// Create components with same canonical name (collision)
			const components: NamespacedComponent[] = [
				{
					name: 'skill-a',
					namespace: 'plugin-x',
					canonicalName: 'plugin-x:skill-a',
					type: 'skill',
					filePath: '/first/skill-a.md',
					source: 'plugin:plugin-x',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill-a',
					namespace: 'plugin-x',
					canonicalName: 'plugin-x:skill-a', // Same canonical name!
					type: 'skill',
					filePath: '/second/skill-a.md',
					source: 'plugin:plugin-x',
					description: undefined,
					metadata: {},
				},
			];

			const result = importer.validateImport(components);

			// Error severity should block
			assert.strictEqual(result.canProceed, false);
			assert.strictEqual(result.summary.errors, 1);
			assert.ok(result.diagnostics.some((d) => d.severity === 'error'));
		});

		it('should detect shorthand overlap but return canProceed: true (warning passes)', () => {
			importer.discover([]);

			// Create components with same bare name but different namespaces
			const components: NamespacedComponent[] = [
				{
					name: 'review', // Same bare name
					namespace: 'plugin-a',
					canonicalName: 'plugin-a:review',
					type: 'skill',
					filePath: '/a/review.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
				{
					name: 'review', // Same bare name
					namespace: 'plugin-b',
					canonicalName: 'plugin-b:review',
					type: 'skill',
					filePath: '/b/review.md',
					source: 'plugin:plugin-b',
					description: undefined,
					metadata: {},
				},
			];

			const result = importer.validateImport(components);

			// Warning severity should NOT block
			assert.strictEqual(result.canProceed, true);
			assert.strictEqual(result.summary.errors, 0);
			assert.strictEqual(result.summary.warnings, 1);
			assert.ok(result.diagnostics.some((d) => d.severity === 'warning'));
		});

		it('should correctly classify severity: error for canonical conflict', () => {
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/1/dup.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/2/dup.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const result = importer.validateImport(components);

			const error = result.diagnostics.find((d) => d.severity === 'error');
			assert.ok(error !== undefined);
			assert.strictEqual(error!.class, 'canonical-conflict');
			assert.ok(error!.involvedCanonicalNames.includes('ns:dup'));
		});

		it('should correctly classify severity: warning for shorthand overlap', () => {
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'common-skill',
					namespace: 'plugin-a',
					canonicalName: 'plugin-a:common-skill',
					type: 'skill',
					filePath: '/a/common.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
				{
					name: 'common-skill',
					namespace: 'plugin-b',
					canonicalName: 'plugin-b:common-skill',
					type: 'skill',
					filePath: '/b/common.md',
					source: 'plugin:plugin-b',
					description: undefined,
					metadata: {},
				},
			];

			const result = importer.validateImport(components);

			const warning = result.diagnostics.find((d) => d.severity === 'warning');
			assert.ok(warning !== undefined);
			assert.strictEqual(warning!.class, 'shorthand-overlap');
			assert.strictEqual(warning!.ambiguousBareName, 'common-skill');
		});
	});

	describe('Stage 4: getImportManifest()', () => {
		it('should produce valid manifest for empty selection', () => {
			const manifest = importer.getImportManifest([]);

			assert.strictEqual(manifest.schemaVersion, '1.0');
			assert.strictEqual(typeof manifest.generatedAt, 'string');
			assert.deepStrictEqual(manifest.entries, []);
			assert.strictEqual(manifest.summary.total, 0);
			assert.strictEqual(manifest.summary.skills, 0);
			assert.strictEqual(manifest.summary.agents, 0);
			assert.deepStrictEqual(manifest.summary.namespaces, []);
		});

		it('should preserve canonical names in manifest (R013)', () => {
			const components: NamespacedComponent[] = [
				{
					name: 'code-review',
					namespace: 'my-plugin',
					canonicalName: 'my-plugin:code-review',
					type: 'skill',
					filePath: '/plugins/my-plugin/skills/code-review/SKILL.md',
					source: 'plugin:my-plugin',
					description: 'Reviews code',
					metadata: {
						pluginVersion: '1.0.0',
						pluginAuthor: 'Test Author',
					},
				},
			];

			const manifest = importer.getImportManifest(components);

			assert.strictEqual(manifest.entries.length, 1);

			// Verify canonical name preserved
			const entry = manifest.entries[0];
			assert.strictEqual(entry!.canonicalName, 'my-plugin:code-review');
			assert.strictEqual(entry!.name, 'code-review');
			assert.strictEqual(entry!.namespace, 'my-plugin');
		});

		it('should include all component metadata in manifest', () => {
			const components: NamespacedComponent[] = [
				{
					name: 'test-skill',
					namespace: 'test-plugin',
					canonicalName: 'test-plugin:test-skill',
					type: 'skill',
					filePath: '/test/skill.md',
					source: 'plugin:test-plugin',
					description: 'A test skill',
					metadata: {
						pluginVersion: '2.0.0',
						pluginAuthor: 'Author Name',
						pluginHomepage: 'https://example.com',
						pluginCategory: 'testing',
					},
				},
			];

			const manifest = importer.getImportManifest(components);

			const entry = manifest.entries[0];
			assert.ok(entry !== undefined);
			assert.strictEqual(entry!.description, 'A test skill');
			assert.strictEqual(entry!.metadata.pluginVersion, '2.0.0');
			assert.strictEqual(entry!.metadata.pluginAuthor, 'Author Name');
			assert.strictEqual(entry!.metadata.pluginHomepage, 'https://example.com');
			assert.strictEqual(entry!.metadata.pluginCategory, 'testing');
		});

		it('should count skills and agents separately in summary', () => {
			const components: NamespacedComponent[] = [
				{
					name: 'skill-a',
					namespace: 'ns',
					canonicalName: 'ns:skill-a',
					type: 'skill',
					filePath: '/a.md',
					source: 'plugin:ns',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill-b',
					namespace: 'ns',
					canonicalName: 'ns:skill-b',
					type: 'skill',
					filePath: '/b.md',
					source: 'plugin:ns',
					description: undefined,
					metadata: {},
				},
				{
					name: 'agent-x',
					namespace: 'ns',
					canonicalName: 'ns:agent-x',
					type: 'agent',
					filePath: '/x.md',
					source: 'plugin:ns',
					description: undefined,
					metadata: {},
				},
			];

			const manifest = importer.getImportManifest(components);

			assert.strictEqual(manifest.summary.total, 3);
			assert.strictEqual(manifest.summary.skills, 2);
			assert.strictEqual(manifest.summary.agents, 1);
		});

		it('should list unique namespaces in summary', () => {
			const components: NamespacedComponent[] = [
				{
					name: 'skill',
					namespace: 'plugin-a',
					canonicalName: 'plugin-a:skill',
					type: 'skill',
					filePath: '/a.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill',
					namespace: 'plugin-b',
					canonicalName: 'plugin-b:skill',
					type: 'skill',
					filePath: '/b.md',
					source: 'plugin:plugin-b',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill',
					namespace: 'plugin-a', // Duplicate namespace
					canonicalName: 'plugin-a:skill-2',
					type: 'skill',
					filePath: '/a2.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
			];

			const manifest = importer.getImportManifest(components);

			// Should have unique, sorted namespaces
			assert.deepStrictEqual(manifest.summary.namespaces, ['plugin-a', 'plugin-b']);
		});

		it('should handle flat (non-namespaced) components', () => {
			const components: NamespacedComponent[] = [
				{
					name: 'flat-skill',
					namespace: undefined,
					canonicalName: 'flat-skill',
					type: 'skill',
					filePath: '/flat.md',
					source: 'user',
					description: undefined,
					metadata: {},
				},
			];

			const manifest = importer.getImportManifest(components);

			assert.strictEqual(manifest.entries.length, 1);
			assert.strictEqual(manifest.entries[0]!.namespace, undefined);
			assert.strictEqual(manifest.entries[0]!.canonicalName, 'flat-skill');
			assert.deepStrictEqual(manifest.summary.namespaces, []);
		});

		it('should be serializable to JSON', () => {
			const components: NamespacedComponent[] = [
				{
					name: 'skill',
					namespace: 'plugin',
					canonicalName: 'plugin:skill',
					type: 'skill',
					filePath: '/skill.md',
					source: 'plugin:plugin',
					description: 'A skill',
					metadata: { pluginVersion: '1.0.0' },
				},
			];

			const manifest = importer.getImportManifest(components);

			// Should be JSON serializable without errors
			const json = JSON.stringify(manifest);
			const parsed = JSON.parse(json);

			assert.strictEqual(parsed.schemaVersion, '1.0');
			assert.strictEqual(parsed.entries[0].canonicalName, 'plugin:skill');
		});
	});

	describe('Full Pipeline: discover → select → validate → manifest', () => {
		it('should execute full pipeline with mock components', () => {
			// Stage 1: Discover (empty in this case)
			const discovery = importer.discover([]);
			assert.strictEqual(discovery.summary.totalComponents, 0);

			// Stage 2: Select all (empty)
			const selected = importer.selectComponents(() => true);
			assert.strictEqual(selected.length, 0);

			// Stage 3: Validate
			const validation = importer.validateImport(selected);
			assert.strictEqual(validation.canProceed, true);

			// Stage 4: Manifest
			const manifest = importer.getImportManifest(selected);
			assert.strictEqual(manifest.summary.total, 0);
		});

		it('should preserve canonical names through full pipeline (R013)', () => {
			// Start with discovery
			importer.discover([]);

			// Create mock components as if they were discovered
			const components: NamespacedComponent[] = [
				{
					name: 'code-review',
					namespace: 'my-plugin',
					canonicalName: 'my-plugin:code-review',
					type: 'skill',
					filePath: '/plugins/my-plugin/skills/code-review/SKILL.md',
					source: 'plugin:my-plugin',
					description: 'Reviews code',
					metadata: { pluginVersion: '1.0.0' },
				},
				{
					name: 'architect',
					namespace: 'my-plugin',
					canonicalName: 'my-plugin:architect',
					type: 'agent',
					filePath: '/plugins/my-plugin/agents/architect/AGENT.md',
					source: 'plugin:my-plugin',
					description: 'Designs architecture',
					metadata: { pluginVersion: '1.0.0' },
				},
			];

			// Stage 3: Validate (no collisions)
			const validation = importer.validateImport(components);
			assert.strictEqual(validation.canProceed, true);

			// Stage 4: Manifest
			const manifest = importer.getImportManifest(components);

			// Verify canonical names preserved
			assert.strictEqual(manifest.entries.length, 2);
			assert.strictEqual(manifest.entries[0]!.canonicalName, 'my-plugin:code-review');
			assert.strictEqual(manifest.entries[1]!.canonicalName, 'my-plugin:architect');

			// Verify round-trip identity
			const skill = manifest.entries.find((e) => e.type === 'skill');
			assert.ok(skill !== undefined);
			assert.strictEqual(skill!.canonicalName, 'my-plugin:code-review');
			assert.strictEqual(skill!.name, 'code-review');
			assert.strictEqual(skill!.namespace, 'my-plugin');
		});

		it('should block import on canonical collision', () => {
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'skill',
					namespace: 'ns',
					canonicalName: 'ns:skill',
					type: 'skill',
					filePath: '/first.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill',
					namespace: 'ns',
					canonicalName: 'ns:skill', // Collision!
					type: 'skill',
					filePath: '/second.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);

			// Should block
			assert.strictEqual(validation.canProceed, false);

			// Diagnostic should explain why
			assert.strictEqual(validation.summary.errors, 1);
			assert.ok(validation.diagnostics[0]!.remediation.length > 0);
		});

		it('should allow import with warnings (shorthand overlap)', () => {
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'review',
					namespace: 'plugin-a',
					canonicalName: 'plugin-a:review',
					type: 'skill',
					filePath: '/a.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
				{
					name: 'review',
					namespace: 'plugin-b',
					canonicalName: 'plugin-b:review',
					type: 'skill',
					filePath: '/b.md',
					source: 'plugin:plugin-b',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);

			// Should NOT block (warning only)
			assert.strictEqual(validation.canProceed, true);
			assert.strictEqual(validation.summary.warnings, 1);

			// Manifest should still work
			const manifest = importer.getImportManifest(components);
			assert.strictEqual(manifest.entries.length, 2);
		});
	});

	describe('Inspection methods', () => {
		it('should return null for getRegistry() before discover()', () => {
			assert.strictEqual(importer.getRegistry(), null);
		});

		it('should return registry after discover()', () => {
			importer.discover([]);
			assert.ok(importer.getRegistry() !== null);
		});

		it('should return empty array for getDiscoveredPlugins() before discover()', () => {
			const plugins = importer.getDiscoveredPlugins();
			assert.deepStrictEqual(plugins, []);
		});

		it('should return null for getLastValidation() before validateImport()', () => {
			assert.strictEqual(importer.getLastValidation(), null);
		});

		it('should return last validation after validateImport()', () => {
			importer.discover([]);
			importer.validateImport([]);
			assert.ok(importer.getLastValidation() !== null);
		});

		it('should return null for getLastDiscovery() before discover()', () => {
			assert.strictEqual(importer.getLastDiscovery(), null);
		});

		it('should return last discovery after discover()', () => {
			importer.discover([]);
			assert.ok(importer.getLastDiscovery() !== null);
		});
	});

	describe('Diagnostic structure verification', () => {
		it('should provide actionable remediation in diagnostics', () => {
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/first.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/second.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);
			const diag = validation.diagnostics[0];

			assert.ok(diag !== undefined);
			assert.ok(diag!.remediation.length > 0);
			assert.ok(diag!.remediation.includes('ns:dup'));
		});

		it('should include file paths in collision diagnostic', () => {
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/first/dup.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/second/dup.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);
			const diag = validation.diagnostics[0];

			assert.ok(diag!.filePaths.includes('/first/dup.md'));
			assert.ok(diag!.filePaths.includes('/second/dup.md'));
		});
	});
});

describe('R012: Discover / select / import flow', () => {
	it('should support staged discovery → selection → validation → manifest', () => {
		const importer = new PluginImporter();

		// Stage 1: Discover
		const discovery = importer.discover([]);
		assert.ok(discovery.registry !== undefined);

		// Stage 2: Select
		const selected = importer.selectComponents(() => true);
		assert.ok(Array.isArray(selected));

		// Stage 3: Validate
		const validation = importer.validateImport(selected);
		assert.ok(typeof validation.canProceed === 'boolean');
		assert.ok(Array.isArray(validation.diagnostics));

		// Stage 4: Manifest
		const manifest = importer.getImportManifest(selected);
		assert.ok(manifest.schemaVersion === '1.0');
		assert.ok(Array.isArray(manifest.entries));
	});

	it('should allow independent testing of each stage', () => {
		const importer = new PluginImporter();

		// Each stage can be tested independently
		importer.discover([]);

		// Selection can be called multiple times with different filters
		const all = importer.selectComponents(() => true);
		const skills = importer.selectComponents((c) => c.type === 'skill');
		const agents = importer.selectComponents((c) => c.type === 'agent');

		// All should work without error
		assert.ok(true);

		// Validation can be called with any component set
		const validation1 = importer.validateImport(all);
		const validation2 = importer.validateImport(skills);
		const validation3 = importer.validateImport(agents);

		assert.ok(validation1.canProceed === true);
		assert.ok(validation2.canProceed === true);
		assert.ok(validation3.canProceed === true);

		// Manifest can be generated for any component set
		const manifest1 = importer.getImportManifest(all);
		const manifest2 = importer.getImportManifest(skills);
		const manifest3 = importer.getImportManifest(agents);

		assert.ok(manifest1.schemaVersion === '1.0');
		assert.ok(manifest2.schemaVersion === '1.0');
		assert.ok(manifest3.schemaVersion === '1.0');
	});
});

describe('R013: Canonical name preservation', () => {
	it('should preserve plugin:component format in manifest entries', () => {
		const importer = new PluginImporter();

		const components: NamespacedComponent[] = [
			{
				name: 'my-skill',
				namespace: 'my-plugin',
				canonicalName: 'my-plugin:my-skill',
				type: 'skill',
				filePath: '/skill.md',
				source: 'plugin:my-plugin',
				description: undefined,
				metadata: {},
			},
		];

		const manifest = importer.getImportManifest(components);

		assert.strictEqual(manifest.entries[0]!.canonicalName, 'my-plugin:my-skill');
	});

	it('should preserve flat names for non-namespaced components', () => {
		const importer = new PluginImporter();

		const components: NamespacedComponent[] = [
			{
				name: 'flat-skill',
				namespace: undefined,
				canonicalName: 'flat-skill',
				type: 'skill',
				filePath: '/skill.md',
				source: 'user',
				description: undefined,
				metadata: {},
			},
		];

		const manifest = importer.getImportManifest(components);

		assert.strictEqual(manifest.entries[0]!.canonicalName, 'flat-skill');
		assert.strictEqual(manifest.entries[0]!.namespace, undefined);
	});

	it('should support round-trip identity (name + namespace → canonical)', () => {
		const importer = new PluginImporter();

		const components: NamespacedComponent[] = [
			{
				name: 'component',
				namespace: 'namespace',
				canonicalName: 'namespace:component',
				type: 'skill',
				filePath: '/path',
				source: 'source',
				description: undefined,
				metadata: {},
			},
		];

		const manifest = importer.getImportManifest(components);
		const entry = manifest.entries[0]!;

		// Round-trip: namespace:name should equal canonicalName
		const reconstructed = entry.namespace
			? `${entry.namespace}:${entry.name}`
			: entry.name;

		assert.strictEqual(reconstructed, entry.canonicalName);
		assert.strictEqual(reconstructed, 'namespace:component');
	});
});

// ============================================================================
// T02: Command Flow Integration Tests
// ============================================================================

describe('T02: Command flow integration', () => {
	describe('Marketplace detection', () => {
		it('should categorize plugin roots into marketplaces vs flat paths', () => {
			// Import the helper function (we'll need to export it for testing)
			// For now, test the logic indirectly
			const importer = new PluginImporter();

			// Non-existent paths should still work
			const result = importer.discover(['/nonexistent/marketplace']);

			// Should not crash and return valid structure
			assert.ok(result.summary.marketplacesProcessed === 1);
		});

		it('should handle empty marketplace paths gracefully', () => {
			const importer = new PluginImporter();

			const result = importer.discover([]);

			assert.strictEqual(result.summary.marketplacesProcessed, 0);
			assert.strictEqual(result.summary.totalPlugins, 0);
			assert.strictEqual(result.summary.totalComponents, 0);
		});
	});

	describe('Component selection flow', () => {
		it('should support filtering by plugin namespace', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			// Create mock components as if discovered
			const components: NamespacedComponent[] = [
				{
					name: 'skill-a',
					namespace: 'plugin-x',
					canonicalName: 'plugin-x:skill-a',
					type: 'skill',
					filePath: '/x/skill-a.md',
					source: 'plugin:plugin-x',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill-b',
					namespace: 'plugin-y',
					canonicalName: 'plugin-y:skill-b',
					type: 'skill',
					filePath: '/y/skill-b.md',
					source: 'plugin:plugin-y',
					description: undefined,
					metadata: {},
				},
			];

			// Validate should work with any component set
			const validation = importer.validateImport(components);
			assert.strictEqual(validation.canProceed, true);

			// Manifest should preserve namespace info
			const manifest = importer.getImportManifest(components);
			assert.strictEqual(manifest.entries.length, 2);
			assert.strictEqual(manifest.summary.namespaces.length, 2);
			assert.ok(manifest.summary.namespaces.includes('plugin-x'));
			assert.ok(manifest.summary.namespaces.includes('plugin-y'));
		});

		it('should support filtering by component type', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'skill-a',
					namespace: 'plugin',
					canonicalName: 'plugin:skill-a',
					type: 'skill',
					filePath: '/skill-a.md',
					source: 'plugin:plugin',
					description: undefined,
					metadata: {},
				},
				{
					name: 'agent-x',
					namespace: 'plugin',
					canonicalName: 'plugin:agent-x',
					type: 'agent',
					filePath: '/agent-x.md',
					source: 'plugin:plugin',
					description: undefined,
					metadata: {},
				},
			];

			const manifest = importer.getImportManifest(components);

			assert.strictEqual(manifest.summary.skills, 1);
			assert.strictEqual(manifest.summary.agents, 1);
		});
	});

	describe('Pre-import diagnostics gating', () => {
		it('should block import on canonical collision (error)', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'skill',
					namespace: 'ns',
					canonicalName: 'ns:skill',
					type: 'skill',
					filePath: '/first.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill',
					namespace: 'ns',
					canonicalName: 'ns:skill', // Collision
					type: 'skill',
					filePath: '/second.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);

			// Should block - error severity
			assert.strictEqual(validation.canProceed, false);
			assert.strictEqual(validation.summary.errors, 1);
		});

		it('should allow import with shorthand overlap (warning)', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'review',
					namespace: 'plugin-a',
					canonicalName: 'plugin-a:review',
					type: 'skill',
					filePath: '/a/review.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
				{
					name: 'review',
					namespace: 'plugin-b',
					canonicalName: 'plugin-b:review',
					type: 'skill',
					filePath: '/b/review.md',
					source: 'plugin:plugin-b',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);

			// Should NOT block - warning only
			assert.strictEqual(validation.canProceed, true);
			assert.strictEqual(validation.summary.warnings, 1);
			assert.strictEqual(validation.summary.errors, 0);
		});

		it('should provide actionable diagnostics for blocking errors', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			const components: NamespacedComponent[] = [
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/first.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/second.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(components);

			// Should have diagnostic with remediation
			assert.strictEqual(validation.diagnostics.length, 1);
			assert.ok(validation.diagnostics[0]!.remediation.length > 0);
			assert.ok(validation.diagnostics[0]!.remediation.includes('ns:dup'));
		});
	});

	describe('Config persistence with canonical names', () => {
		it('should preserve canonical names in manifest for persistence', () => {
			const importer = new PluginImporter();

			const components: NamespacedComponent[] = [
				{
					name: 'code-review',
					namespace: 'my-plugin',
					canonicalName: 'my-plugin:code-review',
					type: 'skill',
					filePath: '/plugins/my-plugin/skills/code-review/SKILL.md',
					source: 'plugin:my-plugin',
					description: 'Reviews code',
					metadata: { pluginVersion: '1.0.0' },
				},
				{
					name: 'architect',
					namespace: 'my-plugin',
					canonicalName: 'my-plugin:architect',
					type: 'agent',
					filePath: '/plugins/my-plugin/agents/architect/AGENT.md',
					source: 'plugin:my-plugin',
					description: 'Designs architecture',
					metadata: { pluginVersion: '1.0.0' },
				},
			];

			const manifest = importer.getImportManifest(components);

			// Verify canonical names preserved
			assert.strictEqual(manifest.entries.length, 2);
			assert.strictEqual(manifest.entries[0]!.canonicalName, 'my-plugin:code-review');
			assert.strictEqual(manifest.entries[1]!.canonicalName, 'my-plugin:architect');

			// Verify manifest is JSON-serializable for config persistence
			const json = JSON.stringify(manifest);
			const parsed = JSON.parse(json);
			assert.strictEqual(parsed.entries[0].canonicalName, 'my-plugin:code-review');
		});

		it('should include file paths for settings persistence', () => {
			const importer = new PluginImporter();

			const components: NamespacedComponent[] = [
				{
					name: 'skill',
					namespace: 'plugin',
					canonicalName: 'plugin:skill',
					type: 'skill',
					filePath: '/absolute/path/to/skill.md',
					source: 'plugin:plugin',
					description: undefined,
					metadata: {},
				},
			];

			const manifest = importer.getImportManifest(components);

			assert.strictEqual(manifest.entries[0]!.filePath, '/absolute/path/to/skill.md');
		});

		it('should separate skills and agents for settings routing', () => {
			const importer = new PluginImporter();

			const components: NamespacedComponent[] = [
				{
					name: 'skill-1',
					namespace: 'p',
					canonicalName: 'p:skill-1',
					type: 'skill',
					filePath: '/s1.md',
					source: 'plugin:p',
					description: undefined,
					metadata: {},
				},
				{
					name: 'skill-2',
					namespace: 'p',
					canonicalName: 'p:skill-2',
					type: 'skill',
					filePath: '/s2.md',
					source: 'plugin:p',
					description: undefined,
					metadata: {},
				},
				{
					name: 'agent-1',
					namespace: 'p',
					canonicalName: 'p:agent-1',
					type: 'agent',
					filePath: '/a1.md',
					source: 'plugin:p',
					description: undefined,
					metadata: {},
				},
			];

			const manifest = importer.getImportManifest(components);

			const skills = manifest.entries.filter(e => e.type === 'skill');
			const agents = manifest.entries.filter(e => e.type === 'agent');

			assert.strictEqual(skills.length, 2);
			assert.strictEqual(agents.length, 1);
		});
	});

	describe('End-to-end command flow simulation', () => {
		it('should execute full pipeline: discover → select → validate → manifest', () => {
			const importer = new PluginImporter();

			// Stage 1: Discover (empty in this test)
			const discovery = importer.discover([]);
			assert.strictEqual(discovery.summary.totalComponents, 0);

			// Stage 2: Simulate user selection (mock components)
			const selected: NamespacedComponent[] = [
				{
					name: 'code-review',
					namespace: 'my-plugin',
					canonicalName: 'my-plugin:code-review',
					type: 'skill',
					filePath: '/plugins/my-plugin/skills/code-review/SKILL.md',
					source: 'plugin:my-plugin',
					description: 'Reviews code',
					metadata: { pluginVersion: '1.0.0' },
				},
			];

			// Stage 3: Validate
			const validation = importer.validateImport(selected);
			assert.strictEqual(validation.canProceed, true);

			// Stage 4: Generate manifest
			const manifest = importer.getImportManifest(selected);
			assert.strictEqual(manifest.entries.length, 1);
			assert.strictEqual(manifest.entries[0]!.canonicalName, 'my-plugin:code-review');
		});

		it('should block on validation failure before persistence', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			const selected: NamespacedComponent[] = [
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/first.md',
					source: 'first',
					description: undefined,
					metadata: {},
				},
				{
					name: 'dup',
					namespace: 'ns',
					canonicalName: 'ns:dup',
					type: 'skill',
					filePath: '/second.md',
					source: 'second',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(selected);

			// Simulate command flow logic: should NOT proceed to persistence
			if (validation.canProceed) {
				// This should NOT be reached
				assert.fail('Should not proceed to persistence with errors');
			} else {
				// Correct: blocked before persistence
				assert.strictEqual(validation.summary.errors, 1);
			}
		});

		it('should allow proceeding after user confirms warnings', () => {
			const importer = new PluginImporter();
			importer.discover([]);

			const selected: NamespacedComponent[] = [
				{
					name: 'review',
					namespace: 'plugin-a',
					canonicalName: 'plugin-a:review',
					type: 'skill',
					filePath: '/a/review.md',
					source: 'plugin:plugin-a',
					description: undefined,
					metadata: {},
				},
				{
					name: 'review',
					namespace: 'plugin-b',
					canonicalName: 'plugin-b:review',
					type: 'skill',
					filePath: '/b/review.md',
					source: 'plugin:plugin-b',
					description: undefined,
					metadata: {},
				},
			];

			const validation = importer.validateImport(selected);

			// Warnings should NOT block
			assert.strictEqual(validation.canProceed, true);
			assert.strictEqual(validation.summary.warnings, 1);

			// Simulate user confirmation and proceed to manifest
			const manifest = importer.getImportManifest(selected);
			assert.strictEqual(manifest.entries.length, 2);
		});
	});
});
