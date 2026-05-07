import { describe, expect, it } from 'vitest'
import { RendererServiceRegistry } from '../../src/extensions/services'

describe('RendererServiceRegistry', () => {
  it('mirrors main-side semver matching', () => {
    const reg = new RendererServiceRegistry()
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    reg.publish({ id: 'foo.bar', version: '1.5.0', impl: { ok: 1 }, providerExtId: 'b' })
    expect(consumer.proxies['foo.bar'].available).toBe(true)
    expect(consumer.proxies['foo.bar'].version).toBe('1.5.0')
  })

  it('binds previously-published providers when consumer registers later', () => {
    const reg = new RendererServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: 'IMPL', providerExtId: 'p' })
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    expect(consumer.proxies['foo.bar'].impl).toBe('IMPL')
  })

  it('stays unbound when no provider matches', () => {
    const reg = new RendererServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: 'X', providerExtId: 'p' })
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^2.0.0' } })
    expect(consumer.proxies['foo.bar'].available).toBe(false)
  })

  it('dispose removes consumer and unbinds proxies', () => {
    const reg = new RendererServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: 'X', providerExtId: 'p' })
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    consumer.dispose()
    expect(consumer.proxies['foo.bar'].available).toBe(false)
  })
})
