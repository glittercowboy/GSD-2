// ─── useHealth ────────────────────────────────────────────────────────────────
// TanStack Query hook for health diagnostic data.
// Subscribes to `health_change` WS events and invalidates ['health', hash].

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribe } from '@/lib/ws/client'
import { fetchHealth } from '@/lib/api/client'
import { useActiveProjectHash } from '@/stores/connection'
import type { HealthDataResponse } from '@/lib/api/types'

/** Event types that warrant a health query invalidation */
const INVALIDATING_EVENTS = new Set(['health_change'])

/**
 * Returns live GSD health data (providers, env checks, budget pressure) via TanStack Query.
 * - Polls every 30s as a fallback.
 * - Invalidates immediately on `health_change` WS broadcast events.
 * - Observability: query visible in React Query devtools under key ['health', hash].
 */
export function useHealth() {
  const hash = useActiveProjectHash()
  const queryClient = useQueryClient()

  const query = useQuery<HealthDataResponse, Error>({
    queryKey: ['health', hash],
    queryFn: () => fetchHealth(hash!),
    enabled: !!hash,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!hash) return

    const unsubscribe = subscribe((event) => {
      if (INVALIDATING_EVENTS.has(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['health', hash] })
      }
    })

    return unsubscribe
  }, [hash, queryClient])

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
