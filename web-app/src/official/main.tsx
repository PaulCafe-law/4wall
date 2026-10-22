import './official-base.css'

import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import { OfficialSitePage } from '../features/official/OfficialSitePage'
import { HydrationFlag } from './HydrationFlag'

declare global {
  interface Window {
    __owHydrated?: boolean
  }
}

const root = document.getElementById('root')!
const locale = document.documentElement.lang === 'en' ? 'en' : 'zh'
// Non-www hosts (staging, PR previews, local images) serve this same prerendered
// page at /official, where the language links must stay under /official.
const basePath = window.location.pathname.startsWith('/official') ? '/official' : ''
const app = (
  <StrictMode>
    <OfficialSitePage locale={locale} basePath={basePath} />
    <HydrationFlag />
  </StrictMode>
)

// www pages are prerendered without a basePath (scripts/prerender-official.mjs)
// and hydrate in place; /official pages and the bare dev template re-render.
if (root.hasChildNodes() && !basePath) hydrateRoot(root, app)
else createRoot(root).render(app)
