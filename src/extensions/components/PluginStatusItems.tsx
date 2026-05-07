import { useEffect, useState, type CSSProperties } from 'react'
import { getStatusBarRegistry, type StatusBarEntry } from '../registries/status-bar'

/**
 * Renders extension-contributed status bar items. Mounted twice in the core
 * StatusBar — once for align='left' and once for align='right'.
 */

const itemBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 8px',
  fontSize: 11,
  height: '100%',
  cursor: 'pointer',
  color: 'inherit',
  background: 'transparent',
  border: 'none',
}

interface PluginStatusItemsProps {
  align: 'left' | 'right'
}

export function PluginStatusItems({ align }: PluginStatusItemsProps) {
  const reg = getStatusBarRegistry()
  const [items, setItems] = useState<StatusBarEntry[]>(() => reg.list().filter((i) => i.align === align))

  useEffect(() => {
    return reg.subscribe(() => {
      setItems(reg.list().filter((i) => i.align === align))
    }).dispose
  }, [reg, align])

  return (
    <>
      {items.map((item) => (
        <button
          key={`${item.source}:${item.id}`}
          type="button"
          style={itemBase}
          onClick={item.onClick}
          title={item.tooltip}
          data-ext-status-item={item.id}
        >
          {item.icon && <span aria-hidden>{item.icon}</span>}
          <span>{item.resolvedText}</span>
        </button>
      ))}
    </>
  )
}
