import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let tmpRoot: string

vi.mock('../../electron/main/extensions/locations', () => ({
  disabledFilePath: () => path.join(tmpRoot, 'disabled.json'),
}))

import { DisabledStore } from '../../electron/main/extensions/disabled-store'

describe('DisabledStore', () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-disabled-'))
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('returns false for unknown id with no file present', async () => {
    const store = new DisabledStore()
    expect(await store.isDisabled('foo')).toBe(false)
  })

  it('persists disabled flag across instances', async () => {
    const a = new DisabledStore()
    await a.setDisabled('foo', true)
    const b = new DisabledStore()
    expect(await b.isDisabled('foo')).toBe(true)
  })

  it('clears flag and removes id from list', async () => {
    const store = new DisabledStore()
    await store.setDisabled('foo', true)
    await store.setDisabled('foo', false)
    const fresh = new DisabledStore()
    expect(await fresh.isDisabled('foo')).toBe(false)
    expect(await fresh.list()).toEqual({})
  })

  it('ignores invalid file shape and starts fresh', async () => {
    await fs.writeFile(path.join(tmpRoot, 'disabled.json'), 'not json', 'utf-8')
    const store = new DisabledStore()
    expect(await store.isDisabled('foo')).toBe(false)
    await store.setDisabled('foo', true)
    const reloaded = new DisabledStore()
    expect(await reloaded.isDisabled('foo')).toBe(true)
  })
})
