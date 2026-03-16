// @ts-ignore — @modelcontextprotocol/sdk types may not be in extensions tsconfig
import { Server } from '@modelcontextprotocol/sdk/server'
// @ts-ignore
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio'
// @ts-ignore
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types'

interface McpTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }>
}

export async function startMcpServer(options: {
  tools: McpTool[]
  version?: string
}): Promise<void> {
  const { tools, version = '0.0.0' } = options

  const toolMap = new Map<string, McpTool>()
  for (const tool of tools) {
    toolMap.set(tool.name, tool)
  }

  const server = new Server(
    { name: 'gsd', version },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params
    const tool = toolMap.get(name)
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      }
    }

    try {
      const result = await tool.execute(
        `mcp-${Date.now()}`,
        args ?? {},
        undefined,
        undefined,
      )

      const content = result.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text }
        }
        if (block.type === 'image') {
          return {
            type: 'image' as const,
            data: block.data,
            mimeType: block.mimeType,
          }
        }
        return { type: 'text' as const, text: JSON.stringify(block) }
      })

      return { content }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        isError: true,
        content: [{ type: 'text' as const, text: message }],
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.stderr.write(`[gsd] MCP server started (v${version})\n`)
}
