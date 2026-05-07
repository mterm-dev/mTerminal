interface Props {
  message?: string
  onRetry?: () => void
}

export function OfflineEmpty({ message, onRetry }: Props) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: 'center',
        color: 'var(--fg-dim, #888)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 13 }}>marketplace unavailable</div>
      {message && <div style={{ fontSize: 11 }}>{message}</div>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '4px 12px',
            background: 'var(--surface-2, #222)',
            color: 'var(--fg, #e9e9e9)',
            border: '1px solid var(--border-subtle, #2a2a2a)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          retry
        </button>
      )}
    </div>
  )
}
