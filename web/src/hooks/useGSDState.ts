// ─── useGSDState ──────────────────────────────────────────────────────────────
// TanStack Query hook for project state with real-time WS invalidation.
// Subscribes to relevant WS events and invalidates ['state', hash] on each.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribe } from '@/lib/ws/client'
import { fetchState } from '@/lib/api/client'
import { useActiveProjectHash } from '@/stores/connection'
import type { GSDState } from '@/lib/api/types'

/** Event types that warrant a state query invalidation */
const INVALIDATING_EVENTS = new Set([
  'state_change',
  'phase_change',
  'unit_start',
  'unit_complete',
  'metric_update',
])

/**
 * Returns live GSD project state via TanStack Query.
 * - Polls every 10s as a fallback.
 * - Invalidates immediately on relevant WS broadcast events.
 * - Observability: query is visible in React Query devtools under key ['state', hash].
 */
export function useGSDState() {
  const hash = useActiveProjectHash()
  const queryClient = useQueryClient()

  const query = useQuery<GSDState, Error>({
    queryKey: ['state', hash],
    queryFn: () => fetchState(hash!),
    enabled: !!hash,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (!hash) return

    const unsubscribe = subscribe((event) => {
      if (INVALIDATING_EVENTS.has(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['state', hash] })
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
