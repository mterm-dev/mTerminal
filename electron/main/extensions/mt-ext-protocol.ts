import { protocol, net } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { builtInExtensionsDir, userExtensionsDir } from './locations'
import { getExtensionHost } from './host'

/**
 * Custom `mt-ext://` URL scheme used to load plugin renderer code as ESM.
 *
 * URL shape:
 *   mt-ext://<extensionId>/<relativeFilePath>[?v=<bust>]
 *
 * The renderer dynamically `import()`s these URLs to load plugin renderer
 * entries:
 *
 *   import(`mt-ext://${id}/dist/renderer.mjs?v=${activationToken}`)
 *
 * Privileges:
 *   - secure:           treated as HTTPS-equivalent for CSP / mixed-content
 *   - standard:         supports relative URL resolution
 *   - supportFetchAPI:  allows fetch() inside the loaded module
 *   - corsEnabled:      avoids cross-origin headaches
 *
 * The privilege list MUST be registered BEFORE `app.whenReady()` (Electron
 * requirement), so the host exposes that step separately as
 * `registerMtExtProtocolPrivileges()`.
 *
 * Path traversal protection: requested paths are resolved relative to the
 * extension's own directory and rejected if they escape it.
 */

const PROTOCOL_SCHEME = 'mt-ext'
const PROTOCOL_REGISTERED = Symbol.for('mTerminal.mtExtProtocol.registered')
const PRIVILEGES_REGISTERED = Symbol.for('mTerminal.mtExtProtocol.privileges')

export function registerMtExtProtocolPrivileges(): void {
  const g = globalThis as unknown as Record<symbol, boolean>
  if (g[PRIVILEGES_REGISTERED]) return
  g[PRIVILEGES_REGISTERED] = true
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

export function registerMtExtProtocol(): void {
  const g = globalThis as unknown as Record<symbol, boolean>
  if (g[PROTOCOL_REGISTERED]) return
  g[PROTOCOL_REGISTERED] = true

  protocol.handle(PROTOCOL_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // url.host is the extension id (case-insensitive — Electron lowercases).
      const extId = url.hostname
      if (!extId) {
        return new Response('extension id missing', { status: 400 })
      }
      // Strip leading slash in pathname.
      const relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!relPath) {
        return new Response('file path missing', { status: 400 })
      }

      const host = getExtensionHost()
      const rec = host.registry.get(extId)
      if (!rec) {
        return new Response(`unknown extension: ${extId}`, { status: 404 })
      }

      let baseDir: string | null
      if (rec.manifest.source === 'built-in') {
        baseDir = builtInExtensionsDir()
      } else {
        baseDir = userExtensionsDir()
      }
      if (!baseDir) {
        return new Response('extension source unavailable', { status: 404 })
      }
      const extDir = path.resolve(baseDir, extId)
      const target = path.resolve(extDir, relPath)
      // Prevent path traversal: target must be inside extDir.
      const rel = path.relative(extDir, target)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return new Response('path traversal denied', { status: 403 })
      }

      const fileUrl = pathToFileURL(target).toString()
      const response = await net.fetch(fileUrl)
      // Force a JS content-type for ESM modules; Chromium's <script type=module>
      // requires this.
      const headers = new Headers(response.headers)
      const ct = guessContentType(target)
      if (ct) headers.set('Content-Type', ct)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (err) {
      return new Response(
        `mt-ext protocol error: ${(err as Error).message}`,
        { status: 500 },
      )
    }
  })
}

/**
 * Pure helper, exported for unit tests. Maps a file extension to a MIME type
 * suitable for ESM module imports / asset fetches.
 */
export function guessContentType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.woff2':
      return 'font/woff2'
    case '.woff':
      return 'font/woff'
    case '.ttf':
      return 'font/ttf'
    default:
      return null
  }
}

/**
 * Pure helper, exported for unit tests. Resolves a `mt-ext://<id>/<rel>` URL
 * to an absolute path under the extension directory, rejecting traversal.
 */
export function resolveProtocolUrl(
  url: string,
  baseDir: string,
  expectedExtId: string,
): { ok: true; absPath: string } | { ok: false; status: number; message: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, status: 400, message: 'invalid URL' }
  }
  if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) {
    return { ok: false, status: 400, message: 'unexpected scheme' }
  }
  const extId = parsed.hostname
  if (!extId) return { ok: false, status: 400, message: 'extension id missing' }
  if (extId !== expectedExtId) {
    return { ok: false, status: 404, message: `unknown extension: ${extId}` }
  }
  const rel = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!rel) return { ok: false, status: 400, message: 'file path missing' }
  const extDir = path.resolve(baseDir, extId)
  const target = path.resolve(extDir, rel)
  const relCheck = path.relative(extDir, target)
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    return { ok: false, status: 403, message: 'path traversal denied' }
  }
  return { ok: true, absPath: target }
}
