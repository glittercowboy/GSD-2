// ─── AutoControls ─────────────────────────────────────────────────────────────
// Contextual auto-mode control buttons. Shows appropriate buttons based on
// active/paused state. Stop requires confirmation via ConfirmModal.
// Start and Resume are disabled with explanatory tooltips (501 on server).

import React, { useState } from 'react'
import { ConfirmModal } from '@/components/primitives/ConfirmModal'

interface AutoControlsProps {
  active: boolean
  paused: boolean
  onPause: () => void
  onStop: () => void
  isPending: boolean
}

const baseBtn = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors leading-none'
const primaryBtn = `${baseBtn} bg-accent hover:bg-accent/90 text-white`
const destructiveBtn = `${baseBtn} bg-red-600 hover:bg-red-700 text-white`
const disabledBtn = `${baseBtn} bg-bg-tertiary text-text-tertiary opacity-50 cursor-not-allowed`

export function AutoControls({
  active,
  paused,
  onPause,
  onStop,
  isPending,
}: AutoControlsProps) {
  const [showConfirm, setShowConfirm] = useState(false)

  const handleStopRequest = () => setShowConfirm(true)
  const handleStopConfirm = () => {
    setShowConfirm(false)
    onStop()
  }
  const handleStopCancel = () => setShowConfirm(false)

  return (
    <div className="flex items-center gap-2">
      {active && !paused && (
        <>
          <button
            type="button"
            onClick={onPause}
            disabled={isPending}
            className={isPending ? disabledBtn : primaryBtn}
          >
            Pause
          </button>
          <button
            type="button"
            onClick={handleStopRequest}
            disabled={isPending}
            className={isPending ? disabledBtn : destructiveBtn}
          >
            Stop
          </button>
        </>
      )}

      {paused && (
        <>
          <button
            type="button"
            disabled
            title="Use GSD CLI to resume"
            className={disabledBtn}
          >
            Resume
          </button>
          <button
            type="button"
            onClick={handleStopRequest}
            disabled={isPending}
            className={isPending ? disabledBtn : destructiveBtn}
          >
            Stop
          </button>
        </>
      )}

      {!active && !paused && (
        <button
          type="button"
          disabled
          title="Use GSD CLI to start auto-mode"
          className={disabledBtn}
        >
          Start Auto
        </button>
      )}

      <ConfirmModal
        open={showConfirm}
        onConfirm={handleStopConfirm}
        onCancel={handleStopCancel}
        title="Stop Auto Mode?"
        body="This will stop the current auto-mode session. Any in-progress unit will complete before stopping."
        confirmLabel="Stop"
        variant="danger"
      />
    </div>
  )
}
