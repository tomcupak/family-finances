import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// Unhashed marker file the running app polls (with cache: 'no-store') to detect that a
// newer build was deployed, even if index.html/assets are stuck in a browser or proxy cache.
const buildVersion = String(Date.now())

function emitBuildVersion(): Plugin {
  return {
    name: 'emit-build-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: buildVersion }),
      })
    },
  }
}

export default defineConfig({
  root: 'apps/family-finances',
  publicDir: 'public',
  server: {
    port: 5173,
  },
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [react(), tsconfigPaths({ root: '../../' }), emitBuildVersion()],
  build: {
    outDir: '../../dist/family-finances',
    emptyOutDir: true,
  },
})
