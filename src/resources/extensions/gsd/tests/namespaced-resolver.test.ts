/**
 * Namespaced Resolver Contract Tests
 *
 * Tests that prove the resolver correctly handles:
 * - R007: Canonical skill lookup
 * - R008: Canonical agent lookup
 * - D003: Same-plugin local-first resolution
 * - R009: Shorthand resolution (unambiguous and ambiguous)
 * - Flat component compatibility
 * - Type filtering (skill vs agent)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { NamespacedRegistry } from '../namespaced-registry.js';
import { NamespacedResolver } from '../namespaced-resolver.js';

describe('NamespacedResolver', () => {
	let registry: NamespacedRegistry;
	let resolver: NamespacedResolver;

	beforeEach(() => {
		registry = new NamespacedRegistry();
		resolver = new NamespacedResolver(registry);
	});

	describe('canonical lookup (R007, R008)', () => {
		it('should resolve canonical skill name with canonical result (R007)', () => {
			registry.register({
				name: 'call-horse',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/call-horse/SKILL.md',
				source: 'plugin:farm',
				description: 'Calls a horse',
				metadata: {},
			});

			const result = resolver.resolve('farm:call-horse');

			assert.strictEqual(result.resolution, 'canonical');
			if (result.resolution !== 'canonical') throw new Error('Type guard');

			assert.strictEqual(result.requestedName, 'farm:call-horse');
			assert.strictEqual(result.component.canonicalName, 'farm:call-horse');
			assert.strictEqual(result.component.type, 'skill');
		});

		it('should resolve canonical agent name with canonical result (R008)', () => {
			registry.register({
				name: 'rancher',
				namespace: 'farm',
				type: 'agent',
				filePath: '/farm/rancher/AGENT.md',
				source: 'plugin:farm',
				description: 'Farm agent',
				metadata: {},
			});

			const result = resolver.resolve('farm:rancher');

			assert.strictEqual(result.resolution, 'canonical');
			if (result.resolution !== 'canonical') throw new Error('Type guard');

			assert.strictEqual(result.component.canonicalName, 'farm:rancher');
			assert.strictEqual(result.component.type, 'agent');
		});

		it('should return not-found for non-existent canonical name', () => {
			const result = resolver.resolve('nonexistent:skill');
			assert.strictEqual(result.resolution, 'not-found');
		});

		it('should return not-found for canonical name with wrong type filter', () => {
			registry.register({
				name: 'call-horse',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/call-horse/SKILL.md',
				source: 'plugin:farm',
				description: 'Calls a horse',
				metadata: {},
			});

			const result = resolver.resolve('farm:call-horse', undefined, 'agent');
			assert.strictEqual(result.resolution, 'not-found');
		});
	});

	describe('local-first resolution (D003)', () => {
		it('should resolve bare name local-first when caller namespace has match', () => {
			registry.register({
				name: 'call-horse',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/call-horse/SKILL.md',
				source: 'plugin:farm',
				description: 'Farm horse caller',
				metadata: {},
			});
			registry.register({
				name: 'call-horse',
				namespace: 'zoo',
				type: 'skill',
				filePath: '/zoo/call-horse/SKILL.md',
				source: 'plugin:zoo',
				description: 'Zoo horse caller',
				metadata: {},
			});

			const result = resolver.resolve('call-horse', { callerNamespace: 'farm' });

			assert.strictEqual(result.resolution, 'local-first');
			if (result.resolution !== 'local-first') throw new Error('Type guard');

			assert.strictEqual(result.requestedName, 'call-horse');
			assert.strictEqual(result.component.canonicalName, 'farm:call-horse');
			assert.strictEqual(result.matchedNamespace, 'farm');
		});

		it('should resolve local-first from zoo namespace context', () => {
			registry.register({
				name: 'call-horse',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/call-horse/SKILL.md',
				source: 'plugin:farm',
				description: 'Farm horse caller',
				metadata: {},
			});
			registry.register({
				name: 'call-horse',
				namespace: 'zoo',
				type: 'skill',
				filePath: '/zoo/call-horse/SKILL.md',
				source: 'plugin:zoo',
				description: 'Zoo horse caller',
				metadata: {},
			});

			const result = resolver.resolve('call-horse', { callerNamespace: 'zoo' });

			assert.strictEqual(result.resolution, 'local-first');
			if (result.resolution !== 'local-first') throw new Error('Type guard');

			assert.strictEqual(result.component.canonicalName, 'zoo:call-horse');
		});

		it('should fall through to shorthand when local namespace has no match', () => {
			registry.register({
				name: 'feed-chickens',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/feed-chickens/SKILL.md',
				source: 'plugin:farm',
				description: 'Feed chickens',
				metadata: {},
			});

			const result = resolver.resolve('feed-chickens', { callerNamespace: 'zoo' });

			assert.strictEqual(result.resolution, 'shorthand');
			if (result.resolution !== 'shorthand') throw new Error('Type guard');

			assert.strictEqual(result.component.canonicalName, 'farm:feed-chickens');
		});

		it('should respect type filter in local-first resolution', () => {
			// Register two different names - one skill, one agent
			registry.register({
				name: 'helper-skill',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/helper-skill/SKILL.md',
				source: 'plugin:farm',
				description: 'Helper skill',
				metadata: {},
			});
			registry.register({
				name: 'helper-agent',
				namespace: 'farm',
				type: 'agent',
				filePath: '/farm/helper-agent/AGENT.md',
				source: 'plugin:farm',
				description: 'Helper agent',
				metadata: {},
			});

			// Request skill - should find helper-skill
			const skillResult = resolver.resolve('helper-skill', { callerNamespace: 'farm' }, 'skill');
			assert.strictEqual(skillResult.resolution, 'local-first');
			if (skillResult.resolution !== 'local-first') throw new Error('Type guard');
			assert.strictEqual(skillResult.component.type, 'skill');
			assert.strictEqual(skillResult.component.name, 'helper-skill');

			// Request agent - should find helper-agent
			const agentResult = resolver.resolve('helper-agent', { callerNamespace: 'farm' }, 'agent');
			assert.strictEqual(agentResult.resolution, 'local-first');
			if (agentResult.resolution !== 'local-first') throw new Error('Type guard');
			assert.strictEqual(agentResult.component.type, 'agent');
			assert.strictEqual(agentResult.component.name, 'helper-agent');
		});
	});

	describe('shorthand resolution (R009)', () => {
		it('should resolve unambiguous shorthand with single match', () => {
			registry.register({
				name: 'feed-chickens',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/feed-chickens/SKILL.md',
				source: 'plugin:farm',
				description: 'Feed chickens',
				metadata: {},
			});

			const result = resolver.resolve('feed-chickens');

			assert.strictEqual(result.resolution, 'shorthand');
			if (result.resolution !== 'shorthand') throw new Error('Type guard');

			assert.strictEqual(result.requestedName, 'feed-chickens');
			assert.strictEqual(result.component.canonicalName, 'farm:feed-chickens');
		});

		it('should return ambiguous with candidates for multiple matches', () => {
			registry.register({
				name: 'call-horse',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/call-horse/SKILL.md',
				source: 'plugin:farm',
				description: 'Farm horse caller',
				metadata: {},
			});
			registry.register({
				name: 'call-horse',
				namespace: 'zoo',
				type: 'skill',
				filePath: '/zoo/call-horse/SKILL.md',
				source: 'plugin:zoo',
				description: 'Zoo horse caller',
				metadata: {},
			});

			const result = resolver.resolve('call-horse');

			assert.strictEqual(result.resolution, 'ambiguous');
			if (result.resolution !== 'ambiguous') throw new Error('Type guard');

			assert.strictEqual(result.requestedName, 'call-horse');
			assert.strictEqual(result.candidates.length, 2);

			const canonicalNames = result.candidates.map((c) => c.canonicalName).sort();
			assert.deepStrictEqual(canonicalNames, ['farm:call-horse', 'zoo:call-horse']);
		});

		it('should return not-found for non-existent bare name', () => {
			const result = resolver.resolve('nonexistent');
			assert.strictEqual(result.resolution, 'not-found');
		});

		it('should return not-found when type filter eliminates all matches', () => {
			registry.register({
				name: 'helper',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/helper/SKILL.md',
				source: 'plugin:farm',
				description: 'Helper skill',
				metadata: {},
			});

			const result = resolver.resolve('helper', undefined, 'agent');
			assert.strictEqual(result.resolution, 'not-found');
		});
	});

	describe('flat component compatibility', () => {
		it('should resolve flat component by bare name (no namespace)', () => {
			registry.register({
				name: 'code-review',
				namespace: undefined,
				type: 'skill',
				filePath: '/skills/code-review/SKILL.md',
				source: 'user',
				description: 'Code review skill',
				metadata: {},
			});

			const result = resolver.resolve('code-review');

			assert.strictEqual(result.resolution, 'shorthand');
			if (result.resolution !== 'shorthand') throw new Error('Type guard');

			assert.strictEqual(result.component.canonicalName, 'code-review');
			assert.strictEqual(result.component.namespace, undefined);
		});

		it('should include flat component in ambiguous candidates', () => {
			registry.register({
				name: 'helper',
				namespace: undefined,
				type: 'skill',
				filePath: '/skills/helper/SKILL.md',
				source: 'user',
				description: 'User helper',
				metadata: {},
			});
			registry.register({
				name: 'helper',
				namespace: 'farm',
				type: 'skill',
				filePath: '/farm/helper/SKILL.md',
				source: 'plugin:farm',
				description: 'Farm helper',
				metadata: {},
			});

			const result = resolver.resolve('helper');

			assert.strictEqual(result.resolution, 'ambiguous');
			if (result.resolution !== 'ambiguous') throw new Error('Type guard');

			assert.strictEqual(result.candidates.length, 2);
			const canonicalNames = result.candidates.map((c) => c.canonicalName).sort();
			assert.deepStrictEqual(canonicalNames, ['farm:helper', 'helper']);
		});
	});

	describe('type filtering', () => {
		it('should filter by skill type across namespaces', () => {
			// Register skill in one namespace
			registry.register({
				name: 'review',
				namespace: 'tools',
				type: 'skill',
				filePath: '/tools/review/SKILL.md',
				source: 'plugin:tools',
				description: 'Review skill',
				metadata: {},
			});
			// Register agent in another namespace (different canonical name)
			registry.register({
				name: 'review',
				namespace: 'agents',
				type: 'agent',
				filePath: '/agents/review/AGENT.md',
				source: 'plugin:agents',
				description: 'Review agent',
				metadata: {},
			});

			// Both have same bare name, filtering by type disambiguates
			const skillResult = resolver.resolve('review', undefined, 'skill');
			assert.strictEqual(skillResult.resolution, 'shorthand');
			if (skillResult.resolution !== 'shorthand') throw new Error('Type guard');
			assert.strictEqual(skillResult.component.type, 'skill');
			assert.strictEqual(skillResult.component.namespace, 'tools');

			const agentResult = resolver.resolve('review', undefined, 'agent');
			assert.strictEqual(agentResult.resolution, 'shorthand');
			if (agentResult.resolution !== 'shorthand') throw new Error('Type guard');
			assert.strictEqual(agentResult.component.type, 'agent');
			assert.strictEqual(agentResult.component.namespace, 'agents');
		});

		it('should resolve unique skill among multiple agents with same name', () => {
			registry.register({
				name: 'assistant',
				namespace: 'tools',
				type: 'skill',
				filePath: '/tools/assistant/SKILL.md',
				source: 'plugin:tools',
				description: 'Assistant skill',
				metadata: {},
			});
			registry.register({
				name: 'assistant',
				namespace: 'other',
				type: 'agent',
				filePath: '/other/assistant/AGENT.md',
				source: 'plugin:other',
				description: 'Assistant agent',
				metadata: {},
			});

			const result = resolver.resolve('assistant', undefined, 'skill');
			assert.strictEqual(result.resolution, 'shorthand');
			if (result.resolution !== 'shorthand') throw new Error('Type guard');
			assert.strictEqual(result.component.canonicalName, 'tools:assistant');
		});
	});

	describe('resolution path diagnostics', () => {
		it('should include requestedName in all result types', () => {
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/skill/SKILL.md',
				source: 'test',
				description: undefined,
				metadata: {},
			});

			const canon = resolver.resolve('ns:skill');
			assert.strictEqual(canon.requestedName, 'ns:skill');

			const local = resolver.resolve('skill', { callerNamespace: 'ns' });
			assert.strictEqual(local.requestedName, 'skill');

			const short = resolver.resolve('skill');
			assert.strictEqual(short.requestedName, 'skill');

			const notFound = resolver.resolve('missing');
			assert.strictEqual(notFound.requestedName, 'missing');
		});

		it('should provide matchedNamespace in local-first results', () => {
			registry.register({
				name: 'skill',
				namespace: 'my-ns',
				type: 'skill',
				filePath: '/skill/SKILL.md',
				source: 'test',
				description: undefined,
				metadata: {},
			});

			const result = resolver.resolve('skill', { callerNamespace: 'my-ns' });
			assert.strictEqual(result.resolution, 'local-first');

			if (result.resolution === 'local-first') {
				assert.strictEqual(result.matchedNamespace, 'my-ns');
			}
		});

		it('should provide full candidate list in ambiguous results', () => {
			registry.register({
				name: 'dup',
				namespace: 'a',
				type: 'skill',
				filePath: '/a/dup/SKILL.md',
				source: 'a',
				description: 'A dup',
				metadata: {},
			});
			registry.register({
				name: 'dup',
				namespace: 'b',
				type: 'skill',
				filePath: '/b/dup/SKILL.md',
				source: 'b',
				description: 'B dup',
				metadata: {},
			});

			const result = resolver.resolve('dup');
			assert.strictEqual(result.resolution, 'ambiguous');

			if (result.resolution === 'ambiguous') {
				assert.strictEqual(result.candidates.length, 2);
				for (const candidate of result.candidates) {
					assert.ok(candidate.canonicalName);
					assert.ok(candidate.filePath);
					assert.strictEqual(candidate.name, 'dup');
				}
			}
		});
	});

	describe('edge cases', () => {
		it('should handle empty registry gracefully', () => {
			const result = resolver.resolve('anything');
			assert.strictEqual(result.resolution, 'not-found');
		});

		it('should handle empty caller namespace string', () => {
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/skill/SKILL.md',
				source: 'test',
				description: undefined,
				metadata: {},
			});

			// Empty string is falsy, should fall through to shorthand
			const result = resolver.resolve('skill', { callerNamespace: '' });
			assert.strictEqual(result.resolution, 'shorthand');
		});
	});

	describe('alias resolution', () => {
		it('should resolve alias with alias result type', () => {
			registry.register({
				name: '3d-visualizer',
				namespace: 'python-tools',
				type: 'skill',
				filePath: '/python-tools/3d-visualizer/SKILL.md',
				source: 'plugin:python-tools',
				description: '3D visualization',
				metadata: {},
			});
			registry.registerAlias('py3d', 'python-tools:3d-visualizer');

			const result = resolver.resolve('py3d');

			assert.strictEqual(result.resolution, 'alias');
			if (result.resolution !== 'alias') throw new Error('Type guard');

			assert.strictEqual(result.requestedName, 'py3d');
			assert.strictEqual(result.alias, 'py3d');
			assert.strictEqual(result.canonicalName, 'python-tools:3d-visualizer');
			assert.strictEqual(result.component.canonicalName, 'python-tools:3d-visualizer');
			assert.strictEqual(result.component.type, 'skill');
		});

		it('should respect type filter in alias resolution', () => {
			registry.register({
				name: 'visualizer',
				namespace: 'tools',
				type: 'skill',
				filePath: '/tools/visualizer/SKILL.md',
				source: 'plugin:tools',
				description: 'Visualizer skill',
				metadata: {},
			});
			registry.registerAlias('viz', 'tools:visualizer');

			// Type filter matches - should resolve
			const skillResult = resolver.resolve('viz', undefined, 'skill');
			assert.strictEqual(skillResult.resolution, 'alias');
			if (skillResult.resolution !== 'alias') throw new Error('Type guard');
			assert.strictEqual(skillResult.component.type, 'skill');

			// Type filter doesn't match - should not resolve alias
			const agentResult = resolver.resolve('viz', undefined, 'agent');
			assert.strictEqual(agentResult.resolution, 'not-found');
		});

		it('should prioritize alias over shorthand (alias checked first)', () => {
			// Register a component that could match as shorthand
			registry.register({
				name: 'shortcut',
				namespace: 'other-plugin',
				type: 'skill',
				filePath: '/other/shortcut/SKILL.md',
				source: 'plugin:other-plugin',
				description: 'Other shortcut',
				metadata: {},
			});

			// Register a different component with an alias using the same bare name
			registry.register({
				name: 'aliased-skill',
				namespace: 'main-plugin',
				type: 'skill',
				filePath: '/main/aliased-skill/SKILL.md',
				source: 'plugin:main-plugin',
				description: 'Main skill',
				metadata: {},
			});
			registry.registerAlias('shortcut', 'main-plugin:aliased-skill');

			// 'shortcut' should resolve via alias, not shorthand
			const result = resolver.resolve('shortcut');

			assert.strictEqual(result.resolution, 'alias');
			if (result.resolution !== 'alias') throw new Error('Type guard');

			// Should point to the aliased target, not the shorthand match
			assert.strictEqual(result.canonicalName, 'main-plugin:aliased-skill');
		});

		it('should prioritize alias over local-first (alias checked first)', () => {
			// Register components in two namespaces
			registry.register({
				name: 'helper',
				namespace: 'local-ns',
				type: 'skill',
				filePath: '/local-ns/helper/SKILL.md',
				source: 'plugin:local-ns',
				description: 'Local helper',
				metadata: {},
			});
			registry.register({
				name: 'aliased-helper',
				namespace: 'alias-ns',
				type: 'skill',
				filePath: '/alias-ns/aliased-helper/SKILL.md',
				source: 'plugin:alias-ns',
				description: 'Aliased helper',
				metadata: {},
			});

			// Create alias that shadows local namespace name
			registry.registerAlias('helper', 'alias-ns:aliased-helper');

			// Even with callerNamespace='local-ns', alias should win
			const result = resolver.resolve('helper', { callerNamespace: 'local-ns' });

			assert.strictEqual(result.resolution, 'alias');
			if (result.resolution !== 'alias') throw new Error('Type guard');
			assert.strictEqual(result.canonicalName, 'alias-ns:aliased-helper');
		});

		it('should include alias and canonicalName in result', () => {
			registry.register({
				name: 'code-review',
				namespace: 'tools',
				type: 'agent',
				filePath: '/tools/code-review/AGENT.md',
				source: 'plugin:tools',
				description: 'Code review agent',
				metadata: {},
			});
			registry.registerAlias('review', 'tools:code-review');

			const result = resolver.resolve('review');

			assert.strictEqual(result.resolution, 'alias');
			if (result.resolution !== 'alias') throw new Error('Type guard');

			// Both alias and canonicalName should be present
			assert.strictEqual(result.alias, 'review');
			assert.strictEqual(result.canonicalName, 'tools:code-review');
			assert.strictEqual(result.component.canonicalName, 'tools:code-review');
		});

		it('should fall through to local-first/shorthand when alias does not exist', () => {
			registry.register({
				name: 'existing',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/existing/SKILL.md',
				source: 'plugin:ns',
				description: 'Existing skill',
				metadata: {},
			});

			// No alias registered, should fall through to local-first
			const result = resolver.resolve('existing', { callerNamespace: 'ns' });

			assert.strictEqual(result.resolution, 'local-first');
			if (result.resolution !== 'local-first') throw new Error('Type guard');
			assert.strictEqual(result.component.canonicalName, 'ns:existing');
		});

		it('should fall through to shorthand when alias does not exist and no local match', () => {
			registry.register({
				name: 'unique',
				namespace: 'plugin-a',
				type: 'skill',
				filePath: '/plugin-a/unique/SKILL.md',
				source: 'plugin:plugin-a',
				description: 'Unique skill',
				metadata: {},
			});

			// No alias registered, no local match, should fall through to shorthand
			const result = resolver.resolve('unique', { callerNamespace: 'other-ns' });

			assert.strictEqual(result.resolution, 'shorthand');
			if (result.resolution !== 'shorthand') throw new Error('Type guard');
			assert.strictEqual(result.component.canonicalName, 'plugin-a:unique');
		});
	});
});
