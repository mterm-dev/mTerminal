import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { renderer: 'src/renderer.tsx' },
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  outDir: 'dist',
  target: 'es2022',
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ['@mterminal/extension-api'],
  noExternal: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'scheduler'],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  // We ship .mjs so the renderer imports it via `import('mt-ext://...')` as ESM.
})
