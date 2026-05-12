import { describe, expect, it } from 'vitest'
import { detectNativeDeps } from '../../../electron/main/marketplace/installer'

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('detectNativeDeps', () => {
  it('returns false for a pure-JS package', () => {
    const entries = {
      'package.json': bytes('{}'),
      'dist/main.js': bytes('module.exports={}'),
    }
    const manifest = { dependencies: { lodash: '^4' } }
    expect(detectNativeDeps(entries, manifest)).toBe(false)
  })

  it('detects binding.gyp at the package root', () => {
    const entries = {
      'binding.gyp': bytes(''),
      'package.json': bytes('{}'),
    }
    expect(detectNativeDeps(entries, {})).toBe(true)
  })

  it('detects binding.gyp in a subdirectory', () => {
    const entries = {
      'package.json': bytes('{}'),
      'native/binding.gyp': bytes(''),
    }
    expect(detectNativeDeps(entries, {})).toBe(true)
  })

  it('detects compiled .node addons', () => {
    const entries = {
      'package.json': bytes('{}'),
      'build/Release/addon.node': bytes(''),
    }
    expect(detectNativeDeps(entries, {})).toBe(true)
  })

  it('detects known native dependencies in manifest', () => {
    expect(detectNativeDeps({ 'package.json': bytes('{}') }, { dependencies: { 'node-pty': '^1' } })).toBe(true)
    expect(detectNativeDeps({ 'package.json': bytes('{}') }, { dependencies: { 'better-sqlite3': '^11' } })).toBe(true)
    expect(detectNativeDeps({ 'package.json': bytes('{}') }, { dependencies: { keytar: '^7' } })).toBe(true)
  })

  it('honors the mterminal.requiresRestart manifest flag', () => {
    expect(detectNativeDeps({}, { mterminal: { requiresRestart: true } })).toBe(true)
    expect(detectNativeDeps({}, { mterminal: { requiresRestart: false } })).toBe(false)
  })

  it('handles missing/empty manifest gracefully', () => {
    expect(detectNativeDeps({}, null)).toBe(false)
    expect(detectNativeDeps({}, undefined)).toBe(false)
    expect(detectNativeDeps({}, 'not-an-object')).toBe(false)
  })

  it('handles Windows path separators in entries', () => {
    const entries = { 'native\\binding.gyp': bytes('') }
    expect(detectNativeDeps(entries, {})).toBe(true)
  })
})
