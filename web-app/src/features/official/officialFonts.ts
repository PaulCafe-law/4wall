// Web fonts used only by the official website. The prerender script injects
// these links into the official HTML, and useOfficialSiteMeta adds them when the
// page is reached through client-side routing, so platform pages never load them.

import { officialContent, type OfficialLocale } from './officialContent'

export const OFFICIAL_FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'] as const

const MAIN_ZH =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap'
const MAIN_EN = 'https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@500;700&display=swap'

/**
 * Every character set in the 900-weight CJK display face: the hero headline,
 * the big honesty line and the closing headline. Google Fonts serves a subset
 * containing only these glyphs, so the heavy weight stays small.
 */
export const DISPLAY_TEXT_ZH = (() => {
  const zh = officialContent.zh
  const source = [zh.hero.h1.flat().map((run) => run.text).join(''), zh.board.bigLine, zh.dock.h2.join('')].join('')
  return [...new Set(source)].sort().join('')
})()

const DISPLAY_ZH = `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@900&family=Noto+Serif+TC:wght@900&display=swap&text=${encodeURIComponent(DISPLAY_TEXT_ZH)}`

export function officialFontStylesheets(locale: OfficialLocale): string[] {
  return locale === 'zh' ? [DISPLAY_ZH, MAIN_ZH] : [MAIN_EN]
}
