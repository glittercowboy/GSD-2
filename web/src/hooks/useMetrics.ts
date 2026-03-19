// ─── useMetrics ───────────────────────────────────────────────────────────────
// TanStack Query hook for metrics data (cost aggregates, cache stats, budget).
// Subscribes to `metric_update` WS events and invalidates ['metrics', hash].

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribe } from '@/lib/ws/client'
import { fetchMetrics } from '@/lib/api/client'
import { useActiveProjectHash } from '@/stores/connection'
import type { MetricsDataResponse } from '@/lib/api/types'

/** Event types that warrant a metrics query invalidation */
const INVALIDATING_EVENTS = new Set(['metric_update'])

/**
 * Returns live GSD metrics data (cost aggregates, cache stats, budget ceiling) via TanStack Query.
 * - Polls every 30s as a fallback.
 * - Invalidates immediately on `metric_update` WS broadcast events.
 * - Observability: query visible in React Query devtools under key ['metrics', hash].
 */
export function useMetrics() {
  const hash = useActiveProjectHash()
  const queryClient = useQueryClient()

  const query = useQuery<MetricsDataResponse, Error>({
    queryKey: ['metrics', hash],
    queryFn: () => fetchMetrics(hash!),
    enabled: !!hash,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!hash) return

    const unsubscribe = subscribe((event) => {
      if (INVALIDATING_EVENTS.has(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['metrics', hash] })
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
