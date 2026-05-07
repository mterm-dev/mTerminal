import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  guessContentType,
  resolveProtocolUrl,
} from '../../electron/main/extensions/mt-ext-protocol'

describe('guessContentType', () => {
  it('returns text/javascript for ESM/CJS extensions', () => {
    expect(guessContentType('/foo/bar.mjs')).toBe('text/javascript; charset=utf-8')
    expect(guessContentType('/foo/bar.cjs')).toBe('text/javascript; charset=utf-8')
    expect(guessContentType('/foo/bar.js')).toBe('text/javascript; charset=utf-8')
  })

  it('returns application/json for .json', () => {
    expect(guessContentType('/foo/theme.json')).toBe('application/json; charset=utf-8')
  })

  it('handles assets', () => {
    expect(guessContentType('/foo/bar.css')).toBe('text/css; charset=utf-8')
    expect(guessContentType('/foo/bar.svg')).toBe('image/svg+xml')
    expect(guessContentType('/foo/bar.png')).toBe('image/png')
    expect(guessContentType('/foo/bar.woff2')).toBe('font/woff2')
  })

  it('returns null for unknown extensions (caller falls back to net.fetch default)', () => {
    expect(guessContentType('/foo/bar.xyz')).toBe(null)
    expect(guessContentType('/foo/Makefile')).toBe(null)
  })

  it('is case-insensitive on the extension', () => {
    expect(guessContentType('/foo/BAR.MJS')).toBe('text/javascript; charset=utf-8')
  })
})

describe('resolveProtocolUrl', () => {
  const baseDir = '/tmp/extensions'

  it('resolves a basic URL', () => {
    const out = resolveProtocolUrl('mt-ext://foo/dist/renderer.mjs', baseDir, 'foo')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.absPath).toBe(path.resolve(baseDir, 'foo/dist/renderer.mjs'))
    }
  })

  it('strips the cache-bust query string when computing the path', () => {
    const out = resolveProtocolUrl('mt-ext://foo/dist/r.mjs?v=12345', baseDir, 'foo')
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.absPath).toBe(path.resolve(baseDir, 'foo/dist/r.mjs'))
  })

  it('rejects a host mismatch', () => {
    const out = resolveProtocolUrl('mt-ext://imposter/x.mjs', baseDir, 'foo')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(404)
  })

  it('normalizes ../ segments at the URL level (final path stays under extDir)', () => {
    // URL parser already collapses `..` segments before we see them, so
    // `mt-ext://foo/../../etc/passwd` resolves to `/etc/passwd`, which under
    // the extension dir becomes `/tmp/extensions/foo/etc/passwd` — still
    // contained. The defense-in-depth path.relative check below catches any
    // bypass we might miss in the future.
    const out = resolveProtocolUrl('mt-ext://foo/../../etc/passwd', baseDir, 'foo')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.absPath.startsWith(path.resolve(baseDir, 'foo'))).toBe(true)
    }
  })

  it('rejects absolute paths embedded in the path component', () => {
    // Pathname starting with `//` (host-relative) — verify we still pin to extDir.
    const out = resolveProtocolUrl('mt-ext://foo//etc/passwd', baseDir, 'foo')
    if (out.ok) {
      expect(out.absPath.startsWith(path.resolve(baseDir, 'foo'))).toBe(true)
    }
  })

  it('rejects empty paths', () => {
    const out = resolveProtocolUrl('mt-ext://foo/', baseDir, 'foo')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
  })

  it('rejects non-mt-ext schemes', () => {
    const out = resolveProtocolUrl('https://foo/bar.mjs', baseDir, 'foo')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
  })

  it('rejects malformed URLs', () => {
    const out = resolveProtocolUrl('not a url', baseDir, 'foo')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
  })
})
