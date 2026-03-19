// ─── main.tsx ─────────────────────────────────────────────────────────────────
// React entry point. Wires QueryClient, RouterProvider, and connection init.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useConnectionStore } from './stores/connection'
import { router } from './router'
import './styles/index.css'

// ─── QueryClient ──────────────────────────────────────────────────────────────
// Created at module scope — NOT inside a component (per react-best-practices).
// WS invalidation provides snappier updates; staleTime avoids redundant refetches.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,           // 5 seconds — WS invalidation covers freshness
      refetchOnWindowFocus: false, // WS events handle revalidation instead
    },
  },
})

// ─── Connection init ──────────────────────────────────────────────────────────
// Start WS connection and fetch initial project list immediately at app load.
// Called at module scope so it fires before the first render.

useConnectionStore.getState().initConnection()

// ─── Observability (dev only) ─────────────────────────────────────────────────
// Expose Zustand store on window for React DevTools / manual inspection.

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__ZUSTAND_STORE__ = useConnectionStore
}

// ─── Render ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
