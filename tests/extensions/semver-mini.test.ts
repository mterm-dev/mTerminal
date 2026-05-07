import { describe, expect, it } from 'vitest'
import { parse, satisfies } from '../../electron/main/extensions/semver-mini'

describe('semver-mini.parse', () => {
  it('parses plain versions', () => {
    expect(parse('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] })
  })
  it('parses prereleases', () => {
    expect(parse('1.0.0-alpha.0')).toEqual({ major: 1, minor: 0, patch: 0, pre: ['alpha', '0'] })
  })
  it('rejects garbage', () => {
    expect(parse('abc')).toBe(null)
    expect(parse('1.2')).toBe(null)
  })
  it('strips build metadata', () => {
    expect(parse('1.2.3+build.5')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] })
  })
})

describe('semver-mini.satisfies — caret', () => {
  it('matches same major', () => {
    expect(satisfies('1.2.3', '^1.0.0')).toBe(true)
    expect(satisfies('1.99.0', '^1.0.0')).toBe(true)
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false)
  })
  it('treats 0.x specially (same minor)', () => {
    expect(satisfies('0.1.5', '^0.1.0')).toBe(true)
    expect(satisfies('0.2.0', '^0.1.0')).toBe(false)
  })
  it('treats 0.0.x specially (same patch)', () => {
    expect(satisfies('0.0.1', '^0.0.1')).toBe(true)
    expect(satisfies('0.0.2', '^0.0.1')).toBe(false)
  })
})

describe('semver-mini.satisfies — tilde', () => {
  it('locks major.minor', () => {
    expect(satisfies('1.2.5', '~1.2.0')).toBe(true)
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false)
  })
})

describe('semver-mini.satisfies — comparators', () => {
  it('handles >=, >, <=, <, =', () => {
    expect(satisfies('1.0.0', '>=1.0.0')).toBe(true)
    expect(satisfies('0.9.9', '>=1.0.0')).toBe(false)
    expect(satisfies('1.0.0', '>1.0.0')).toBe(false)
    expect(satisfies('1.0.1', '>1.0.0')).toBe(true)
    expect(satisfies('1.0.0', '<=1.0.0')).toBe(true)
    expect(satisfies('1.0.1', '<=1.0.0')).toBe(false)
    expect(satisfies('1.0.0', '=1.0.0')).toBe(true)
  })
  it('combines AND ranges', () => {
    expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true)
    expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false)
  })
})

describe('semver-mini.satisfies — wildcard', () => {
  it('* matches anything', () => {
    expect(satisfies('1.2.3', '*')).toBe(true)
    expect(satisfies('99.99.99', '*')).toBe(true)
  })
})

describe('semver-mini.satisfies — prerelease ordering', () => {
  it('1.0.0 ranks above 1.0.0-alpha.0', () => {
    expect(satisfies('1.0.0', '>=1.0.0-alpha.0')).toBe(true)
    expect(satisfies('1.0.0-alpha.0', '>=1.0.0')).toBe(false)
  })
})
