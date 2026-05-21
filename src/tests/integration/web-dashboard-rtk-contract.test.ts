/**
 * GSD2 web dashboard RTK metric behavior tests.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { deriveDashboardRtkMetric } from "../../../web/lib/dashboard-metrics.ts"

const formatTokens = (tokens: number) => `${tokens} tok`

test("dashboard RTK metric stays disabled until live auto state opts in", () => {
  assert.deepEqual(
    deriveDashboardRtkMetric({ rtkEnabled: false, rtkSavings: { savedTokens: 1200, commands: 2, savingsPct: 50 } }, false, formatTokens),
    {
      enabled: false,
      label: "RTK Saved",
      value: "1200 tok",
      subtext: "50% saved • 2 cmds",
    },
  )
})

test("dashboard RTK metric displays live savings when enabled", () => {
  assert.deepEqual(
    deriveDashboardRtkMetric({ rtkEnabled: true, rtkSavings: { savedTokens: 1200, commands: 1, savingsPct: 49.6 } }, false, formatTokens),
    {
      enabled: true,
      label: "RTK Saved",
      value: "1200 tok",
      subtext: "50% saved • 1 cmd",
    },
  )
})

test("dashboard RTK metric uses loading and empty-shell states", () => {
  assert.deepEqual(
    deriveDashboardRtkMetric({ rtkEnabled: true, rtkSavings: { savedTokens: 900, commands: 3, savingsPct: 33 } }, true, formatTokens),
    {
      enabled: true,
      label: "RTK Saved",
      value: null,
      subtext: null,
    },
  )

  assert.deepEqual(deriveDashboardRtkMetric({ rtkEnabled: true, rtkSavings: null }, false, formatTokens), {
    enabled: true,
    label: "RTK Saved",
    value: "0 tok",
    subtext: "Waiting for shell usage",
  })
})
