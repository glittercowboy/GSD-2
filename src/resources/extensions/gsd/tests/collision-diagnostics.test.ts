/**
 * Collision Diagnostics Contract Tests
 *
 * Tests that prove:
 * - R010: Collision reporting distinguishes canonical-conflict from shorthand-overlap
 * - R011: Doctor provides actionable advice with canonical name suggestions
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { NamespacedRegistry } from '../namespaced-registry.js';
import { NamespacedResolver } from '../namespaced-resolver.js';
import {
	analyzeCollisions,
	doctorReport,
	type ClassifiedDiagnostic,
	type DoctorReport,
} from '../collision-diagnostics.js';

describe('collision-diagnostics', () => {
	let registry: NamespacedRegistry;
	let resolver: NamespacedResolver;

	beforeEach(() => {
		registry = new NamespacedRegistry();
		resolver = new NamespacedResolver(registry);
	});

	describe('analyzeCollisions', () => {
		describe('canonical-conflict detection', () => {
			it('should detect canonical conflict when same canonical name registered twice', () => {
				// First registration wins
				registry.register({
					name: 'code-review',
					namespace: 'my-plugin',
					type: 'skill',
					filePath: '/plugins/my-plugin/skills/code-review/SKILL.md',
					source: 'plugin:my-plugin',
					description: 'Reviews code',
					metadata: {},
				});

				// Second registration with same canonical name loses
				registry.register({
					name: 'code-review',
					namespace: 'my-plugin',
					type: 'skill',
					filePath: '/plugins/other/skills/code-review/SKILL.md',
					source: 'plugin:other',
					description: 'Another code review',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				assert.strictEqual(diagnostics.length, 1);
				assert.strictEqual(diagnostics[0].class, 'canonical-conflict');
				assert.strictEqual(diagnostics[0].severity, 'error');
				assert.strictEqual(diagnostics[0].involvedCanonicalNames[0], 'my-plugin:code-review');
				assert.ok(diagnostics[0].filePaths.includes('/plugins/my-plugin/skills/code-review/SKILL.md'));
				assert.ok(diagnostics[0].filePaths.includes('/plugins/other/skills/code-review/SKILL.md'));
			});

			it('should include remediation advice for canonical conflict', () => {
				registry.register({
					name: 'test-skill',
					namespace: 'plugin-a',
					type: 'skill',
					filePath: '/a/test-skill/SKILL.md',
					source: 'plugin:plugin-a',
					description: 'Test',
					metadata: {},
				});
				registry.register({
					name: 'test-skill',
					namespace: 'plugin-a',
					type: 'skill',
					filePath: '/b/test-skill/SKILL.md',
					source: 'plugin:plugin-b',
					description: 'Test duplicate',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				assert.ok(diagnostics[0].remediation.includes('Rename one of the conflicting components'));
			});
		});

		describe('shorthand-overlap detection', () => {
			it('should detect shorthand overlap when bare name matches multiple namespaces', () => {
				// Same bare name in different namespaces
				registry.register({
					name: 'common-skill',
					namespace: 'plugin-a',
					type: 'skill',
					filePath: '/a/common-skill/SKILL.md',
					source: 'plugin:plugin-a',
					description: 'A common skill',
					metadata: {},
				});
				registry.register({
					name: 'common-skill',
					namespace: 'plugin-b',
					type: 'skill',
					filePath: '/b/common-skill/SKILL.md',
					source: 'plugin:plugin-b',
					description: 'B common skill',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				assert.strictEqual(diagnostics.length, 1);
				assert.strictEqual(diagnostics[0].class, 'shorthand-overlap');
				assert.strictEqual(diagnostics[0].severity, 'warning');
				assert.strictEqual(diagnostics[0].ambiguousBareName, 'common-skill');
				assert.ok(diagnostics[0].involvedCanonicalNames.includes('plugin-a:common-skill'));
				assert.ok(diagnostics[0].involvedCanonicalNames.includes('plugin-b:common-skill'));
			});

			it('should NOT warn when only one component has a given bare name', () => {
				registry.register({
					name: 'unique-skill',
					namespace: 'plugin-a',
					type: 'skill',
					filePath: '/a/unique-skill/SKILL.md',
					source: 'plugin:plugin-a',
					description: 'Unique',
					metadata: {},
				});
				registry.register({
					name: 'other-skill',
					namespace: 'plugin-b',
					type: 'skill',
					filePath: '/b/other-skill/SKILL.md',
					source: 'plugin:plugin-b',
					description: 'Other',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				assert.strictEqual(diagnostics.length, 0);
			});

			it('should include canonical name suggestions in remediation for shorthand overlap', () => {
				registry.register({
					name: 'ambiguous',
					namespace: 'alpha',
					type: 'skill',
					filePath: '/alpha/ambiguous/SKILL.md',
					source: 'plugin:alpha',
					description: 'Alpha ambiguous',
					metadata: {},
				});
				registry.register({
					name: 'ambiguous',
					namespace: 'beta',
					type: 'skill',
					filePath: '/beta/ambiguous/SKILL.md',
					source: 'plugin:beta',
					description: 'Beta ambiguous',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				assert.ok(diagnostics[0].remediation.includes('`alpha:ambiguous`'));
				assert.ok(diagnostics[0].remediation.includes('`beta:ambiguous`'));
				assert.ok(diagnostics[0].remediation.includes('Use a canonical name'));
			});
		});

		describe('clean registry', () => {
			it('should return no diagnostics for empty registry', () => {
				const diagnostics = analyzeCollisions(registry, resolver);
				assert.strictEqual(diagnostics.length, 0);
			});

			it('should return no diagnostics for registry with unique bare names', () => {
				registry.register({
					name: 'skill-a',
					namespace: 'plugin-x',
					type: 'skill',
					filePath: '/x/skill-a/SKILL.md',
					source: 'plugin:plugin-x',
					description: 'Skill A',
					metadata: {},
				});
				registry.register({
					name: 'skill-b',
					namespace: 'plugin-y',
					type: 'skill',
					filePath: '/y/skill-b/SKILL.md',
					source: 'plugin:plugin-y',
					description: 'Skill B',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);
				assert.strictEqual(diagnostics.length, 0);
			});
		});

		describe('mixed scenarios', () => {
			it('should report both canonical conflict and shorthand overlap in mixed scenario', () => {
				// Canonical conflict: same canonical name twice
				registry.register({
					name: 'duplicate',
					namespace: 'shared',
					type: 'skill',
					filePath: '/first/duplicate/SKILL.md',
					source: 'plugin:first',
					description: 'First duplicate',
					metadata: {},
				});
				registry.register({
					name: 'duplicate',
					namespace: 'shared',
					type: 'skill',
					filePath: '/second/duplicate/SKILL.md',
					source: 'plugin:second',
					description: 'Second duplicate',
					metadata: {},
				});

				// Shorthand overlap: same bare name in different namespaces
				registry.register({
					name: 'overlap',
					namespace: 'ns-a',
					type: 'skill',
					filePath: '/a/overlap/SKILL.md',
					source: 'plugin:ns-a',
					description: 'A overlap',
					metadata: {},
				});
				registry.register({
					name: 'overlap',
					namespace: 'ns-b',
					type: 'skill',
					filePath: '/b/overlap/SKILL.md',
					source: 'plugin:ns-b',
					description: 'B overlap',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				assert.strictEqual(diagnostics.length, 2);

				const canonicalConflict = diagnostics.find(d => d.class === 'canonical-conflict');
				const shorthandOverlap = diagnostics.find(d => d.class === 'shorthand-overlap');

				assert.ok(canonicalConflict, 'Should have canonical conflict');
				assert.ok(shorthandOverlap, 'Should have shorthand overlap');

				assert.strictEqual(canonicalConflict!.severity, 'error');
				assert.strictEqual(shorthandOverlap!.severity, 'warning');
			});
		});

		describe('alias-conflict detection', () => {
			it('should detect alias that shadows an existing canonical name', () => {
				// Register component that will be aliased to
				registry.register({
					name: 'utility',
					namespace: 'core',
					type: 'skill',
					filePath: '/core/utility/SKILL.md',
					source: 'plugin:core',
					description: 'Utility skill',
					metadata: {},
				});

				// Register alias for a non-existent canonical name (will succeed)
				registry.registerAlias('tools:helper', 'core:utility');

				// Now register the component that creates the conflict
				registry.register({
					name: 'helper',
					namespace: 'tools',
					type: 'skill',
					filePath: '/tools/helper/SKILL.md',
					source: 'plugin:tools',
					description: 'Helper skill',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				const aliasConflict = diagnostics.find(d => d.class === 'alias-conflict');
				assert.ok(aliasConflict, 'Should detect alias-conflict');
				assert.strictEqual(aliasConflict!.alias, 'tools:helper');
				assert.strictEqual(aliasConflict!.aliasTarget, 'core:utility');
				assert.strictEqual(aliasConflict!.aliasConflictType, 'shadows-canonical');
				assert.strictEqual(aliasConflict!.severity, 'warning');
			});

			it('should detect alias that shadows a bare component name', () => {
				// Register component with bare name "helper"
				registry.register({
					name: 'helper',
					namespace: 'tools',
					type: 'skill',
					filePath: '/tools/helper/SKILL.md',
					source: 'plugin:tools',
					description: 'Helper skill',
					metadata: {},
				});

				// Register another component to alias to
				registry.register({
					name: 'utility',
					namespace: 'core',
					type: 'skill',
					filePath: '/core/utility/SKILL.md',
					source: 'plugin:core',
					description: 'Utility skill',
					metadata: {},
				});

				// Create alias "helper" that shadows the bare name
				registry.registerAlias('helper', 'core:utility');

				const diagnostics = analyzeCollisions(registry, resolver);

				const aliasConflict = diagnostics.find(d => d.class === 'alias-conflict');
				assert.ok(aliasConflict, 'Should detect alias-conflict');
				assert.strictEqual(aliasConflict!.alias, 'helper');
				assert.strictEqual(aliasConflict!.aliasTarget, 'core:utility');
				assert.strictEqual(aliasConflict!.aliasConflictType, 'shadows-bare-name');
				assert.strictEqual(aliasConflict!.severity, 'warning');
			});

			it('should NOT warn when alias does not conflict', () => {
				registry.register({
					name: 'unique-skill',
					namespace: 'plugin-a',
					type: 'skill',
					filePath: '/a/unique-skill/SKILL.md',
					source: 'plugin:plugin-a',
					description: 'Unique skill',
					metadata: {},
				});

				registry.register({
					name: 'other-skill',
					namespace: 'plugin-b',
					type: 'skill',
					filePath: '/b/other-skill/SKILL.md',
					source: 'plugin:plugin-b',
					description: 'Other skill',
					metadata: {},
				});

				// Create a non-conflicting alias
				registry.registerAlias('short', 'plugin-a:unique-skill');

				const diagnostics = analyzeCollisions(registry, resolver);

				const aliasConflict = diagnostics.find(d => d.class === 'alias-conflict');
				assert.strictEqual(aliasConflict, undefined, 'Should not have alias-conflict for clean alias');
			});

			it('should include remediation advice for alias shadowing canonical', () => {
				// Register the target component first
				registry.register({
					name: 'target',
					namespace: 'my-plugin',
					type: 'skill',
					filePath: '/my-plugin/target/SKILL.md',
					source: 'plugin:my-plugin',
					description: 'Target skill',
					metadata: {},
				});

				// Register alias for a non-existent canonical name (will succeed because it doesn't exist yet)
				registry.registerAlias('other:conflicting', 'my-plugin:target');

				// Now register the component that the alias would shadow
				registry.register({
					name: 'conflicting',
					namespace: 'other',
					type: 'skill',
					filePath: '/other/conflicting/SKILL.md',
					source: 'plugin:other',
					description: 'Conflicting skill',
					metadata: {},
				});

				const diagnostics = analyzeCollisions(registry, resolver);

				const aliasConflict = diagnostics.find(d => d.class === 'alias-conflict');
				assert.ok(aliasConflict, 'Should have alias conflict');
				assert.ok(aliasConflict!.remediation.includes('shadows an existing canonical name'));
				assert.ok(aliasConflict!.remediation.includes('rename or remove the alias'));
			});

			it('should distinguish alias conflicts from shorthand overlap', () => {
				// Shorthand overlap scenario
				registry.register({
					name: 'common',
					namespace: 'plugin-a',
					type: 'skill',
					filePath: '/a/common/SKILL.md',
					source: 'plugin:plugin-a',
					description: 'Common A',
					metadata: {},
				});
				registry.register({
					name: 'common',
					namespace: 'plugin-b',
					type: 'skill',
					filePath: '/b/common/SKILL.md',
					source: 'plugin:plugin-b',
					description: 'Common B',
					metadata: {},
				});

				// Alias conflict scenario (separate from shorthand)
				registry.register({
					name: 'unique',
					namespace: 'plugin-c',
					type: 'skill',
					filePath: '/c/unique/SKILL.md',
					source: 'plugin:plugin-c',
					description: 'Unique C',
					metadata: {},
				});
				registry.registerAlias('unique', 'plugin-c:unique');

				const diagnostics = analyzeCollisions(registry, resolver);

				const shorthandOverlap = diagnostics.find(d => d.class === 'shorthand-overlap');
				const aliasConflict = diagnostics.find(d => d.class === 'alias-conflict');

				assert.ok(shorthandOverlap, 'Should have shorthand overlap');
				assert.ok(aliasConflict, 'Should have alias conflict');
				assert.strictEqual(shorthandOverlap!.ambiguousBareName, 'common');
				assert.strictEqual(aliasConflict!.alias, 'unique');
			});
		});
	});

	describe('doctorReport', () => {
		it('should format report with correct summary counts', () => {
			// Create scenario with 1 error and 2 warnings
			registry.register({
				name: 'conflict',
				namespace: 'ns',
				type: 'skill',
				filePath: '/a/conflict/SKILL.md',
				source: 'plugin:a',
				description: 'A',
				metadata: {},
			});
			registry.register({
				name: 'conflict',
				namespace: 'ns',
				type: 'skill',
				filePath: '/b/conflict/SKILL.md',
				source: 'plugin:b',
				description: 'B',
				metadata: {},
			});
			registry.register({
				name: 'overlap',
				namespace: 'x',
				type: 'skill',
				filePath: '/x/overlap/SKILL.md',
				source: 'plugin:x',
				description: 'X',
				metadata: {},
			});
			registry.register({
				name: 'overlap',
				namespace: 'y',
				type: 'skill',
				filePath: '/y/overlap/SKILL.md',
				source: 'plugin:y',
				description: 'Y',
				metadata: {},
			});

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.strictEqual(report.summary.total, 2);
			assert.strictEqual(report.summary.canonicalConflicts, 1);
			assert.strictEqual(report.summary.shorthandOverlaps, 1);
			assert.strictEqual(report.entries.length, 2);
		});

		it('should include error icon for canonical conflicts', () => {
			registry.register({
				name: 'dup',
				namespace: 'ns',
				type: 'skill',
				filePath: '/a/dup/SKILL.md',
				source: 'plugin:a',
				description: 'A',
				metadata: {},
			});
			registry.register({
				name: 'dup',
				namespace: 'ns',
				type: 'skill',
				filePath: '/b/dup/SKILL.md',
				source: 'plugin:b',
				description: 'B',
				metadata: {},
			});

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.ok(report.entries[0].includes('❌'));
		});

		it('should include warning icon for shorthand overlaps', () => {
			registry.register({
				name: 'overlap',
				namespace: 'a',
				type: 'skill',
				filePath: '/a/overlap/SKILL.md',
				source: 'plugin:a',
				description: 'A',
				metadata: {},
			});
			registry.register({
				name: 'overlap',
				namespace: 'b',
				type: 'skill',
				filePath: '/b/overlap/SKILL.md',
				source: 'plugin:b',
				description: 'B',
				metadata: {},
			});

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.ok(report.entries[0].includes('⚠️'));
		});

		it('should include file paths in formatted output', () => {
			registry.register({
				name: 'overlap',
				namespace: 'a',
				type: 'skill',
				filePath: '/path/a/overlap/SKILL.md',
				source: 'plugin:a',
				description: 'A',
				metadata: {},
			});
			registry.register({
				name: 'overlap',
				namespace: 'b',
				type: 'skill',
				filePath: '/path/b/overlap/SKILL.md',
				source: 'plugin:b',
				description: 'B',
				metadata: {},
			});

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.ok(report.entries[0].includes('/path/a/overlap/SKILL.md'));
			assert.ok(report.entries[0].includes('/path/b/overlap/SKILL.md'));
		});

		it('should include canonical name suggestions for ambiguous shorthand', () => {
			registry.register({
				name: 'common',
				namespace: 'plugin-1',
				type: 'skill',
				filePath: '/1/common/SKILL.md',
				source: 'plugin:plugin-1',
				description: 'Common 1',
				metadata: {},
			});
			registry.register({
				name: 'common',
				namespace: 'plugin-2',
				type: 'skill',
				filePath: '/2/common/SKILL.md',
				source: 'plugin:plugin-2',
				description: 'Common 2',
				metadata: {},
			});

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.ok(report.entries[0].includes('`plugin-1:common`'));
			assert.ok(report.entries[0].includes('`plugin-2:common`'));
		});

		it('should return empty arrays for clean registry', () => {
			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.strictEqual(report.summary.total, 0);
			assert.strictEqual(report.summary.canonicalConflicts, 0);
			assert.strictEqual(report.summary.shorthandOverlaps, 0);
			assert.strictEqual(report.summary.aliasConflicts, 0);
			assert.deepStrictEqual(report.entries, []);
		});

		it('should include alias conflicts in summary counts', () => {
			registry.register({
				name: 'target',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/my-plugin/target/SKILL.md',
				source: 'plugin:my-plugin',
				description: 'Target skill',
				metadata: {},
			});

			registry.register({
				name: 'helper',
				namespace: 'other',
				type: 'skill',
				filePath: '/other/helper/SKILL.md',
				source: 'plugin:other',
				description: 'Helper skill',
				metadata: {},
			});

			// Create alias that shadows bare name
			registry.registerAlias('helper', 'my-plugin:target');

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.strictEqual(report.summary.aliasConflicts, 1);
			assert.strictEqual(report.summary.total, 1);
		});

		it('should include warning icon for alias conflicts', () => {
			registry.register({
				name: 'target',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/my-plugin/target/SKILL.md',
				source: 'plugin:my-plugin',
				description: 'Target skill',
				metadata: {},
			});

			registry.register({
				name: 'shadowed',
				namespace: 'other',
				type: 'skill',
				filePath: '/other/shadowed/SKILL.md',
				source: 'plugin:other',
				description: 'Shadowed skill',
				metadata: {},
			});

			// Create alias that shadows bare name
			registry.registerAlias('shadowed', 'my-plugin:target');

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.ok(report.entries[0].includes('⚠️'));
			assert.ok(report.entries[0].includes('ALIAS-CONFLICT'));
		});

		it('should include alias details in formatted output', () => {
			registry.register({
				name: 'target',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/my-plugin/target/SKILL.md',
				source: 'plugin:my-plugin',
				description: 'Target skill',
				metadata: {},
			});

			registry.register({
				name: 'shadowed',
				namespace: 'other',
				type: 'skill',
				filePath: '/other/shadowed/SKILL.md',
				source: 'plugin:other',
				description: 'Shadowed skill',
				metadata: {},
			});

			// Create alias that shadows bare name
			registry.registerAlias('shadowed', 'my-plugin:target');

			const diagnostics = analyzeCollisions(registry, resolver);
			const report = doctorReport(diagnostics);

			assert.ok(report.entries[0].includes('shadowed'));
			assert.ok(report.entries[0].includes('my-plugin:target'));
		});
	});
});
