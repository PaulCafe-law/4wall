// Regenerates public/official.md and public/llms.txt from officialContent.
// Run after changing website copy: `node scripts/build-official-text.mjs`.
// The prerender step writes the same output into dist/ on every build, and
// OfficialCrawlerFiles.test.ts fails if the committed copies drift.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer as createViteServer } from 'vite'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const vite = await createViteServer({
  root: rootDir,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const text = await vite.ssrLoadModule('/src/features/official/officialText.ts')
  await writeFile(path.join(rootDir, 'public', 'official.md'), text.buildOfficialMarkdown(), 'utf8')
  await writeFile(path.join(rootDir, 'public', 'llms.txt'), text.buildLlmsTxt(), 'utf8')
  console.log('Wrote public/official.md and public/llms.txt')
} finally {
  await vite.close()
}
