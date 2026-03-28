import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatProgress } from '../headless-ui.js'

describe('formatProgress', () => {
  describe('tool_execution_start', () => {
    it('shows tool name and summarized args', () => {
      const result = formatProgress({
        type: 'tool_execution_start',
        toolName: 'bash',
        args: { command: 'npm run build' },
      }, false)
      assert.equal(result, '  [tool]    bash npm run build')
    })

    it('shows Read with file path', () => {
      const result = formatProgress({
        type: 'tool_execution_start',
        toolName: 'Read',
        args: { path: 'src/main.ts' },
      }, false)
      assert.equal(result, '  [tool]    Read src/main.ts')
    })

    it('shows grep with pattern and path', () => {
      const result = formatProgress({
        type: 'tool_execution_start',
        toolName: 'grep',
        args: { pattern: 'TODO', path: 'src/' },
      }, false)
      assert.equal(result, '  [tool]    grep /TODO/ in src/')
    })

    it('truncates long bash commands', () => {
      const longCmd = 'a'.repeat(100)
      const result = formatProgress({
        type: 'tool_execution_start',
        toolName: 'bash',
        args: { command: longCmd },
      }, false)
      assert.ok(result!.endsWith('...'))
      assert.ok(result!.length < 100)
    })

    it('shows tool name alone when no args', () => {
      const result = formatProgress({
        type: 'tool_execution_start',
        toolName: 'unknown_tool',
      }, false)
      assert.equal(result, '  [tool]    unknown_tool')
    })
  })

  describe('tool_execution_end', () => {
    it('shows error in non-verbose mode', () => {
      const result = formatProgress({
        type: 'tool_execution_end',
        toolName: 'bash',
        isError: true,
      }, false)
      assert.equal(result, '  [tool]    bash ✗ error')
    })

    it('suppresses success in non-verbose mode', () => {
      const result = formatProgress({
        type: 'tool_execution_end',
        toolName: 'bash',
        isError: false,
      }, false)
      assert.equal(result, null)
    })
  })

  describe('cost_update', () => {
    it('formats cost with token breakdown', () => {
      const result = formatProgress({
        type: 'cost_update',
        cumulativeCost: { costUsd: 0.0523 },
        tokens: { input: 4200, output: 1100 },
      }, false)
      assert.equal(result, '  [cost]    $0.0523 (4.2k in / 1.1k out)')
    })

    it('returns null for zero cost', () => {
      const result = formatProgress({
        type: 'cost_update',
        cumulativeCost: { costUsd: 0 },
        tokens: { input: 0, output: 0 },
      }, false)
      assert.equal(result, null)
    })
  })

  describe('extension_ui_request', () => {
    it('shows notify with message', () => {
      const result = formatProgress({
        type: 'extension_ui_request',
        method: 'notify',
        message: 'Committed: fix auth',
      }, false)
      assert.equal(result, '[gsd]     Committed: fix auth')
    })

    it('suppresses empty notify', () => {
      const result = formatProgress({
        type: 'extension_ui_request',
        method: 'notify',
        message: '',
      }, false)
      assert.equal(result, null)
    })

    it('suppresses setStatus (TUI-only)', () => {
      const result = formatProgress({
        type: 'extension_ui_request',
        method: 'setStatus',
        statusKey: 'gsd-auto',
        statusText: 'auto',
      }, false)
      assert.equal(result, null)
    })

    it('suppresses setWidget (TUI-only)', () => {
      const result = formatProgress({
        type: 'extension_ui_request',
        method: 'setWidget',
        widgetKey: 'progress',
      }, false)
      assert.equal(result, null)
    })
  })

  describe('agent lifecycle', () => {
    it('shows agent_start', () => {
      assert.equal(formatProgress({ type: 'agent_start' }, false), '[agent]   Session started')
    })

    it('shows agent_end', () => {
      assert.equal(formatProgress({ type: 'agent_end' }, false), '[agent]   Session ended')
    })
  })

  describe('unknown events', () => {
    it('returns null', () => {
      assert.equal(formatProgress({ type: 'some_random_event' }, false), null)
    })
  })
})
