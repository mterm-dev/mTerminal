import { describe, it, expect } from 'vitest'
import { isClaudeName, stripAnsi, classify } from '../../electron/main/claude-code'

describe('isClaudeName', () => {
  it("accepts 'claude'", () => {
    expect(isClaudeName('claude')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isClaudeName('CLAUDE')).toBe(true)
  })

  it("accepts 'claude-code'", () => {
    expect(isClaudeName('claude-code')).toBe(true)
  })

  it("accepts names starting with 'claude-'", () => {
    expect(isClaudeName('claude-1.0')).toBe(true)
  })

  it("strips trailing '.exe'", () => {
    expect(isClaudeName('claude.exe')).toBe(true)
  })

  it('handles mixed case with .EXE suffix', () => {
    expect(isClaudeName('Claude-Code.EXE')).toBe(true)
  })

  it("rejects 'bash'", () => {
    expect(isClaudeName('bash')).toBe(false)
  })

  it("rejects 'claudette' (does not start with 'claude-')", () => {
    expect(isClaudeName('claudette')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isClaudeName('')).toBe(false)
  })

  it('trims whitespace', () => {
    expect(isClaudeName('  claude  ')).toBe(true)
  })
})

describe('stripAnsi', () => {
  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  it('removes simple CSI sequence', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
  })

  it('removes CSI with multiple params', () => {
    expect(stripAnsi('\x1b[1;33;40mhi\x1b[m')).toBe('hi')
  })

  it('removes OSC sequence terminated by BEL', () => {
    expect(stripAnsi('before\x1b]0;title\x07after')).toBe('beforeafter')
  })

  it('removes OSC sequence terminated by ST (ESC + \\)', () => {
    expect(stripAnsi('before\x1b]8;;url\x1b\\link')).toBe('beforelink')
  })

  it('skips one byte after ESC for non-CSI/non-OSC sequences', () => {
    expect(stripAnsi('a\x1bMb')).toBe('ab')
  })

  it('removes adjacent CSI sequences', () => {
    expect(stripAnsi('\x1b[1m\x1b[2mhi')).toBe('hi')
  })

  it('drops a truncated CSI at end of string without error', () => {
    expect(() => stripAnsi('text\x1b[')).not.toThrow()
    expect(stripAnsi('text\x1b[')).toBe('text')
  })
})

describe('classify', () => {
  it("returns 'awaitingInput' for 'do you want'", () => {
    expect(classify('do you want to continue?')).toBe('awaitingInput')
  })

  it("returns 'awaitingInput' for 'PRESS ENTER' (case-insensitive)", () => {
    expect(classify('PRESS ENTER to continue')).toBe('awaitingInput')
  })

  it("returns 'awaitingInput' for '(y/n)'", () => {
    expect(classify('confirm (y/n)')).toBe('awaitingInput')
  })

  it("returns 'thinking' for 'esc to interrupt'", () => {
    expect(classify('esc to interrupt')).toBe('thinking')
  })

  it("returns 'thinking' for 'thinking…'", () => {
    expect(classify('thinking…')).toBe('thinking')
  })

  it('returns null for empty string', () => {
    expect(classify('')).toBe(null)
  })

  it('returns null when no markers are present', () => {
    expect(classify('just some plain output here')).toBe(null)
  })

  it('detects markers wrapped in ANSI escapes', () => {
    expect(classify('\x1b[31mdo you want\x1b[0m')).toBe('awaitingInput')
  })

  it('prefers awaitingInput over thinking when both present', () => {
    expect(classify('thinking… do you want to continue?')).toBe('awaitingInput')
  })
})
