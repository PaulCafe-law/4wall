import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // `index.html` is the platform SPA; `official.html` is the standalone
      // www.4wall.io entry that scripts/prerender-official.mjs fills in.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        official: fileURLToPath(new URL('./official.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
