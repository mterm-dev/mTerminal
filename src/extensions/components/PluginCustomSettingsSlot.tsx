import { useEffect, useRef, useState } from 'react'
import {
  getSettingsRendererRegistry,
  type SettingsRendererEntry,
} from '../registries/settings-renderer'
import { getSettingsBackend } from '../settings-namespace'

/**
 * Mounts the custom settings renderer for a single extension into the
 * Settings → Extensions → <ext> card.
 *
 * The host hands the plugin a bare `<div class="ext-custom-settings">`,
 * passes a settings bridge scoped to `extId`, and calls the cleanup the
 * plugin returned when the slot unmounts (extension navigation, settings
 * close, plugin deactivation).
 *
 * Mirrors `PluginPanelSlot.tsx` 1:1 — the only difference is keying by
 * `extId` instead of `panel.id`.
 */

interface PluginCustomSettingsSlotProps {
  extId: string
}

export function PluginCustomSettingsSlot({ extId }: PluginCustomSettingsSlotProps) {
  const reg = getSettingsRendererRegistry()
  const [entry, setEntry] = useState<SettingsRendererEntry | undefined>(() => reg.get(extId))

  useEffect(() => {
    setEntry(reg.get(extId))
    return reg.subscribe(() => setEntry(reg.get(extId))).dispose
  }, [reg, extId])

  if (!entry) return null
  return <CustomSettingsMount entry={entry} />
}

interface CustomSettingsMountProps {
  entry: SettingsRendererEntry
}

function CustomSettingsMount({ entry }: CustomSettingsMountProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const host = document.createElement('div')
    host.className = 'ext-custom-settings'
    host.dataset.extSettings = entry.extId
    host.dataset.extSource = entry.source
    container.appendChild(host)

    const backend = getSettingsBackend()
    const settingsBridge = {
      get<T = unknown>(key: string): T | undefined {
        return backend.read(entry.extId, key) as T | undefined
      },
      set(key: string, value: unknown) {
        return backend.write(entry.extId, key, value)
      },
      onChange(cb: (key: string, value: unknown) => void) {
        return backend.onChange(entry.extId, cb)
      },
    }

    let cleanup: void | (() => void) = undefined
    try {
      cleanup = entry.render(host, {
        host,
        extId: entry.extId,
        settings: settingsBridge,
      })
    } catch (err) {
      console.error(`[ext settingsRenderer "${entry.extId}"]`, err)
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
  }, [entry])

  return <div ref={containerRef} className="ext-custom-settings-container" />
}
