import { describe, it, expect } from 'vitest'
import {
  resolveEndpoint,
  PROD_ENDPOINT,
  DEV_ENDPOINT,
} from '../../../electron/main/marketplace/config'

describe('resolveEndpoint', () => {
  it('falls back to prod when env empty', () => {
    expect(resolveEndpoint({})).toBe(PROD_ENDPOINT)
  })

  it('uses dev endpoint when NODE_ENV=development', () => {
    expect(resolveEndpoint({ NODE_ENV: 'development' })).toBe(DEV_ENDPOINT)
  })

  it('prefers MARKETPLACE_ENDPOINT over NODE_ENV', () => {
    expect(
      resolveEndpoint({
        NODE_ENV: 'development',
        MARKETPLACE_ENDPOINT: 'https://staging.example.com',
      }),
    ).toBe('https://staging.example.com')
  })

  it('strips trailing slashes from MARKETPLACE_ENDPOINT', () => {
    expect(
      resolveEndpoint({ MARKETPLACE_ENDPOINT: 'https://example.com///' }),
    ).toBe('https://example.com')
  })

  it('ignores empty MARKETPLACE_ENDPOINT', () => {
    expect(resolveEndpoint({ MARKETPLACE_ENDPOINT: '' })).toBe(PROD_ENDPOINT)
  })
})
