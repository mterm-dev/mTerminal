// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { basename } from '../../src/hooks/useWorkspace'

describe('basename', () => {
  it('returns empty string for empty input', () => {
    expect(basename('')).toBe('')
  })

  it("returns '/' for root", () => {
    expect(basename('/')).toBe('/')
  })

  it('returns last segment of an absolute path', () => {
    expect(basename('/home/user')).toBe('user')
  })

  it('ignores trailing slashes', () => {
    expect(basename('/home/user/')).toBe('user')
  })

  it('returns last segment of a relative path', () => {
    expect(basename('foo/bar')).toBe('bar')
  })

  it('returns single-segment input as-is', () => {
    expect(basename('singlepart')).toBe('singlepart')
  })

  it("collapses to '~' when path equals __MT_HOME", () => {
    ;(window as unknown as { __MT_HOME?: string }).__MT_HOME = '/home/u'
    try {
      expect(basename('/home/u')).toBe('~')
    } finally {
      delete (window as unknown as { __MT_HOME?: string }).__MT_HOME
    }
  })

  it("does not collapse subpaths under __MT_HOME to '~'", () => {
    ;(window as unknown as { __MT_HOME?: string }).__MT_HOME = '/home/u'
    try {
      expect(basename('/home/u/x')).toBe('x')
    } finally {
      delete (window as unknown as { __MT_HOME?: string }).__MT_HOME
    }
  })

  it('returns last segment of a Windows drive path', () => {
    expect(basename('C:\\Users\\alice')).toBe('alice')
  })

  it('handles trailing backslashes on Windows paths', () => {
    expect(basename('C:\\Users\\alice\\')).toBe('alice')
  })

  it('handles forward slashes mixed into Windows paths', () => {
    expect(basename('C:\\Users/alice/Documents')).toBe('Documents')
  })

  it("returns drive root as 'C:' style", () => {
    expect(basename('C:\\')).toBe('C:')
  })

  it('returns last segment of a UNC WSL path', () => {
    expect(basename('\\\\wsl$\\Ubuntu\\home\\alice')).toBe('alice')
  })

  it("collapses Windows __MT_HOME case-insensitively to '~'", () => {
    ;(window as unknown as { __MT_HOME?: string }).__MT_HOME = 'C:\\Users\\alice'
    try {
      expect(basename('c:\\users\\alice')).toBe('~')
      expect(basename('C:\\Users\\alice')).toBe('~')
    } finally {
      delete (window as unknown as { __MT_HOME?: string }).__MT_HOME
    }
  })
})
