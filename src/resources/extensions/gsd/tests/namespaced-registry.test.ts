/**
 * Namespaced Registry Contract Tests
 *
 * Tests that prove the namespaced registry correctly handles:
 * - Canonical identity (R004)
 * - Canonical skill lookup (R005)
 * - Canonical agent lookup (R006)
 * - Flat compatibility
 * - Collision detection
 * - Namespace listing
 * - Integration with S01 discovery types
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
	NamespacedRegistry,
	componentsFromDiscovery,
} from '../namespaced-registry.js';
import type { DiscoveredPlugin } from '../marketplace-discovery.js';

describe('NamespacedRegistry', () => {
	let registry: NamespacedRegistry;

	beforeEach(() => {
		registry = new NamespacedRegistry();
	});

	describe('canonical registration and lookup', () => {
		it('should register a namespaced skill and compute canonical name (R004, R005)', () => {
			const diagnostic = registry.register({
				name: 'my-skill',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/plugins/my-plugin/skills/my-skill/SKILL.md',
				source: 'plugin:my-plugin',
				description: 'A test skill',
				metadata: { pluginVersion: '1.0.0' },
			});

			// No collision diagnostic expected
			assert.strictEqual(diagnostic, undefined);

			// Verify registration succeeded
			assert.strictEqual(registry.size, 1);
			assert.strictEqual(registry.has('my-plugin:my-skill'), true);

			// Lookup by canonical name
			const component = registry.getByCanonical('my-plugin:my-skill');
			assert.ok(component !== undefined);

			// Verify canonical identity preserved (R004)
			assert.strictEqual(component.name, 'my-skill');
			assert.strictEqual(component.namespace, 'my-plugin');
			assert.strictEqual(component.canonicalName, 'my-plugin:my-skill');
			assert.strictEqual(component.type, 'skill');
			assert.strictEqual(component.filePath, '/plugins/my-plugin/skills/my-skill/SKILL.md');
			assert.strictEqual(component.source, 'plugin:my-plugin');
			assert.strictEqual(component.description, 'A test skill');
			assert.strictEqual(component.metadata.pluginVersion, '1.0.0');
		});

		it('should register a namespaced agent and compute canonical name (R006)', () => {
			const diagnostic = registry.register({
				name: 'abby',
				namespace: 'farm',
				type: 'agent',
				filePath: '/plugins/farm/agents/abby/AGENT.md',
				source: 'plugin:farm',
				description: 'A farm agent',
				metadata: { pluginAuthor: 'farm-team' },
			});

			assert.strictEqual(diagnostic, undefined);
			assert.strictEqual(registry.size, 1);

			// Lookup by canonical name (R006)
			const agent = registry.getByCanonical('farm:abby');
			assert.ok(agent !== undefined);

			// Verify canonical identity (R004)
			assert.strictEqual(agent.name, 'abby');
			assert.strictEqual(agent.namespace, 'farm');
			assert.strictEqual(agent.canonicalName, 'farm:abby');
			assert.strictEqual(agent.type, 'agent');
		});

		it('should return undefined for non-existent canonical name', () => {
			const result = registry.getByCanonical('nonexistent:skill');
			assert.strictEqual(result, undefined);
		});
	});

	describe('flat (non-namespaced) compatibility', () => {
		it('should register flat component with bare name as canonical', () => {
			const diagnostic = registry.register({
				name: 'code-review',
				namespace: undefined,
				type: 'skill',
				filePath: '/skills/code-review/SKILL.md',
				source: 'user',
				description: 'A flat skill',
				metadata: {},
			});

			assert.strictEqual(diagnostic, undefined);

			// Lookup by bare name (no namespace prefix)
			const skill = registry.getByCanonical('code-review');
			assert.ok(skill !== undefined);
			assert.strictEqual(skill.name, 'code-review');
			assert.strictEqual(skill.namespace, undefined);
			assert.strictEqual(skill.canonicalName, 'code-review');
		});

		it('should retrieve flat component by bare name', () => {
			registry.register({
				name: 'test-skill',
				namespace: undefined,
				type: 'skill',
				filePath: '/skills/test-skill/SKILL.md',
				source: 'project',
				description: undefined,
				metadata: {},
			});

			const skill = registry.getByCanonical('test-skill');
			assert.ok(skill !== undefined);
			assert.strictEqual(skill.canonicalName, 'test-skill');
		});
	});

	describe('collision detection', () => {
		it('should detect collision on duplicate canonical name and emit diagnostic', () => {
			// First registration wins
			const first = registry.register({
				name: 'code-review',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/plugins/my-plugin/skills/code-review/SKILL.md',
				source: 'plugin:my-plugin',
				description: 'First skill',
				metadata: {},
			});
			assert.strictEqual(first, undefined);

			// Second registration collides
			const second = registry.register({
				name: 'code-review',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/plugins/other-plugin/skills/code-review/SKILL.md',
				source: 'plugin:other-plugin',
				description: 'Second skill',
				metadata: {},
			});

			// Should return collision diagnostic
			assert.ok(second !== undefined);
			assert.strictEqual(second.type, 'collision');
			assert.strictEqual(second.message, 'canonical name "my-plugin:code-review" collision');

			// Verify collision details
			assert.strictEqual(second.collision.canonicalName, 'my-plugin:code-review');
			assert.strictEqual(second.collision.winnerPath, '/plugins/my-plugin/skills/code-review/SKILL.md');
			assert.strictEqual(second.collision.loserPath, '/plugins/other-plugin/skills/code-review/SKILL.md');
			assert.strictEqual(second.collision.winnerSource, 'plugin:my-plugin');
			assert.strictEqual(second.collision.loserSource, 'plugin:other-plugin');
		});

		it('should preserve first-wins behavior on collision', () => {
			// Register first
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/first/SKILL.md',
				source: 'first',
				description: 'First description',
				metadata: { key: 'first-value' },
			});

			// Attempt duplicate
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/second/SKILL.md',
				source: 'second',
				description: 'Second description',
				metadata: { key: 'second-value' },
			});

			// First registration wins
			const component = registry.getByCanonical('ns:skill');
			assert.ok(component !== undefined);
			assert.strictEqual(component.filePath, '/first/SKILL.md');
			assert.strictEqual(component.source, 'first');
			assert.strictEqual(component.description, 'First description');
			assert.strictEqual(component.metadata.key, 'first-value');
		});

		it('should collect multiple collision diagnostics', () => {
			// First registrations
			registry.register({
				name: 'skill-a',
				namespace: 'plugin-x',
				type: 'skill',
				filePath: '/x/a.md',
				source: 'x',
				description: undefined,
				metadata: {},
			});
			registry.register({
				name: 'skill-b',
				namespace: 'plugin-y',
				type: 'skill',
				filePath: '/y/b.md',
				source: 'y',
				description: undefined,
				metadata: {},
			});

			// Collisions
			registry.register({
				name: 'skill-a',
				namespace: 'plugin-x',
				type: 'skill',
				filePath: '/z/a.md',
				source: 'z',
				description: undefined,
				metadata: {},
			});
			registry.register({
				name: 'skill-b',
				namespace: 'plugin-y',
				type: 'skill',
				filePath: '/w/b.md',
				source: 'w',
				description: undefined,
				metadata: {},
			});

			const diagnostics = registry.getDiagnostics();
			assert.strictEqual(diagnostics.length, 2);
			assert.strictEqual(diagnostics[0].collision.canonicalName, 'plugin-x:skill-a');
			assert.strictEqual(diagnostics[1].collision.canonicalName, 'plugin-y:skill-b');
		});

		it('should allow same name in different namespaces', () => {
			// Same name, different namespace
			registry.register({
				name: 'code-review',
				namespace: 'plugin-a',
				type: 'skill',
				filePath: '/a/code-review.md',
				source: 'plugin:plugin-a',
				description: undefined,
				metadata: {},
			});
			registry.register({
				name: 'code-review',
				namespace: 'plugin-b',
				type: 'skill',
				filePath: '/b/code-review.md',
				source: 'plugin:plugin-b',
				description: undefined,
				metadata: {},
			});

			// Both should be registered
			assert.strictEqual(registry.size, 2);

			const a = registry.getByCanonical('plugin-a:code-review');
			const b = registry.getByCanonical('plugin-b:code-review');

			assert.ok(a !== undefined);
			assert.ok(b !== undefined);
			assert.strictEqual(a.filePath, '/a/code-review.md');
			assert.strictEqual(b.filePath, '/b/code-review.md');

			// No collisions
			assert.strictEqual(registry.getDiagnostics().length, 0);
		});

		it('should allow flat and namespaced components with same local name', () => {
			// Flat component
			registry.register({
				name: 'code-review',
				namespace: undefined,
				type: 'skill',
				filePath: '/flat/code-review.md',
				source: 'user',
				description: undefined,
				metadata: {},
			});

			// Namespaced component with same local name
			registry.register({
				name: 'code-review',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/code-review.md',
				source: 'plugin:plugin',
				description: undefined,
				metadata: {},
			});

			// Both should be accessible
			const flat = registry.getByCanonical('code-review');
			const namespaced = registry.getByCanonical('plugin:code-review');

			assert.ok(flat !== undefined);
			assert.ok(namespaced !== undefined);
			assert.strictEqual(flat.namespace, undefined);
			assert.strictEqual(namespaced.namespace, 'plugin');

			assert.strictEqual(registry.getDiagnostics().length, 0);
		});
	});

	describe('namespace listing', () => {
		it('should list all components in a namespace via getByNamespace', () => {
			// Register multiple components in plugin-a
			registry.register({
				name: 'skill-1',
				namespace: 'plugin-a',
				type: 'skill',
				filePath: '/a/skill-1.md',
				source: 'plugin:plugin-a',
				description: undefined,
				metadata: {},
			});
			registry.register({
				name: 'skill-2',
				namespace: 'plugin-a',
				type: 'skill',
				filePath: '/a/skill-2.md',
				source: 'plugin:plugin-a',
				description: undefined,
				metadata: {},
			});
			registry.register({
				name: 'agent-1',
				namespace: 'plugin-a',
				type: 'agent',
				filePath: '/a/agent-1.md',
				source: 'plugin:plugin-a',
				description: undefined,
				metadata: {},
			});

			// Register component in different namespace
			registry.register({
				name: 'skill-3',
				namespace: 'plugin-b',
				type: 'skill',
				filePath: '/b/skill-3.md',
				source: 'plugin:plugin-b',
				description: undefined,
				metadata: {},
			});

			const pluginAComponents = registry.getByNamespace('plugin-a');
			assert.strictEqual(pluginAComponents.length, 3);

			const names = pluginAComponents.map((c) => c.name).sort();
			assert.deepStrictEqual(names, ['agent-1', 'skill-1', 'skill-2']);

			// All should have correct namespace
			assert.ok(pluginAComponents.every((c) => c.namespace === 'plugin-a'));
		});

		it('should return empty array for non-existent namespace', () => {
			const result = registry.getByNamespace('nonexistent');
			assert.deepStrictEqual(result, []);
		});

		it('should not include flat components in namespace listing', () => {
			// Flat component
			registry.register({
				name: 'flat-skill',
				namespace: undefined,
				type: 'skill',
				filePath: '/flat.md',
				source: 'user',
				description: undefined,
				metadata: {},
			});

			// Namespaced component
			registry.register({
				name: 'ns-skill',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/ns-skill.md',
				source: 'plugin:plugin',
				description: undefined,
				metadata: {},
			});

			// Flat components have namespace=undefined, not included
			const pluginComponents = registry.getByNamespace('plugin');
			assert.strictEqual(pluginComponents.length, 1);
			assert.strictEqual(pluginComponents[0].name, 'ns-skill');
		});
	});

	describe('mixed coexistence', () => {
		it('should allow both namespaced and flat components without interference', () => {
			// Flat skill
			registry.register({
				name: 'review',
				namespace: undefined,
				type: 'skill',
				filePath: '/skills/review/SKILL.md',
				source: 'user',
				description: 'User skill',
				metadata: {},
			});

			// Namespaced skill
			registry.register({
				name: 'review',
				namespace: 'my-plugin',
				type: 'skill',
				filePath: '/plugins/my-plugin/skills/review/SKILL.md',
				source: 'plugin:my-plugin',
				description: 'Plugin skill',
				metadata: { pluginVersion: '1.0.0' },
			});

			// Namespaced agent
			registry.register({
				name: 'builder',
				namespace: 'my-plugin',
				type: 'agent',
				filePath: '/plugins/my-plugin/agents/builder/AGENT.md',
				source: 'plugin:my-plugin',
				description: 'Plugin agent',
				metadata: {},
			});

			// Flat agent
			registry.register({
				name: 'assistant',
				namespace: undefined,
				type: 'agent',
				filePath: '/agents/assistant/AGENT.md',
				source: 'project',
				description: 'Project agent',
				metadata: {},
			});

			// Verify total count
			assert.strictEqual(registry.size, 4);

			// Flat skill
			const flatSkill = registry.getByCanonical('review');
			assert.ok(flatSkill !== undefined);
			assert.strictEqual(flatSkill.namespace, undefined);
			assert.strictEqual(flatSkill.type, 'skill');

			// Namespaced skill
			const nsSkill = registry.getByCanonical('my-plugin:review');
			assert.ok(nsSkill !== undefined);
			assert.strictEqual(nsSkill.namespace, 'my-plugin');
			assert.strictEqual(nsSkill.type, 'skill');

			// Namespaced agent
			const nsAgent = registry.getByCanonical('my-plugin:builder');
			assert.ok(nsAgent !== undefined);
			assert.strictEqual(nsAgent.namespace, 'my-plugin');
			assert.strictEqual(nsAgent.type, 'agent');

			// Flat agent
			const flatAgent = registry.getByCanonical('assistant');
			assert.ok(flatAgent !== undefined);
			assert.strictEqual(flatAgent.namespace, undefined);
			assert.strictEqual(flatAgent.type, 'agent');

			// Namespace listing
			const myPluginComponents = registry.getByNamespace('my-plugin');
			assert.strictEqual(myPluginComponents.length, 2);

			// No collisions
			assert.strictEqual(registry.getDiagnostics().length, 0);
		});
	});

	describe('getAll and has', () => {
		it('should return all components via getAll', () => {
			registry.register({
				name: 'skill-1',
				namespace: 'plugin-a',
				type: 'skill',
				filePath: '/a/s1.md',
				source: 'a',
				description: undefined,
				metadata: {},
			});
			registry.register({
				name: 'skill-2',
				namespace: undefined,
				type: 'skill',
				filePath: '/s2.md',
				source: 'user',
				description: undefined,
				metadata: {},
			});

			const all = registry.getAll();
			assert.strictEqual(all.length, 2);

			const canonicalNames = all.map((c) => c.canonicalName).sort();
			assert.deepStrictEqual(canonicalNames, ['plugin-a:skill-1', 'skill-2']);
		});

		it('should check existence via has', () => {
			registry.register({
				name: 'test',
				namespace: 'ns',
				type: 'skill',
				filePath: '/test.md',
				source: 'test',
				description: undefined,
				metadata: {},
			});

			assert.strictEqual(registry.has('ns:test'), true);
			assert.strictEqual(registry.has('ns:other'), false);
			assert.strictEqual(registry.has('test'), false);
		});
	});
});

describe('componentsFromDiscovery', () => {
	it('should convert DiscoveredPlugin to registerable components', () => {
		const mockPlugin: DiscoveredPlugin = {
			name: 'test-plugin',
			canonicalName: 'test-plugin',
			source: './plugins/test-plugin',
			resolvedPath: '/plugins/test-plugin',
			status: 'ok',
			manifestSource: 'plugin.json',
			description: 'A test plugin',
			version: '1.0.0',
			author: { name: 'Test Author' },
			category: 'testing',
			homepage: 'https://example.com/test-plugin',
			inventory: {
				skills: ['skill-a', 'skill-b'],
				agents: ['agent-x'],
				commands: [],
				mcpServers: {},
				lspServers: {},
				hooks: [],
			},
		};

		const components = componentsFromDiscovery(mockPlugin);

		// Should have 3 components (2 skills + 1 agent)
		assert.strictEqual(components.length, 3);

		// All should have the plugin's canonical name as namespace
		assert.ok(components.every((c) => c.namespace === 'test-plugin'));

		// Verify skills
		const skills = components.filter((c) => c.type === 'skill');
		assert.strictEqual(skills.length, 2);

		const skillNames = skills.map((c) => c.name).sort();
		assert.deepStrictEqual(skillNames, ['skill-a', 'skill-b']);

		// Verify agents
		const agents = components.filter((c) => c.type === 'agent');
		assert.strictEqual(agents.length, 1);
		assert.strictEqual(agents[0].name, 'agent-x');

		// Verify metadata propagation
		assert.strictEqual(skills[0].metadata.pluginVersion, '1.0.0');
		assert.strictEqual(skills[0].metadata.pluginAuthor, 'Test Author');
		assert.strictEqual(skills[0].metadata.pluginHomepage, 'https://example.com/test-plugin');
		assert.strictEqual(skills[0].metadata.pluginCategory, 'testing');

		// Verify source format
		assert.strictEqual(skills[0].source, 'plugin:test-plugin');
	});

	it('should handle plugin without resolvedPath (external plugin)', () => {
		const externalPlugin: DiscoveredPlugin = {
			name: 'external-plugin',
			canonicalName: 'external-plugin',
			source: { source: 'github', repo: 'example/plugin' },
			resolvedPath: null, // External - not locally resolved
			status: 'ok',
			manifestSource: 'marketplace-inline',
			description: 'An external plugin',
			inventory: {
				skills: ['remote-skill'],
				agents: [],
				commands: [],
				mcpServers: {},
				lspServers: {},
				hooks: [],
			},
		};

		const components = componentsFromDiscovery(externalPlugin);

		assert.strictEqual(components.length, 1);
		assert.strictEqual(components[0].name, 'remote-skill');
		assert.strictEqual(components[0].namespace, 'external-plugin');
		assert.ok(components[0].filePath.includes('<external>'));
	});

	it('should produce components that can be registered in NamespacedRegistry', () => {
		const mockPlugin: DiscoveredPlugin = {
			name: 'integration-plugin',
			canonicalName: 'integration-plugin',
			source: './plugins/integration',
			resolvedPath: '/plugins/integration',
			status: 'ok',
			manifestSource: 'plugin.json',
			inventory: {
				skills: ['int-skill'],
				agents: ['int-agent'],
				commands: [],
				mcpServers: {},
				lspServers: {},
				hooks: [],
			},
		};

		const registry = new NamespacedRegistry();
		const components = componentsFromDiscovery(mockPlugin);

		// Register all components
		for (const component of components) {
			const diag = registry.register(component);
			assert.strictEqual(diag, undefined, 'No collision expected');
		}

		// Verify registration
		assert.strictEqual(registry.size, 2);
		assert.ok(registry.has('integration-plugin:int-skill'));
		assert.ok(registry.has('integration-plugin:int-agent'));

		// Lookup and verify
		const skill = registry.getByCanonical('integration-plugin:int-skill');
		assert.ok(skill !== undefined);
		assert.strictEqual(skill.type, 'skill');

		const agent = registry.getByCanonical('integration-plugin:int-agent');
		assert.ok(agent !== undefined);
		assert.strictEqual(agent.type, 'agent');
	});

	it('should strip .md extension from skill/agent names if present', () => {
		const pluginWithMd: DiscoveredPlugin = {
			name: 'md-plugin',
			canonicalName: 'md-plugin',
			source: './plugins/md',
			resolvedPath: '/plugins/md',
			status: 'ok',
			manifestSource: 'derived',
			inventory: {
				skills: ['skill.md'], // .md extension in inventory
				agents: ['agent.md'],
				commands: [],
				mcpServers: {},
				lspServers: {},
				hooks: [],
			},
		};

		const components = componentsFromDiscovery(pluginWithMd);

		const skill = components.find((c) => c.type === 'skill');
		const agent = components.find((c) => c.type === 'agent');

		assert.ok(skill !== undefined);
		assert.ok(agent !== undefined);
		assert.strictEqual(skill.name, 'skill'); // .md stripped
		assert.strictEqual(agent.name, 'agent'); // .md stripped
	});
});

describe('diagnostic structure verification', () => {
	it('should emit diagnostic with correct RegistryCollision shape', () => {
		const registry = new NamespacedRegistry();

		registry.register({
			name: 'dup',
			namespace: 'ns',
			type: 'skill',
			filePath: '/first/dup.md',
			source: 'first-source',
			description: undefined,
			metadata: {},
		});

		const diag = registry.register({
			name: 'dup',
			namespace: 'ns',
			type: 'skill',
			filePath: '/second/dup.md',
			source: 'second-source',
			description: undefined,
			metadata: {},
		});

		assert.ok(diag !== undefined);

		// Verify diagnostic type
		assert.strictEqual(diag.type, 'collision');

		// Verify message format
		assert.ok(diag.message.includes('ns:dup'));
		assert.ok(diag.message.includes('collision'));

		// Verify collision object structure
		assert.strictEqual(diag.collision.canonicalName, 'ns:dup');
		assert.strictEqual(diag.collision.winnerPath, '/first/dup.md');
		assert.strictEqual(diag.collision.loserPath, '/second/dup.md');
		assert.strictEqual(diag.collision.winnerSource, 'first-source');
		assert.strictEqual(diag.collision.loserSource, 'second-source');
	});

	it('should provide inspectable diagnostics via getDiagnostics', () => {
		const registry = new NamespacedRegistry();

		// Create collision
		registry.register({
			name: 'skill',
			namespace: 'plugin',
			type: 'skill',
			filePath: '/a/skill.md',
			source: 'a',
			description: undefined,
			metadata: {},
		});
		registry.register({
			name: 'skill',
			namespace: 'plugin',
			type: 'skill',
			filePath: '/b/skill.md',
			source: 'b',
			description: undefined,
			metadata: {},
		});

		const diagnostics = registry.getDiagnostics();

		assert.strictEqual(diagnostics.length, 1);

		// Verify diagnostic is a copy (not mutable reference)
		diagnostics[0].message = 'modified';
		const freshDiagnostics = registry.getDiagnostics();
		assert.strictEqual(freshDiagnostics[0].message, 'canonical name "plugin:skill" collision');
	});
});

describe('alias management', () => {
	let registry: NamespacedRegistry;

	beforeEach(() => {
		registry = new NamespacedRegistry();
	});

	describe('registerAlias', () => {
		it('should register an alias for an existing canonical name', () => {
			registry.register({
				name: '3d-visualizer',
				namespace: 'python-tools',
				type: 'skill',
				filePath: '/python-tools/3d-visualizer/SKILL.md',
				source: 'plugin:python-tools',
				description: '3D visualization',
				metadata: {},
			});

			const result = registry.registerAlias('py3d', 'python-tools:3d-visualizer');

			assert.strictEqual(result.success, true);
			assert.strictEqual(registry.hasAlias('py3d'), true);
			assert.strictEqual(registry.resolveAlias('py3d'), 'python-tools:3d-visualizer');
		});

		it('should reject alias if target canonical name does not exist', () => {
			const result = registry.registerAlias('py3d', 'nonexistent:skill');

			assert.strictEqual(result.success, false);
			assert.strictEqual(result.reason, 'canonical-not-found');
			assert.ok(result.message?.includes('does not exist'));
		});

		it('should reject alias that shadows an existing canonical name', () => {
			registry.register({
				name: 'existing',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/existing/SKILL.md',
				source: 'plugin:plugin',
				description: 'Existing skill',
				metadata: {},
			});
			registry.register({
				name: 'other',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/other/SKILL.md',
				source: 'plugin:plugin',
				description: 'Other skill',
				metadata: {},
			});

			// Try to create alias that matches an existing canonical name
			const result = registry.registerAlias('plugin:existing', 'plugin:other');

			assert.strictEqual(result.success, false);
			assert.strictEqual(result.reason, 'shadows-canonical');
			assert.ok(result.message?.includes('shadows an existing canonical name'));
		});

		it('should reject duplicate alias pointing to different target', () => {
			registry.register({
				name: 'skill-a',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/skill-a/SKILL.md',
				source: 'plugin:plugin',
				description: 'Skill A',
				metadata: {},
			});
			registry.register({
				name: 'skill-b',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/skill-b/SKILL.md',
				source: 'plugin:plugin',
				description: 'Skill B',
				metadata: {},
			});

			// First alias succeeds
			const first = registry.registerAlias('shortcut', 'plugin:skill-a');
			assert.strictEqual(first.success, true);

			// Second alias with same name but different target fails
			const second = registry.registerAlias('shortcut', 'plugin:skill-b');
			assert.strictEqual(second.success, false);
			assert.strictEqual(second.reason, 'duplicate-alias');
			assert.ok(second.message?.includes('already exists'));
		});

		it('should be idempotent for same alias and target', () => {
			registry.register({
				name: 'skill',
				namespace: 'plugin',
				type: 'skill',
				filePath: '/plugin/skill/SKILL.md',
				source: 'plugin:plugin',
				description: 'Skill',
				metadata: {},
			});

			// Register alias twice with same target
			const first = registry.registerAlias('s', 'plugin:skill');
			assert.strictEqual(first.success, true);

			const second = registry.registerAlias('s', 'plugin:skill');
			assert.strictEqual(second.success, true);
		});

		it('should allow multiple aliases for same canonical name', () => {
			registry.register({
				name: 'visualizer',
				namespace: 'python-tools',
				type: 'skill',
				filePath: '/python-tools/visualizer/SKILL.md',
				source: 'plugin:python-tools',
				description: 'Visualizer',
				metadata: {},
			});

			const r1 = registry.registerAlias('pyviz', 'python-tools:visualizer');
			const r2 = registry.registerAlias('viz', 'python-tools:visualizer');
			const r3 = registry.registerAlias('py3d', 'python-tools:visualizer');

			assert.strictEqual(r1.success, true);
			assert.strictEqual(r2.success, true);
			assert.strictEqual(r3.success, true);

			assert.strictEqual(registry.resolveAlias('pyviz'), 'python-tools:visualizer');
			assert.strictEqual(registry.resolveAlias('viz'), 'python-tools:visualizer');
			assert.strictEqual(registry.resolveAlias('py3d'), 'python-tools:visualizer');
		});
	});

	describe('resolveAlias', () => {
		it('should resolve registered alias to canonical name', () => {
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/skill/SKILL.md',
				source: 'plugin:ns',
				description: 'Skill',
				metadata: {},
			});
			registry.registerAlias('s', 'ns:skill');

			assert.strictEqual(registry.resolveAlias('s'), 'ns:skill');
		});

		it('should return undefined for non-existent alias', () => {
			assert.strictEqual(registry.resolveAlias('nonexistent'), undefined);
		});
	});

	describe('removeAlias', () => {
		it('should remove an existing alias', () => {
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/skill/SKILL.md',
				source: 'plugin:ns',
				description: 'Skill',
				metadata: {},
			});
			registry.registerAlias('s', 'ns:skill');

			assert.strictEqual(registry.hasAlias('s'), true);

			const removed = registry.removeAlias('s');
			assert.strictEqual(removed, true);
			assert.strictEqual(registry.hasAlias('s'), false);
			assert.strictEqual(registry.resolveAlias('s'), undefined);
		});

		it('should return false for non-existent alias', () => {
			const removed = registry.removeAlias('nonexistent');
			assert.strictEqual(removed, false);
		});
	});

	describe('getAliases', () => {
		it('should return empty map when no aliases registered', () => {
			const aliases = registry.getAliases();
			assert.strictEqual(aliases.size, 0);
		});

		it('should return copy of alias map', () => {
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/skill/SKILL.md',
				source: 'plugin:ns',
				description: 'Skill',
				metadata: {},
			});
			registry.registerAlias('s', 'ns:skill');

			const aliases = registry.getAliases();
			assert.strictEqual(aliases.size, 1);
			assert.strictEqual(aliases.get('s'), 'ns:skill');

			// Mutating returned map should not affect registry
			aliases.set('other', 'ns:other');
			assert.strictEqual(registry.hasAlias('other'), false);
		});

		it('should include all registered aliases', () => {
			registry.register({
				name: 'skill-a',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/a/SKILL.md',
				source: 'plugin:ns',
				description: 'A',
				metadata: {},
			});
			registry.register({
				name: 'skill-b',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/b/SKILL.md',
				source: 'plugin:ns',
				description: 'B',
				metadata: {},
			});

			registry.registerAlias('sa', 'ns:skill-a');
			registry.registerAlias('sb', 'ns:skill-b');

			const aliases = registry.getAliases();
			assert.strictEqual(aliases.size, 2);
			assert.strictEqual(aliases.get('sa'), 'ns:skill-a');
			assert.strictEqual(aliases.get('sb'), 'ns:skill-b');
		});
	});

	describe('hasAlias', () => {
		it('should return true for registered alias', () => {
			registry.register({
				name: 'skill',
				namespace: 'ns',
				type: 'skill',
				filePath: '/ns/skill/SKILL.md',
				source: 'plugin:ns',
				description: 'Skill',
				metadata: {},
			});
			registry.registerAlias('s', 'ns:skill');

			assert.strictEqual(registry.hasAlias('s'), true);
		});

		it('should return false for non-existent alias', () => {
			assert.strictEqual(registry.hasAlias('nonexistent'), false);
		});
	});
});