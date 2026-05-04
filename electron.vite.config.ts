import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const mainExternals = ['node-pty', 'pidtree']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts'),
        external: mainExternals,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
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
