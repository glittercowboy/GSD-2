// GSD-2 — MCP connections API route.
// File Purpose: Exposes app-side MCP connection management actions.

import {
  collectMcpManagementData,
  mutateMcpManagement,
} from "../../../../src/web/mcp-management-service.ts"
import { requireProjectCwd } from "../../../../src/web/bridge-service.ts"
import type { WebMcpMutationRequest } from "@/lib/mcp-management-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  try {
    const projectCwd = requireProjectCwd(request)
    const payload = await collectMcpManagementData(projectCwd)
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const projectCwd = requireProjectCwd(request)
    const body = await request.json() as WebMcpMutationRequest
    const payload = await mutateMcpManagement(body, projectCwd)
    if (payload.status === "error") {
      return Response.json(payload, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      })
    }
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { status: "error", error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}
