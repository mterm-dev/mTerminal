// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getFileIcon as getFileIconFb } from '../../extensions/file-browser/src/lib/file-icons'
import { getFileIcon as getFileIconGit } from '../../extensions/git-panel/src/lib/file-icons'

describe.each([
  ['file-browser', getFileIconFb],
  ['git-panel', getFileIconGit],
])('getFileIcon (%s)', (_label, getFileIcon) => {
  it('typescript files use blue', () => {
    expect(getFileIcon('foo.ts').color).toBe('var(--c-blue)')
    expect(getFileIcon('bar.tsx').color).toBe('var(--c-blue)')
  })

  it('javascript files use amber', () => {
    expect(getFileIcon('foo.js').color).toBe('var(--c-amber)')
    expect(getFileIcon('bar.mjs').color).toBe('var(--c-amber)')
  })

  it('python uses emerald', () => {
    expect(getFileIcon('script.py').color).toBe('var(--c-emerald)')
  })

  it('Dockerfile (no extension) is recognized', () => {
    const def = getFileIcon('Dockerfile')
    expect(def.color).toBe('var(--c-blue)')
  })

  it('case-insensitive Dockerfile', () => {
    expect(getFileIcon('dockerfile').color).toBe('var(--c-blue)')
  })

  it('.env and .env.local treated as env config', () => {
    expect(getFileIcon('.env').color).toBe('var(--c-emerald)')
    expect(getFileIcon('.env.local').color).toBe('var(--c-emerald)')
  })

  it('lock files override their underlying extension', () => {
    expect(getFileIcon('pnpm-lock.yaml').color).toBe('var(--fg-disabled)')
    expect(getFileIcon('yarn.lock').color).toBe('var(--fg-disabled)')
    expect(getFileIcon('Cargo.lock').color).toBe('var(--fg-disabled)')
  })

  it('package.json maps to amber config', () => {
    expect(getFileIcon('package.json').color).toBe('var(--c-amber)')
  })

  it('unknown extension falls back to dim generic', () => {
    const def = getFileIcon('mystery.xyz')
    expect(def.color).toBe('var(--fg-dim)')
    expect(typeof def.Icon).toBe('function')
  })

  it('no-extension unknown name is generic', () => {
    expect(getFileIcon('SOMEFILE').color).toBe('var(--fg-dim)')
  })

  it('empty string returns generic', () => {
    expect(getFileIcon('').color).toBe('var(--fg-dim)')
  })

  it('css uses violet, json uses amber', () => {
    expect(getFileIcon('app.css').color).toBe('var(--c-violet)')
    expect(getFileIcon('tsconfig.json').color).toBe('var(--c-amber)')
  })

  it('image extensions use pink', () => {
    expect(getFileIcon('cat.png').color).toBe('var(--c-pink)')
    expect(getFileIcon('photo.jpeg').color).toBe('var(--c-pink)')
  })
})
