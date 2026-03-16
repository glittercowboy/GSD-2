/**
 * Marketplace Discovery Tests
 * 
 * Tests for the marketplace discovery module that reads marketplace.json
 * from real Claude marketplace repos, resolves plugin roots, parses plugin.json
 * manifests, and inventories components.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  parseMarketplaceJson,
  inspectPlugin,
  discoverMarketplace,
  resolvePluginRoot
} from '../marketplace-discovery.js';
import { getMarketplaceFixtures } from './marketplace-test-fixtures.js';

const fixtureSetup = getMarketplaceFixtures(import.meta.dirname);
const fixtures = fixtureSetup.fixtures;
const CLAUDE_SKILLS_PATH = fixtures?.claudeSkillsPath;
const CLAUDE_PLUGINS_OFFICIAL_PATH = fixtures?.claudePluginsOfficialPath;

const skipReason = !fixtureSetup.available
  ? fixtureSetup.skipReason ?? 'Marketplace repos not found'
  : undefined;

describe('parseMarketplaceJson', { skip: skipReason }, () => {
  it('should parse jamie-style marketplace.json', () => {
    const result = parseMarketplaceJson(CLAUDE_SKILLS_PATH!);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.manifest.name, 'jamie-bitflight-skills');
      assert.strictEqual(result.manifest.plugins.length, 26);
    }
  });

  it('should parse official-style marketplace.json', () => {
    const result = parseMarketplaceJson(CLAUDE_PLUGINS_OFFICIAL_PATH!);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.manifest.name, 'claude-plugins-official');
      assert.ok(result.manifest.plugins.length > 50);
    }
  });

  it('should return error for missing marketplace.json', () => {
    const result = parseMarketplaceJson('/tmp/nonexistent');
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes('not found'));
    }
  });

  it('should return error for malformed JSON', () => {
    const tmpDir = '/tmp/test-marketplace-json-' + Date.now();
    fs.mkdirSync(tmpDir + '/.claude-plugin', { recursive: true });
    fs.writeFileSync(tmpDir + '/.claude-plugin/marketplace.json', '{ invalid json');
    
    const result = parseMarketplaceJson(tmpDir);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes('Failed to parse'));
    }
    
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('resolvePluginRoot', { skip: skipReason }, () => {
  it('should resolve relative paths correctly', () => {
    const result = resolvePluginRoot(CLAUDE_SKILLS_PATH!, './plugins/python3-development');
    assert.strictEqual(result, path.join(CLAUDE_SKILLS_PATH!, 'plugins/python3-development'));
  });

  it('should handle paths without ./ prefix', () => {
    const result = resolvePluginRoot(CLAUDE_SKILLS_PATH!, 'plugins/python3-development');
    assert.strictEqual(result, path.join(CLAUDE_SKILLS_PATH!, 'plugins/python3-development'));
  });

  it('should return null for external sources', () => {
    const result = resolvePluginRoot(CLAUDE_SKILLS_PATH!, 'https://github.com/example/plugin');
    assert.strictEqual(result, null);
  });

  it('should return null for git sources', () => {
    const result = resolvePluginRoot(CLAUDE_SKILLS_PATH!, { source: 'github', repo: 'example/plugin' });
    assert.strictEqual(result, null);
  });
});

describe('inspectPlugin', { skip: skipReason }, () => {
  it('should inspect a plugin with plugin.json', () => {
    const pluginDir = path.join(CLAUDE_SKILLS_PATH!, 'plugins/python3-development');
    const result = inspectPlugin(pluginDir);
    
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.manifestSource, 'plugin.json');
    assert.strictEqual(result.name, 'python3-development');
    assert.ok(result.description !== undefined);
    assert.ok(result.version !== undefined);
    assert.ok(result.inventory.skills.length > 0);
    assert.ok(result.inventory.agents.length > 0);
    assert.ok(result.inventory.commands.length > 0);
    assert.ok(Object.keys(result.inventory.mcpServers).length > 0);
  });

  it('should return error for non-existent plugin directory', () => {
    const result = inspectPlugin('/tmp/nonexistent-plugin');
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error !== undefined, 'error should be defined');
    assert.ok(result.error.includes('not found'));
  });
});

describe('discoverMarketplace', { skip: skipReason }, () => {
  it('should discover all plugins in jamie-style marketplace', () => {
    const result = discoverMarketplace(CLAUDE_SKILLS_PATH!);
    
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.pluginFormat, 'jamie-style');
    assert.ok(result.plugins.length > 0);
    assert.ok(result.plugins.every((p: { status: string }) => p.status === 'ok'));
    
    assert.strictEqual(result.summary.total, result.plugins.length);
    assert.strictEqual(result.summary.ok, result.plugins.length);
    assert.strictEqual(result.summary.error, 0);
  });

  it('should discover all plugins in official-style marketplace', () => {
    const result = discoverMarketplace(CLAUDE_PLUGINS_OFFICIAL_PATH!);
    
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.pluginFormat, 'official-style');
    assert.ok(result.plugins.length > 50);
  });

  it('should return structured error for missing marketplace', () => {
    const result = discoverMarketplace('/tmp/nonexistent');
    
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error !== undefined);
    assert.ok(result.error.includes('not found'));
    assert.deepStrictEqual(result.plugins, []);
    assert.strictEqual(result.summary.total, 0);
  });

  it('should inventory skills, agents, commands correctly', () => {
    const result = discoverMarketplace(CLAUDE_SKILLS_PATH!);
    const pythonPlugin = result.plugins.find((p: { name: string }) => p.name === 'python3-development');
    
    assert.ok(pythonPlugin !== undefined);
    if (pythonPlugin) {
      assert.ok(pythonPlugin.inventory.skills.length > 30);
      assert.ok(pythonPlugin.inventory.agents.length > 10);
      assert.ok(pythonPlugin.inventory.commands.length > 0);
    }
  });

  it('should discover MCP servers from plugin.json', () => {
    const result = discoverMarketplace(CLAUDE_SKILLS_PATH!);
    const pythonPlugin = result.plugins.find(p => p.name === 'python3-development');
    
    assert.ok(pythonPlugin !== undefined);
    if (pythonPlugin) {
      assert.ok(Object.keys(pythonPlugin.inventory.mcpServers).includes('cocoindex-code'));
    }
  });

  it('should discover LSP servers from marketplace.json', () => {
    const result = discoverMarketplace(CLAUDE_PLUGINS_OFFICIAL_PATH!);
    const tsPlugin = result.plugins.find(p => p.name === 'typescript-lsp');
    
    assert.ok(tsPlugin !== undefined);
    if (tsPlugin) {
      assert.ok(Object.keys(tsPlugin.inventory.lspServers).includes('typescript'));
    }
  });

  it('should detect external plugins correctly', () => {
    const result = discoverMarketplace(CLAUDE_PLUGINS_OFFICIAL_PATH!);
    const externalPlugin = result.plugins.find(p => p.name === 'atlassian');
    
    assert.ok(externalPlugin !== undefined);
    if (externalPlugin) {
      assert.strictEqual(externalPlugin.resolvedPath, null);
      assert.strictEqual(externalPlugin.status, 'ok');
    }
  });
});

describe('smoke test', { skip: skipReason }, () => {
  it('should be able to run discovery from both marketplace repos', () => {
    const jamieResult = discoverMarketplace(CLAUDE_SKILLS_PATH!);
    const officialResult = discoverMarketplace(CLAUDE_PLUGINS_OFFICIAL_PATH!);
    
    assert.strictEqual(jamieResult.status, 'ok');
    assert.strictEqual(officialResult.status, 'ok');
  });
});
