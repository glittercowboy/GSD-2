// ─── ConfirmModal ─────────────────────────────────────────────────────────────
// Pure presentational confirmation dialog overlay. No store dependencies.
// Handles Escape key to cancel. Renders nothing when open=false.

import React, { useEffect } from 'react'
import { Card } from '@/components/primitives/Card'

export type ConfirmModalVariant = 'default' | 'danger'

interface ConfirmModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  body: string
  confirmLabel?: string
  variant?: ConfirmModalVariant
}

export function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  body,
  confirmLabel = 'Confirm',
  variant = 'default',
}: ConfirmModalProps) {
  // Handle Escape key to dismiss
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onCancel])

  if (!open) return null

  const confirmButtonClass =
    variant === 'danger'
      ? 'px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors'
      : 'px-4 py-2 rounded-md text-sm font-medium bg-accent hover:bg-accent/90 text-white transition-colors'

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      {/* Modal card — stop click propagation so backdrop click doesn't close */}
      <div
        className="w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="flex flex-col gap-4">
          {/* Title */}
          <h2 className="text-base font-semibold text-text-primary leading-snug">
            {title}
          </h2>
          {/* Body */}
          <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-md text-sm font-medium bg-bg-tertiary hover:bg-border text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={confirmButtonClass}
            >
              {confirmLabel}
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
