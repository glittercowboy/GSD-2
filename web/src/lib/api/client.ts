// ─── Typed Fetch Client ───────────────────────────────────────────────────────
// All API calls go through this module. BASE_URL is derived from env or origin
// so the client works in both dev (proxied to :4242) and production.

import type { GSDState, ProjectEntry, VisualizerDataResponse, MetricsDataResponse, HealthDataResponse, ActivityEntry } from './types'

export const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    })
  } catch (err) {
    console.error(`[gsd-web] fetch error: ${path}`, err)
    throw err
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore JSON parse failure — keep status message
    }
    const error = new Error(message)
    console.error(`[gsd-web] API error: ${path} → ${message}`)
    throw error
  }

  return res.json() as Promise<T>
}

// ─── API Functions ────────────────────────────────────────────────────────────

/** GET /api/projects — returns {hash, name}[] sorted by name */
export function fetchProjects(): Promise<ProjectEntry[]> {
  return apiFetch<ProjectEntry[]>('/api/projects')
}

/** GET /api/state?project=<hash> — returns current GSD project state */
export function fetchState(projectHash: string): Promise<GSDState> {
  return apiFetch<GSDState>(`/api/state?project=${encodeURIComponent(projectHash)}`)
}

/**
 * GET /api/health?project=<hash> — returns typed health diagnostic data.
 */
export function fetchHealth(projectHash: string): Promise<HealthDataResponse> {
  return apiFetch<HealthDataResponse>(`/api/health?project=${encodeURIComponent(projectHash)}`)
}

/** POST /api/command — send a control command to the GSD server */
export function postCommand(command: string): Promise<{ status: string; command: string }> {
  return apiFetch<{ status: string; command: string }>('/api/command', {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

/** GET /api/visualizer?project=<hash> — returns full visualizer data with M→S→T tree and metrics */
export function fetchVisualizer(projectHash: string): Promise<VisualizerDataResponse> {
  return apiFetch<VisualizerDataResponse>(`/api/visualizer?project=${encodeURIComponent(projectHash)}`)
}

/** GET /api/metrics?project=<hash> — returns metrics aggregates and budget info */
export function fetchMetrics(projectHash: string): Promise<MetricsDataResponse> {
  return apiFetch<MetricsDataResponse>(`/api/metrics?project=${encodeURIComponent(projectHash)}`)
}

/** GET /api/activity?project=<hash> — returns last 200 log entries from the ring buffer */
export function fetchActivity(projectHash: string): Promise<ActivityEntry[]> {
  return apiFetch<ActivityEntry[]>('/api/activity?project=' + encodeURIComponent(projectHash))
}
