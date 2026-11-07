import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// PKG=map builds @dzbot/map, PKG=map-react @dzbot/map-react, PKG=browser the script-tag bundle map/dist/dzmap.js (window.dzmap)
const pkg = process.env.PKG === 'map-react' || process.env.PKG === 'browser' ? process.env.PKG : 'map'
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  publicDir: false,
  // Pages that embed the script may not declare UTF-8
  esbuild: { charset: 'ascii' },
  build: {
    outDir: at(pkg === 'map-react' ? 'map-react/dist' : 'map/dist'),
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    minify: pkg === 'browser',
    lib:
      pkg === 'browser'
        ? { entry: at('map/src/browser.ts'), name: 'dzmap', formats: ['iife'], fileName: () => 'dzmap.js' }
        : { entry: at(pkg === 'map' ? 'map/src/index.ts' : 'map-react/src/index.tsx'), formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', '@dzbot/map'] },
  },
})
