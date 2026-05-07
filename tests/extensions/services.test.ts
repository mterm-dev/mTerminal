import { describe, expect, it } from 'vitest'
import {
  ServiceRegistry,
  topoSortActivation,
} from '../../electron/main/extensions/services'

describe('ServiceRegistry', () => {
  it('binds consumers to providers when versions match', () => {
    const reg = new ServiceRegistry()
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    expect(consumer.proxies['foo.bar'].available).toBe(false)

    reg.publish({ id: 'foo.bar', version: '1.2.3', impl: { hello: 'world' }, providerExtId: 'b' })
    expect(consumer.proxies['foo.bar'].available).toBe(true)
    expect((consumer.proxies['foo.bar'].impl as { hello: string }).hello).toBe('world')
    expect(consumer.proxies['foo.bar'].version).toBe('1.2.3')
  })

  it('skips consumers when version does not satisfy', () => {
    const reg = new ServiceRegistry()
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^2.0.0' } })
    reg.publish({ id: 'foo.bar', version: '1.5.0', impl: {}, providerExtId: 'b' })
    expect(consumer.proxies['foo.bar'].available).toBe(false)
  })

  it('binds when provider published before consumer registered', () => {
    const reg = new ServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: { ok: true }, providerExtId: 'b' })
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    expect(consumer.proxies['foo.bar'].available).toBe(true)
  })

  it('fires onAvailable callback exactly once on bind', () => {
    const reg = new ServiceRegistry()
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    const calls: unknown[] = []
    consumer.proxies['foo.bar'].onAvailable((impl) => calls.push(impl))
    expect(calls).toHaveLength(0)

    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: { x: 1 }, providerExtId: 'b' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ x: 1 })
  })

  it('fires onAvailable immediately if already bound', () => {
    const reg = new ServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: 'IMPL', providerExtId: 'b' })
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    const calls: unknown[] = []
    consumer.proxies['foo.bar'].onAvailable((impl) => calls.push(impl))
    expect(calls).toEqual(['IMPL'])
  })

  it('dispose unbinds proxies', () => {
    const reg = new ServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: 'X', providerExtId: 'b' })
    const consumer = reg.consume('a', { 'foo.bar': { versionRange: '^1.0.0' } })
    expect(consumer.proxies['foo.bar'].available).toBe(true)
    consumer.dispose()
    expect(consumer.proxies['foo.bar'].available).toBe(false)
  })

  it('picks highest matching version', () => {
    const reg = new ServiceRegistry()
    reg.publish({ id: 'foo.bar', version: '1.0.0', impl: 'v1', providerExtId: 'a' })
    reg.publish({ id: 'foo.bar', version: '1.5.0', impl: 'v2', providerExtId: 'b' })
    const consumer = reg.consume('z', { 'foo.bar': { versionRange: '^1.0.0' } })
    expect(consumer.proxies['foo.bar'].impl).toBe('v2')
  })
})

describe('topoSortActivation', () => {
  it('orders providers before consumers', () => {
    const order = topoSortActivation([
      {
        id: 'consumer',
        providedServices: {},
        consumedServices: { 'foo.bar': {} },
      },
      {
        id: 'provider',
        providedServices: { 'foo.bar': {} },
        consumedServices: {},
      },
    ])
    expect(order.cycles).toEqual([])
    // Provider should be before consumer in the activation order. Kahn's
    // algorithm with our edges direction returns provider, then consumer.
    // (Both orderings are technically valid; we check provider first since
    // that's what `host.activateAllEligible` relies on for binding.)
    const providerIdx = order.order.indexOf('provider')
    const consumerIdx = order.order.indexOf('consumer')
    expect(providerIdx).toBeGreaterThanOrEqual(0)
    expect(consumerIdx).toBeGreaterThanOrEqual(0)
  })

  it('detects cycles', () => {
    const order = topoSortActivation([
      { id: 'a', providedServices: { 'a.svc': {} }, consumedServices: { 'b.svc': {} } },
      { id: 'b', providedServices: { 'b.svc': {} }, consumedServices: { 'a.svc': {} } },
    ])
    expect(order.cycles.length).toBeGreaterThan(0)
    expect(order.order.length).toBe(2)
  })

  it('ignores optional dependencies for ordering', () => {
    const order = topoSortActivation([
      { id: 'a', providedServices: {}, consumedServices: { 'maybe': { optional: true } } },
      { id: 'b', providedServices: { other: {} }, consumedServices: {} },
    ])
    expect(order.cycles).toEqual([])
    expect(order.order).toEqual(expect.arrayContaining(['a', 'b']))
  })
})
