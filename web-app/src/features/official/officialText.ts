// Plain-text versions of the website for crawlers and AI agents
// (public/official.md and public/llms.txt). Generated from officialContent so
// the copy lint covers them; OfficialCrawlerFiles.test.ts keeps the committed
// files identical to this output.

import { officialContent } from './officialContent'

const SITE = 'https://www.4wall.io'
const EMAIL = 'admin@4wall.io'

const plain = (text: string) => text.replace(/\{([^}|]+)(?:\|email)?\}/g, '$1')

export function buildOfficialMarkdown() {
  const t = officialContent.zh
  const lines: string[] = []
  lines.push('# 4WALL AI（第四面牆）', '')
  lines.push(`官方網站：${SITE}/ · English: ${SITE}/en · 聯絡：${EMAIL}`, '')
  lines.push(`## ${t.hero.h1.flat().map((run) => run.text).join('')}`, '')
  lines.push(t.hero.sub, '', t.hero.note.replace(/^›\s*/, ''), '')
  lines.push(`> ${t.intro.fit}`, '')
  lines.push('## 產品流程', '')
  for (const step of t.steps) {
    lines.push(`### ${step.eyebrow.replace(/^\d+ \/ 06 · /, '')}：${step.h3}`, '', step.body, '')
    if ('note' in step && step.note) lines.push(step.note, '')
    if ('caveat' in step && step.caveat) lines.push(step.caveat, '')
  }
  lines.push(`**${t.zebra.title}**：${plain(t.zebra.body)}`, '')
  lines.push(`## ${t.spec.eyebrow}`, '', t.spec.line, '')
  for (const item of t.spec.items) lines.push(`- **${item.num}** ${item.text}`)
  lines.push('')
  lines.push(`## ${t.board.h2}`, '', t.board.intro, '', `「${t.board.bigLine}」`, '')
  for (const rule of t.board.rules) lines.push(`- **${rule.title}** ${rule.body}`)
  lines.push('')
  lines.push(`## ${t.toolkit.h2}`, '')
  for (const row of t.toolkit.rows) lines.push(`- **${row.name}**：${row.text}`)
  lines.push('')
  lines.push(`## ${t.how.eyebrow}：${t.how.h2}`, '', t.how.body, '')
  for (const stop of t.how.stops) lines.push(`${stop.num}. **${stop.title}**：${stop.body}`)
  lines.push('')
  lines.push(`## ${t.faq.eyebrow}`, '')
  for (const item of t.faq.items) lines.push(`### ${item.q}`, '', plain(item.a), '')
  lines.push('## 聯絡我們', '', `${t.dock.sub} 請來信 ${EMAIL}，我們將盡快回覆。`, '')
  lines.push(`---`, '', t.footer.disclaimer, '')
  return lines.join('\n')
}

export function buildLlmsTxt() {
  const zh = officialContent.zh
  const en = officialContent.en
  const lines: string[] = []
  lines.push('# 4WALL AI（第四面牆）', '')
  lines.push(`> ${zh.meta.organizationDescription}`, '')
  lines.push(`> ${en.meta.organizationDescription}`, '')
  lines.push('## 網站 / Site', '')
  lines.push(`- [中文官網](${SITE}/)`)
  lines.push(`- [English](${SITE}/en)`)
  lines.push(`- [官網全文（Markdown）](${SITE}/official.md)`)
  lines.push(`- 聯絡 / Contact: ${EMAIL}`, '')
  lines.push('## 產品流程 / Product flow', '')
  lines.push(zh.intro.fit, '')
  zh.steps.forEach((step, i) => {
    // Keep each step's caveats next to it so the flow is never read as "upload → KPIs anywhere".
    const extras = [step.body, 'note' in step ? step.note : '', 'caveat' in step ? step.caveat : ''].filter(Boolean).join(' ')
    lines.push(`${i + 1}. ${step.eyebrow.replace(/^\d+ \/ 06 · /, '')}：${step.h3} ${extras}`)
  })
  lines.push('', `${zh.zebra.title}：${plain(zh.zebra.body)}`, '')
  lines.push('## 我們不宣稱 / What we do not claim', '')
  for (const index of [0, 6, 7, 8]) {
    const rule = zh.board.rules[index]
    lines.push(`- ${rule.title} ${rule.body}`)
  }
  lines.push('')
  lines.push(zh.footer.disclaimer, '')
  lines.push(en.footer.disclaimer, '')
  return lines.join('\n')
}
