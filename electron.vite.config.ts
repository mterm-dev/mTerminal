import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'

const mainExternals = ['electron', 'node-pty']
const preloadExternals = ['electron']

const agentResources = ['mterminal-bridge.cjs', 'mterminal-mcp.cjs']

function copyAgentBridgeResources() {
  return {
    name: 'mterminal-copy-agent-bridge-resources',
    closeBundle() {
      const target = resolve(__dirname, 'out/main/resources/agent-bridge')
      mkdirSync(target, { recursive: true })
      for (const f of agentResources) {
        const src = resolve(__dirname, 'electron/main/agents/resources', f)
        copyFileSync(src, resolve(target, f))
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] }), copyAgentBridgeResources()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
          'kdf-worker': resolve(__dirname, 'electron/main/kdf-worker.ts'),
        },
        external: mainExternals,
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash][extname]',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
        external: preloadExternals,
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash][extname]',
        },
      },
    },
  },
  renderer: {
    root: __dirname,
    base: './',
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: '127.0.0.1',
    },
    envPrefix: ['VITE_', 'MT_'],
    build: {
      outDir: 'out/renderer',
      target: 'esnext',
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
})
