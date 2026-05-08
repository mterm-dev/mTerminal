/**
 * Renderer-side bootstrap for the extension system.
 *
 * Call `bootExtensionsHostRenderer()` once early in `App.tsx`'s mount, after
 * settings have been loaded (so the settings backend is wired up before
 * plugins try to read from it).
 *
 * Public re-exports cover the registries and stores that core code needs to
 * hook into for rendering: panels, status bar items, command palette, theme
 * list, plugin manager UI, trust modal, settings schema.
 */

export { getRendererHost } from './host-renderer'
export type { ManifestSnapshot, ManifestRecord, ExtensionHostRenderer } from './host-renderer'

export { getCommandRegistry } from './registries/commands'
export { getKeybindingRegistry, setKeybindingWhenEvaluator } from './registries/keybindings'
export { getPanelRegistry } from './registries/panels'
export { getStatusBarRegistry } from './registries/status-bar'
export { getContextMenuRegistry } from './registries/context-menu'
export { getTabTypeRegistry } from './registries/tab-types'
export { getDecoratorRegistry } from './registries/decorators'
export { getThemeRegistry } from './registries/themes'
export { getSettingsSchemaRegistry } from './registries/settings-schema'
export { getAiProviderRegistry } from './registries/providers-ai'

export { getRendererEventBus } from './event-bus'
export { getServiceRegistry } from './services'
export { getTrustQueue } from './trust-flow'
export type { TrustRequest } from './trust-flow'
export { getUiStore } from './api-bridge/ui'
export type { ToastSpec } from './api-bridge/ui'
export { getTerminalRegistry } from './api-bridge/terminal'
export type { TerminalAdapter, SpawnHandler } from './api-bridge/terminal'
export { setSettingsBackend, getSettingsBackend } from './settings-namespace'
export type { SettingsBackend } from './settings-namespace'
export { setWorkspaceBackend, getWorkspaceBackend } from './api-bridge/workspace'
export type { WorkspaceBackend, WorkspaceTab } from './api-bridge/workspace'

import { getRendererHost } from './host-renderer'
import { seedBuiltinAiProviders } from './builtins/ai-providers'

/**
 * Boot the extension host. Idempotent — safe to call multiple times; only
 * the first call does work.
 */
let bootPromise: Promise<void> | null = null
export function bootExtensionsHostRenderer(): Promise<void> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    seedBuiltinAiProviders()
    const host = getRendererHost()
    await host.boot()
  })()
  return bootPromise
}
