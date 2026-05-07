import { describe, expect, it } from 'vitest'
import { normalizePluginModule } from '../../src/extensions/module-loader'

describe('normalizePluginModule', () => {
  it('accepts named ESM exports', () => {
    const mod = { activate: () => {}, deactivate: () => {} }
    const out = normalizePluginModule(mod)
    expect(out).toBe(mod)
    expect(typeof out?.activate).toBe('function')
  })

  it('accepts `export default { activate }` shape', () => {
    const inner = { activate: () => {} }
    const mod = { default: inner }
    const out = normalizePluginModule(mod)
    expect(out).toBe(inner)
  })

  it('accepts `export default defineExtension({ activate })` shape', () => {
    // defineExtension is a typed identity, so the runtime shape is the same.
    const inner = { activate: () => 'hello' }
    const mod = { default: inner }
    const out = normalizePluginModule(mod)
    expect(out).toBe(inner)
  })

  it('prefers named export over default when both are present', () => {
    const named = { activate: () => 'named' }
    const def = { activate: () => 'default' }
    const out = normalizePluginModule({ activate: named.activate, default: def })
    // `out` matches the wrapper, with `activate` referencing `named.activate`.
    expect(out?.activate).toBe(named.activate)
  })

  it('returns null when no activate function is found', () => {
    expect(normalizePluginModule({})).toBe(null)
    expect(normalizePluginModule({ default: {} })).toBe(null)
    expect(normalizePluginModule({ default: { foo: () => {} } })).toBe(null)
  })

  it('returns null for non-object values', () => {
    expect(normalizePluginModule(null)).toBe(null)
    expect(normalizePluginModule(undefined)).toBe(null)
    expect(normalizePluginModule('module')).toBe(null)
    expect(normalizePluginModule(42)).toBe(null)
  })
})
