import { useEffect, useRef, useState } from 'react'
import { getPanelRegistry, type PanelEntry } from '../registries/panels'
import type { PanelSpec } from '../ctx-types'

/**
 * Renders all extension-contributed panels at a given location into a
 * column.
 *
 * The host gives each panel a bare `<div>` and steps out of the way — no
 * collapsible header, no border, no padding. Plugins are responsible for
 * their own chrome (titles, toggles, settings buttons), the same way the
 * legacy core Git Panel rendered itself. This keeps plugin UI visually
 * indistinguishable from a built-in panel.
 *
 * If a plugin sets `initialCollapsed` we hide the host div by default; the
 * plugin can flip visibility by re-mounting itself or using
 * `ctx.panels.show(id)`.
 */

interface PluginPanelSlotProps {
  location: PanelSpec['location']
}

export function PluginPanelSlot({ location }: PluginPanelSlotProps) {
  const reg = getPanelRegistry()
  const [panels, setPanels] = useState<PanelEntry[]>(() => reg.list(location))

  useEffect(() => {
    return reg.subscribe(() => setPanels(reg.list(location))).dispose
  }, [reg, location])

  if (panels.length === 0) return null

  return (
    <>
      {panels.map((panel) => (
        <PanelMount key={`${panel.source}:${panel.id}`} panel={panel} />
      ))}
    </>
  )
}

interface PanelMountProps {
  panel: PanelEntry
}

function PanelMount({ panel }: PanelMountProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hidden] = useState(panel.initialCollapsed ?? false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || hidden) return
    const host = document.createElement('div')
    host.className = 'ext-panel'
    host.dataset.extPanel = panel.id
    host.dataset.extSource = panel.source
    container.appendChild(host)
    let cleanup: void | (() => void) = undefined
    try {
      cleanup = panel.render(host, {
        host,
        width: host.clientWidth,
        height: host.clientHeight,
        visible: true,
        onResize: () => ({ dispose: () => {} }),
        onVisibilityChange: () => ({ dispose: () => {} }),
      })
    } catch (err) {
      console.error(`[ext panel "${panel.id}"]`, err)
    }
    return () => {
      if (typeof cleanup === 'function') {
        try {
          cleanup()
        } catch {
          /* ignore */
        }
      }
      if (host.parentNode === container) {
        container.removeChild(host)
      }
    }
  }, [panel, hidden])

  if (hidden) return null

  return <div ref={containerRef} className="ext-panel-container" />
}
