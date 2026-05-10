interface Props {
  message?: string
  onRetry?: () => void
}

export function OfflineEmpty({ message, onRetry }: Props) {
  return (
    <div className="ext-mkt-state">
      <div className="ext-mkt-state-title">Marketplace unavailable</div>
      {message && <div className="ext-mkt-state-sub">{message}</div>}
      {onRetry && (
        <button type="button" className="st-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
