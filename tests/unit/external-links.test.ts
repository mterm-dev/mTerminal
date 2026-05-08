import { describe, it, expect } from 'vitest'
import { isExternalUrl } from '../../electron/main/external-links'

describe('isExternalUrl', () => {
  it('returns true for http and https', () => {
    expect(isExternalUrl('http://example.com')).toBe(true)
    expect(isExternalUrl('https://example.com/path?q=1#x')).toBe(true)
  })

  it('returns true for http://localhost (dev URL)', () => {
    expect(isExternalUrl('http://localhost:5173')).toBe(true)
  })

  it('returns true for mailto, tel, ftp', () => {
    expect(isExternalUrl('mailto:foo@bar.com')).toBe(true)
    expect(isExternalUrl('tel:+48123456789')).toBe(true)
    expect(isExternalUrl('ftp://files.example.com')).toBe(true)
    expect(isExternalUrl('sftp://host.example.com')).toBe(true)
  })

  it('returns false for file URLs', () => {
    expect(isExternalUrl('file:///home/x/index.html')).toBe(false)
  })

  it('returns false for custom app schemes', () => {
    expect(isExternalUrl('mt-ext://plugin/icon.png')).toBe(false)
    expect(isExternalUrl('chrome-devtools://devtools/bundled/inspector.html')).toBe(
      false,
    )
  })

  it('returns false for data and blob URLs', () => {
    expect(isExternalUrl('data:text/html,<h1>x</h1>')).toBe(false)
    expect(isExternalUrl('blob:https://example.com/abc-123')).toBe(false)
  })

  it('returns false for javascript: (security)', () => {
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('returns false for empty/invalid input', () => {
    expect(isExternalUrl('')).toBe(false)
    expect(isExternalUrl('not a url')).toBe(false)
    expect(isExternalUrl(undefined)).toBe(false)
    expect(isExternalUrl(null)).toBe(false)
    expect(isExternalUrl(123)).toBe(false)
  })
})
