import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const configRoot = fileURLToPath(new URL('.', import.meta.url))
const realRoot = realpathSync(configRoot)

export default defineConfig({
  root: configRoot,
  plugins: [react()],
  server: {
    fs: {
      allow: [configRoot, realRoot],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15_000,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
