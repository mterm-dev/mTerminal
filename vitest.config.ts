import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'tests/mocks/electron.ts'),
    },
  },
  test: {
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'extensions/*/tests/**/*.test.ts',
    ],
    environmentMatchGlobs: [
      ['tests/renderer/**', 'jsdom'],
    ],
    globals: false,
    reporters: ['default'],
  },
})
