type Props = {
  text: string
}

/**
 * Styled display of the user's prompt with amber accent border.
 * Plain text only — no markdown rendering (user prompts are simple text).
 */
export function UserBlock({ text }: Props) {
  return (
    <div className="rounded-[8px] border-l-2 border-accent/60 bg-bg-secondary/30 px-5 py-4">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-text-tertiary">
        You
      </span>
      <p className="m-0 text-[15px] leading-7 text-text-primary" style={{ textWrap: 'pretty' }}>
        {text}
      </p>
    </div>
  )
}
