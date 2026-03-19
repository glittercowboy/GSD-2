// ─── useCommand ───────────────────────────────────────────────────────────────
// Mutation hook for dispatching control commands (stop_auto, pause_auto).
// Invalidates ['state', hash] on success so the dashboard refreshes.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postCommand } from '@/lib/api/client'
import { useActiveProjectHash } from '@/stores/connection'

/**
 * Returns a mutation for sending a control command to the GSD server.
 *
 * Usage:
 *   const { execute, isPending, isError, error } = useCommand()
 *   execute('stop_auto')
 *
 * Observability:
 *   - On success: state query is invalidated → dashboard re-fetches immediately.
 *   - On error: isError=true, error.message is the server error string — display
 *     it in the UI or log it with console.error.
 *   - Mutation state visible in React Query devtools under 'postCommand'.
 */
export function useCommand() {
  const hash = useActiveProjectHash()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (command: string) => postCommand(command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['state', hash] })
    },
  })

  return {
    execute: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  }
}
