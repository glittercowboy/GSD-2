import { ClipboardText } from '@phosphor-icons/react'
import { Card } from '@/components/primitives/Card'
import { EmptyState } from '@/components/primitives/EmptyState'

export function RequirementsView() {
  return (
    <Card>
      <EmptyState
        icon={<ClipboardText size={48} />}
        heading="Requirements"
        body="Coming in S06"
      />
    </Card>
  )
}
