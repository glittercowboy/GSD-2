// ─── useVisualizer ────────────────────────────────────────────────────────────
// TanStack Query hook for visualizer data (M→S→T tree + critical path).
// Subscribes to `state_change` WS events and invalidates ['visualizer', hash].
// Structural changes are slow, so we poll at 30s (vs state's 10s).

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribe } from '@/lib/ws/client'
import { fetchVisualizer } from '@/lib/api/client'
import { useActiveProjectHash } from '@/stores/connection'
import type { VisualizerDataResponse } from '@/lib/api/types'

/** Event types that warrant a visualizer query invalidation */
const INVALIDATING_EVENTS = new Set(['state_change'])

/**
 * Returns live GSD visualizer data (M→S→T tree + critical path) via TanStack Query.
 * - Polls every 30s as a fallback (structural changes are slow).
 * - Invalidates immediately on `state_change` WS broadcast events.
 * - Observability: query visible in React Query devtools under key ['visualizer', hash].
 */
export function useVisualizer() {
  const hash = useActiveProjectHash()
  const queryClient = useQueryClient()

  const query = useQuery<VisualizerDataResponse, Error>({
    queryKey: ['visualizer', hash],
    queryFn: () => fetchVisualizer(hash!),
    enabled: !!hash,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!hash) return

    const unsubscribe = subscribe((event) => {
      if (INVALIDATING_EVENTS.has(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['visualizer', hash] })
      }
    })

    // Return unsubscribe so React cleans up the listener on unmount or dep change
    return unsubscribe
  }, [hash, queryClient])

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
