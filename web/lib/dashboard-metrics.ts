/**
 * GSD2 Web dashboard metric derivation helpers.
 */

export type DashboardRtkSavings = {
  savedTokens: number
  commands: number
  savingsPct: number
}

export type DashboardAutoMetrics = {
  rtkEnabled?: boolean
  rtkSavings?: DashboardRtkSavings | null
}

export type DashboardRtkMetric = {
  enabled: boolean
  label: 'RTK Saved'
  value: string | null
  subtext: string | null
}

export function deriveDashboardRtkMetric(
  auto: DashboardAutoMetrics | null | undefined,
  isConnecting: boolean,
  formatTokenCount: (tokens: number) => string,
): DashboardRtkMetric {
  const savings = auto?.rtkSavings ?? null
  const enabled = auto?.rtkEnabled === true
  return {
    enabled,
    label: 'RTK Saved',
    value: isConnecting ? null : formatTokenCount(savings?.savedTokens ?? 0),
    subtext: isConnecting
      ? null
      : savings && savings.commands > 0
        ? `${Math.round(savings.savingsPct)}% saved • ${savings.commands} cmd${savings.commands === 1 ? '' : 's'}`
        : 'Waiting for shell usage',
  }
}
