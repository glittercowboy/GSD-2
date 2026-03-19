// ─── Router ───────────────────────────────────────────────────────────────────
// TanStack Router v1 code-based routing setup.
// 9 routes: / plus 8 section views.
// Root route renders Shell with <Outlet /> for child content.

import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { Shell } from '@/components/layout/Shell'

// ─── View imports ─────────────────────────────────────────────────────────────

import { DashboardView } from '@/views/dashboard'
import { MilestonesView } from '@/views/milestones'
import { MetricsView } from '@/views/metrics'
import { VisualizerView } from '@/views/visualizer'
import { HealthView } from '@/views/health'
import { LogsView } from '@/views/logs'
import { DecisionsView } from '@/views/decisions'
import { RequirementsView } from '@/views/requirements'
import { PreferencesView } from '@/views/preferences'

// ─── Root route ───────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
})

// ─── Child routes ─────────────────────────────────────────────────────────────

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardView,
})

const milestonesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/milestones',
  component: MilestonesView,
})

const metricsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/metrics',
  component: MetricsView,
})

const visualizerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/visualizer',
  component: VisualizerView,
})

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/health',
  component: HealthView,
})

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/logs',
  component: LogsView,
})

const decisionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decisions',
  component: DecisionsView,
})

const requirementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requirements',
  component: RequirementsView,
})

const preferencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preferences',
  component: PreferencesView,
})

// ─── Route tree ───────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  milestonesRoute,
  metricsRoute,
  visualizerRoute,
  healthRoute,
  logsRoute,
  decisionsRoute,
  requirementsRoute,
  preferencesRoute,
])

// ─── Router instance ──────────────────────────────────────────────────────────

export const router = createRouter({ routeTree })

// ─── Type registration ────────────────────────────────────────────────────────
// Required for type-safe useNavigate, useParams, Link, etc.

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
