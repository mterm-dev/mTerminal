// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import {
  parseHotkey,
  matchHotkey,
  formatHotkey,
  specFromKeyboardEvent,
} from '../../src/lib/hotkey'

afterEach(() => {
  delete (window as { mt?: unknown }).mt
})

describe('parseHotkey meta', () => {
  it('parses cmd+t with meta=true', () => {
    const spec = parseHotkey('cmd+t')
    expect(spec).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
      key: 't',
    })
  })

  it('parses meta+shift+p', () => {
    const spec = parseHotkey('meta+shift+p')
    expect(spec?.meta).toBe(true)
    expect(spec?.shift).toBe(true)
    expect(spec?.key).toBe('p')
  })

  it('parses ctrl+t still works without meta', () => {
    const spec = parseHotkey('ctrl+t')
    expect(spec).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 't',
    })
  })
})

describe('matchHotkey with metaKey', () => {
  it('matches cmd+t when only metaKey is pressed', () => {
    const e = new KeyboardEvent('keydown', {
      key: 't',
      metaKey: true,
      ctrlKey: false,
    })
    expect(matchHotkey(e, 'cmd+t')).toBe(true)
  })

  it('does NOT match cmd+t when only ctrlKey pressed', () => {
    const e = new KeyboardEvent('keydown', {
      key: 't',
      ctrlKey: true,
      metaKey: false,
    })
    expect(matchHotkey(e, 'cmd+t')).toBe(false)
  })

  it('does NOT match ctrl+t when metaKey pressed', () => {
    const e = new KeyboardEvent('keydown', {
      key: 't',
      ctrlKey: false,
      metaKey: true,
    })
    expect(matchHotkey(e, 'ctrl+t')).toBe(false)
  })
})

describe('formatHotkey on macOS', () => {
  it('uses Apple symbols when window.mt.platform is darwin', () => {
    ;(window as { mt: { platform: string } }).mt = { platform: 'darwin' }
    const spec = parseHotkey('cmd+shift+p')
    expect(formatHotkey(spec)).toBe('⇧⌘P')
  })

  it('uses Ctrl/Shift labels on non-mac platforms', () => {
    ;(window as { mt: { platform: string } }).mt = { platform: 'linux' }
    const spec = parseHotkey('ctrl+shift+p')
    expect(formatHotkey(spec)).toBe('Ctrl+Shift+P')
  })
})

describe('specFromKeyboardEvent captures meta', () => {
  it('returns meta=true when event has metaKey', () => {
    const e = new KeyboardEvent('keydown', { key: 'a', metaKey: true })
    const spec = specFromKeyboardEvent(e)
    expect(spec?.meta).toBe(true)
  })
})
