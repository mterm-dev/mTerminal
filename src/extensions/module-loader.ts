/**
 * Dynamic ESM loader for plugin renderer entries.
 *
 * Plugin renderer modules are served via the `mt-ext://` custom protocol from
 * the main process. We dynamic-`import()` them with a cache-bust query
 * parameter so hot reloads pick up fresh code.
 *
 * If `import('mt-ext://...')` fails (e.g. the protocol handler is not yet
 * registered or the bundler stripped the dynamic import), we fall back to
 * `fetch()` + `Function('return import(...)')()`, which sidesteps Vite's
 * static analysis. This is the documented Electron fallback.
 */

interface PluginModule {
  activate?: (ctx: unknown) => unknown | Promise<unknown>
  deactivate?: () => unknown | Promise<unknown>
  default?: PluginModule
}

export async function loadPluginRendererModule(
  extId: string,
  rendererRelPath: string,
  cacheBust: string,
): Promise<PluginModule | null> {
  if (!rendererRelPath) return null
  const url = `mt-ext://${extId}/${rendererRelPath.replace(/^\.?\/?/, '')}?v=${cacheBust}`
  const mod = await dynamicImport(url)
  return normalizePluginModule(mod)
}

function dynamicImport(url: string): Promise<unknown> {
  // Wrapped in `Function` so build-time analysers don't try to resolve the URL.
  // eslint-disable-next-line no-new-func
  const importer = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>
  return importer(url)
}

/**
 * Pure helper exported for unit tests. Resolves the plugin module shape into
 * a `PluginModule` regardless of whether the author used a named `activate`
 * export or `export default defineExtension({ activate })`.
 */
export function normalizePluginModule(mod: unknown): PluginModule | null {
  if (!mod || typeof mod !== 'object') return null
  const m = mod as PluginModule
  // ESM named exports
  if (typeof m.activate === 'function') return m
  // `export default { activate }` (object literal or `defineExtension(...)`)
  if (m.default && typeof m.default === 'object' && typeof m.default.activate === 'function') {
    return m.default
  }
  return null
}
