import { Gear } from '@phosphor-icons/react'
import { Card } from '@/components/primitives/Card'
import { EmptyState } from '@/components/primitives/EmptyState'

export function PreferencesView() {
  return (
    <Card>
      <EmptyState
        icon={<Gear size={48} />}
        heading="Preferences"
        body="Coming in S06"
      />
    </Card>
  )
}
