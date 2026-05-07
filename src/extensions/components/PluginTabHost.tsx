import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { getTabTypeRegistry } from '../registries/tab-types'
import type { TabInstance } from '../ctx-types'

export interface GridPlacement {
  colStart: number
  rowStart: number
  colSpan: number
}

interface Props {
  tabId: number
  customType: string
  customProps?: unknown
  active: boolean
  gridSlot?: number | null
  gridSpanRows?: boolean
  gridPlacement?: GridPlacement | null
  isDropTarget?: boolean
  isDragging?: boolean
  toolbar?: ReactNode
}

export function PluginTabHost({
  tabId,
  customType,
  customProps,
  active,
  gridSlot,
  gridSpanRows,
  gridPlacement,
  isDropTarget,
  isDragging,
  toolbar,
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<TabInstance | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const reg = getTabTypeRegistry()
    const findAndMount = (): boolean => {
      const entry = reg.get(customType)
      if (!entry) return false
      let inst: TabInstance | null = null
      try {
        inst = entry.factory({
          tabId,
          active,
          props: customProps,
          ctx: undefined as never,
        })
        inst.mount(host)
        instanceRef.current = inst
      } catch (err) {
        console.error(`[ext tabType "${customType}"] factory failed:`, err)
      }
      return Boolean(inst)
    }

    if (findAndMount()) {
      setMissing(false)
      return () => {
        try {
          instanceRef.current?.unmount()
        } catch {
          /* ignore */
        }
        instanceRef.current = null
        while (host.firstChild) host.removeChild(host.firstChild)
      }
    }

    setMissing(true)
    const off = reg.subscribe(() => {
      if (!instanceRef.current && findAndMount()) {
        setMissing(false)
      }
    })
    return () => {
      off.dispose()
      try {
        instanceRef.current?.unmount()
      } catch {
        /* ignore */
      }
      instanceRef.current = null
      if (host) while (host.firstChild) host.removeChild(host.firstChild)
    }
  }, [tabId, customType, customProps, active])

  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    if (active) inst.onFocus?.()
    else inst.onBlur?.()
  }, [active])

  const inGrid = Boolean(gridPlacement) || gridSlot != null
  let cellStyle: CSSProperties | undefined
  if (inGrid) {
    if (gridPlacement) {
      cellStyle = {
        gridColumn: `${gridPlacement.colStart} / span ${gridPlacement.colSpan}`,
        gridRow: `${gridPlacement.rowStart}`,
      }
    } else if (gridSlot != null) {
      cellStyle = {
        order: gridSlot,
        ...(gridSpanRows ? { gridRow: 'span 2' } : {}),
      }
    }
  }

  const cellCls = [
    'term-pane-cell',
    active ? '' : 'hidden',
    inGrid ? 'in-grid' : '',
    inGrid && toolbar ? 'with-header' : '',
    isDropTarget ? 'drop-target' : '',
    isDragging ? 'drag-source' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cellCls} style={cellStyle} data-tab-id={tabId} data-custom-type={customType}>
      {toolbar}
      <div ref={hostRef} className="term-pane-host plugin-tab-host" role="region">
        {missing && (
          <div className="plugin-tab-missing">
            extension for tab type “{customType}” not loaded
          </div>
        )}
      </div>
    </div>
  )
}
