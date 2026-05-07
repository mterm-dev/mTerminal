import { describe, expect, it } from 'vitest'
import {
  validateManifest,
  ManifestValidationError,
  parseWhen,
  evaluateWhen,
} from '../../electron/main/extensions/manifest'

describe('validateManifest — happy path', () => {
  const baseExt = '/tmp/extensions/foo'
  const baseSource = 'user' as const

  it('accepts a minimal valid manifest', () => {
    const m = validateManifest(
      {
        name: 'mterminal-plugin-foo',
        version: '1.0.0',
        main: 'dist/main.cjs',
        engines: { 'mterminal-api': '^1.0.0' },
        mterminal: { activationEvents: ['onStartupFinished'] },
      },
      baseExt,
      baseSource,
    )
    expect(m.id).toBe('foo')
    expect(m.packageName).toBe('mterminal-plugin-foo')
    expect(m.version).toBe('1.0.0')
    expect(m.activationEvents).toEqual(['onStartupFinished'])
    expect(m.mainEntry).toBe('/tmp/extensions/foo/dist/main.cjs')
    expect(m.rendererEntry).toBe(null)
    expect(m.apiVersionRange).toBe('^1.0.0')
  })

  it('strips scoped names', () => {
    const m = validateManifest(
      {
        name: '@acme/mterminal-plugin-foo',
        version: '1.0.0',
        renderer: 'r.mjs',
        engines: { 'mterminal-api': '*' },
        mterminal: { activationEvents: [] },
      },
      baseExt,
      baseSource,
    )
    expect(m.id).toBe('foo')
  })

  it('honors explicit id', () => {
    const m = validateManifest(
      {
        name: 'totally-unrelated',
        version: '1.0.0',
        renderer: 'r.mjs',
        mterminal: { id: 'my-id', activationEvents: [] },
      },
      baseExt,
      baseSource,
    )
    expect(m.id).toBe('my-id')
  })

  it('parses contributes', () => {
    const m = validateManifest(
      {
        name: 'mterminal-plugin-x',
        version: '0.1.0',
        renderer: 'r.mjs',
        mterminal: {
          activationEvents: ['onCommand:x.run'],
          contributes: {
            commands: [{ id: 'x.run', title: 'Run' }],
            keybindings: [{ command: 'x.run', key: 'Ctrl+Shift+R' }],
            panels: [{ id: 'x', title: 'X', location: 'sidebar' }],
            statusBar: [{ id: 'x.s', align: 'left' }],
            themes: [{ id: 'x.t', label: 'X', path: 'theme.json' }],
            decorators: [{ id: 'x.d', appliesTo: 'terminal.output' }],
            settings: { type: 'object', properties: { foo: { type: 'string', default: 'bar' } } },
          },
        },
      },
      baseExt,
      baseSource,
    )
    expect(m.contributes.commands).toHaveLength(1)
    expect(m.contributes.keybindings[0].key).toBe('Ctrl+Shift+R')
    expect(m.contributes.panels[0].location).toBe('sidebar')
    expect(m.contributes.themes[0].path).toBe('theme.json')
    expect(m.contributes.decorators[0].appliesTo).toBe('terminal.output')
  })

  it('parses provided/consumed services', () => {
    const m = validateManifest(
      {
        name: 'mterminal-plugin-x',
        version: '0.1.0',
        renderer: 'r.mjs',
        mterminal: {
          activationEvents: [],
          providedServices: { 'foo.bar': { version: '1.0.0' } },
          consumedServices: { 'baz.qux': { versionRange: '^2.0.0', optional: true } },
        },
      },
      baseExt,
      baseSource,
    )
    expect(m.providedServices['foo.bar'].version).toBe('1.0.0')
    expect(m.consumedServices['baz.qux'].optional).toBe(true)
  })
})

describe('validateManifest — failures', () => {
  it('rejects manifest without name', () => {
    expect(() =>
      validateManifest(
        { version: '1.0.0', mterminal: { activationEvents: [] } },
        '/tmp/x',
        'user',
      ),
    ).toThrowError(ManifestValidationError)
  })

  it('rejects manifest with no entry and no declarative contribution', () => {
    expect(() =>
      validateManifest(
        { name: 'foo', version: '1.0.0', mterminal: { activationEvents: [] } },
        '/tmp/x',
        'user',
      ),
    ).toThrowError(/neither "main" nor "renderer".*no declarative contributions/)
  })

  it('accepts a theme-only declarative plugin (no entry)', () => {
    const m = validateManifest(
      {
        name: 'mterminal-plugin-theme-only',
        version: '1.0.0',
        mterminal: {
          activationEvents: [],
          contributes: {
            themes: [{ id: 't', label: 'T', path: 'theme.json' }],
          },
        },
      },
      '/tmp/x',
      'user',
    )
    expect(m.id).toBe('theme-only')
    expect(m.mainEntry).toBe(null)
    expect(m.rendererEntry).toBe(null)
    expect(m.contributes.themes).toHaveLength(1)
  })

  it('rejects unknown activation event prefix', () => {
    expect(() =>
      validateManifest(
        {
          name: 'foo',
          version: '1.0.0',
          renderer: 'r.mjs',
          mterminal: { activationEvents: ['onAlien:something'] },
        },
        '/tmp/x',
        'user',
      ),
    ).toThrowError(/unknown activation event/)
  })

  it('rejects panel with invalid location', () => {
    expect(() =>
      validateManifest(
        {
          name: 'foo',
          version: '1.0.0',
          renderer: 'r.mjs',
          mterminal: {
            activationEvents: [],
            contributes: { panels: [{ id: 'p', title: 'P', location: 'somewhere' }] },
          },
        },
        '/tmp/x',
        'user',
      ),
    ).toThrowError(/invalid location/)
  })
})

describe('parseWhen', () => {
  it('matches bare identifier as boolean', () => {
    expect(parseWhen('foo').evaluate({ foo: true })).toBe(true)
    expect(parseWhen('foo').evaluate({ foo: false })).toBe(false)
    expect(parseWhen('foo').evaluate({})).toBe(false)
  })
  it('handles == and !=', () => {
    expect(parseWhen('view == git-panel').evaluate({ view: 'git-panel' })).toBe(true)
    expect(parseWhen('view == git-panel').evaluate({ view: 'other' })).toBe(false)
    expect(parseWhen('view != git-panel').evaluate({ view: 'other' })).toBe(true)
  })
  it('combines &&, ||, !', () => {
    expect(parseWhen('a && b').evaluate({ a: true, b: true })).toBe(true)
    expect(parseWhen('a && b').evaluate({ a: true, b: false })).toBe(false)
    expect(parseWhen('a || b').evaluate({ a: false, b: true })).toBe(true)
    expect(parseWhen('!a').evaluate({ a: false })).toBe(true)
    expect(parseWhen('!a').evaluate({ a: true })).toBe(false)
  })
  it('respects precedence', () => {
    expect(parseWhen('a || b && c').evaluate({ a: true, b: false, c: false })).toBe(true)
    expect(parseWhen('(a || b) && c').evaluate({ a: true, b: false, c: false })).toBe(false)
  })
  it('reads dotted identifiers', () => {
    expect(parseWhen('tab.kind == "remote"').evaluate({ tab: { kind: 'remote' } })).toBe(true)
  })
  it('handles strings, numbers, booleans', () => {
    expect(parseWhen('count == 3').evaluate({ count: 3 })).toBe(true)
    expect(parseWhen("name == 'foo'").evaluate({ name: 'foo' })).toBe(true)
    expect(parseWhen('open == true').evaluate({ open: true })).toBe(true)
  })
})

describe('evaluateWhen', () => {
  it('returns true for empty/undefined', () => {
    expect(evaluateWhen(undefined, {})).toBe(true)
    expect(evaluateWhen('', {})).toBe(true)
  })
  it('returns false on parse error', () => {
    expect(evaluateWhen('a &&', {})).toBe(false)
  })
})
