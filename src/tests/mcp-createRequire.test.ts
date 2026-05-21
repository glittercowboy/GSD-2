import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mcpSdkSpecifier } from '../mcp-server.ts';

describe('MCP server SDK subpath imports (#3603 / #3914)', () => {
  test('server/index.js subpath is imported with explicit .js suffix', () => {
    assert.equal(
      mcpSdkSpecifier('server/index'),
      '@modelcontextprotocol/sdk/server/index.js',
    );
  });

  test('server/stdio.js subpath is imported with explicit .js suffix', () => {
    assert.equal(
      mcpSdkSpecifier('server/stdio'),
      '@modelcontextprotocol/sdk/server/stdio.js',
    );
  });

  test('types.js subpath is imported with explicit .js suffix', () => {
    assert.equal(mcpSdkSpecifier('types'), '@modelcontextprotocol/sdk/types.js');
  });
});
