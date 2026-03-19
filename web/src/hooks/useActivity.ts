// ─── useActivity ──────────────────────────────────────────────────────────────
// TanStack Query hook for recent activity log entries from /api/activity.
// Subscribes to `state_change` WS events and invalidates ['activity', hash].

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribe } from '@/lib/ws/client'
import { fetchActivity } from '@/lib/api/client'
import { useActiveProjectHash } from '@/stores/connection'
import type { ActivityEntry } from '@/lib/api/types'

/** Event types that warrant an activity query invalidation */
const INVALIDATING_EVENTS = new Set(['state_change'])

/**
 * Returns recent log activity entries (last 200) from the server ring buffer.
 * - Polls every 60s as a fallback.
 * - Invalidates on `state_change` WS events (broad invalidation covers auto-mode transitions).
 * - Observability: query visible in React Query devtools under key ['activity', hash].
 */
export function useActivity() {
  const hash = useActiveProjectHash()
  const queryClient = useQueryClient()

  const query = useQuery<ActivityEntry[], Error>({
    queryKey: ['activity', hash],
    queryFn: () => fetchActivity(hash!),
    enabled: !!hash,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!hash) return

    const unsubscribe = subscribe((event) => {
      if (INVALIDATING_EVENTS.has(event.type)) {
        void queryClient.invalidateQueries({ queryKey: ['activity', hash] })
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
