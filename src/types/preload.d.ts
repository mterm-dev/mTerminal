import type { MtApi } from '../../electron/preload'

declare global {
  interface Window {
    mt: MtApi
  }
}

export {}
