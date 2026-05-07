import { beforeEach, describe, expect, it } from 'vitest'
import { CommandRegistry } from '../../src/extensions/registries/commands'

describe('CommandRegistry', () => {
  let reg: CommandRegistry
  beforeEach(() => {
    reg = new CommandRegistry()
  })

  it('registers and executes a command', async () => {
    reg.register({ id: 'foo.bar', source: 'a', run: () => 42 })
    expect(reg.has('foo.bar')).toBe(true)
    expect(await reg.execute<number>('foo.bar')).toBe(42)
  })

  it('lists with source attribution', () => {
    reg.register({ id: 'foo.a', source: 'plugin1', run: () => undefined })
    reg.register({ id: 'foo.b', source: 'core', run: () => undefined })
    const list = reg.list()
    expect(list).toHaveLength(2)
    expect(list.find((c) => c.id === 'foo.a')?.source).toBe('plugin1')
  })

  it('disposing unregisters', () => {
    const d = reg.register({ id: 'foo.x', source: 'a', run: () => 'old' })
    expect(reg.has('foo.x')).toBe(true)
    d.dispose()
    expect(reg.has('foo.x')).toBe(false)
  })

  it('removeBySource drops all matching', () => {
    reg.register({ id: 'foo.a', source: 'plugin1', run: () => undefined })
    reg.register({ id: 'foo.b', source: 'plugin1', run: () => undefined })
    reg.register({ id: 'foo.c', source: 'plugin2', run: () => undefined })
    reg.removeBySource('plugin1')
    expect(reg.list().map((c) => c.id)).toEqual(['foo.c'])
  })

  it('execute throws for unknown command', async () => {
    await expect(reg.execute('nope')).rejects.toThrow(/unknown command/)
  })

  it('replaces an existing command id with a warning', () => {
    reg.register({ id: 'foo.a', source: 'plugin1', run: () => 'old' })
    reg.register({ id: 'foo.a', source: 'plugin2', run: () => 'new' })
    expect(reg.list()).toHaveLength(1)
    expect(reg.list()[0].source).toBe('plugin2')
  })

  it('subscribe fires on register/unregister', () => {
    let calls = 0
    reg.subscribe(() => calls++)
    const d = reg.register({ id: 'foo.a', source: 'a', run: () => undefined })
    expect(calls).toBe(1)
    d.dispose()
    expect(calls).toBe(2)
  })
})
