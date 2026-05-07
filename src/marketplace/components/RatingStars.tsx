import { useState } from 'react'

interface Props {
  value: number
  onChange?: (v: number) => void
  size?: number
}

export function RatingStars({ value, onChange, size = 14 }: Props) {
  const [hover, setHover] = useState(0)
  const interactive = !!onChange
  const display = hover || value
  return (
    <div
      className="mt-rating-stars"
      style={{ display: 'inline-flex', gap: 2 }}
      onMouseLeave={() => interactive && setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onMouseEnter={() => interactive && setHover(n)}
          onClick={() => interactive && onChange!(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{
            width: size,
            height: size,
            background: 'transparent',
            border: 'none',
            cursor: interactive ? 'pointer' : 'default',
            color: n <= display ? 'var(--c-amber, #f7b955)' : 'var(--fg-dim, #888)',
            padding: 0,
            fontSize: size,
            lineHeight: 1,
          }}
        >
          {n <= display ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}
