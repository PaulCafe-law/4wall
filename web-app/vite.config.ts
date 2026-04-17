import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const configRoot = fileURLToPath(new URL('.', import.meta.url))
const buildRoot = realpathSync(configRoot)

export default defineConfig(({ mode }) => {
  const isVitest = mode === 'test'

  return {
    root: isVitest ? configRoot : buildRoot,
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      exclude: ['tests/e2e/**', 'node_modules/**'],
    },
  }
})
