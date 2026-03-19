import { Scales } from '@phosphor-icons/react'
import { Card } from '@/components/primitives/Card'
import { EmptyState } from '@/components/primitives/EmptyState'

export function DecisionsView() {
  return (
    <Card>
      <EmptyState
        icon={<Scales size={48} />}
        heading="Decisions"
        body="Coming in S06"
      />
    </Card>
  )
}
