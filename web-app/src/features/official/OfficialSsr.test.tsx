// @vitest-environment node
// The prerender runs OfficialSitePage through renderToString in Node, so the
// render path must never touch window/document.

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { OfficialSitePage } from './OfficialSitePage'

describe('OfficialSitePage server render', () => {
  it.each(['zh', 'en'] as const)('renders %s without a DOM', (locale) => {
    expect(typeof window).toBe('undefined')
    const html = renderToString(createElement(OfficialSitePage, { locale }))

    expect(html).toContain(locale === 'zh' ? '倉庫的每個決定，' : 'Run every warehouse decision')
    expect(html).toContain('href="https://platform.4wall.io"')
    expect(html).toContain('id="contact"')
    // Posters stand in for the canvas before JavaScript runs.
    expect(html).toContain('ow-stage__poster')
    // No percentages in visible text (mailto URLs are percent-encoded, so strip tags first).
    expect(html.replace(/<[^>]*>/g, '')).not.toContain('%')
  })
})
