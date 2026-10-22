import officialHtml from '../../../official.html?raw'
import prerenderScript from '../../../scripts/prerender-official.mjs?raw'
import { officialContent } from './officialContent'
import { buildLlmsTxt, buildOfficialMarkdown } from './officialText'

// Public copy must stay on the warehouse product and never overclaim
// (docs/official-warehouse-redesign.md, "Public-claim policy").

const LEGACY_CS = /\bLINE\b|\bOCR\b|\bHMI\b|\bPLC\b|\bOEE\b|\bOS\b|\.exe\b|Spatial OS/u
const LEGACY_I = /工廠|機台|廠區|產線|稼動|無人機|空拍|飛行|靚程|地端|產品履歷|factory|drone|flight|mission planning/iu
const CUSTOMER_NAMES = /和泰|Hotai|TOYOTA|Toyota|楊梅|安格|Algoltek|Angger|StarFab/u
const CUSTOMER_FIGURES = /\b876\b|\b913\b|68\s*台|20\s*站|\b342\b|8\.9\s*分|14\.0|09:05|15\s*分鐘/u

const OVERCLAIM: RegExp[] = [
  /最佳解|最佳化|最優|optimi[sz]/iu,
  /\boptimal\b/iu,
  /最佳方案/u,
  /精確|精準|precise/iu,
  /\bexact/iu,
  /準確|負責準|準不準|accura(te|cy)/iu,
  /(?<!尚未用現場資料)校準/u,
  /(?<!not yet )calibrat/iu,
  /已驗證|實測|validated|\bproven\b/iu,
  /(?<!不是(任何倉庫的)?現場)實績/u,
  /(?<!not )field results/iu,
  /保證|guarantee/iu,
  /零留存|zero[- ]retention|不出本機|不送雲端|本機|on-?prem|local only/iu,
  /SaaS|多人協作|協作|collaborat|多租戶|multi-tenant|企業帳號/iu,
  /一次到位|學會這座倉庫|停線/u,
  // USD alone is also a 3D file format, so only currency-shaped uses are flagged.
  /免費|free trial|\bfree\b|註冊|sign ?up|價格|定價|報價|元／月|NT\$|US\$|USD\s?\d|\d\s?USD|\$/iu,
  /%|％|percent/iu,
  /週|禮拜|天內|幾分鐘生成|minutes to build|in \d+ (days|weeks)/iu,
  /研究版|research edition|演化|evolution|自研|100\s*%/iu,
  /世界模型|world[- ]model|dry run/iu,
  /(?<!不)控制/u,
  /(?<!(doesn’t|doesn't|does not|don’t|don't|not) )\bcontrols?\b/iu,
  /(?<!不能當作|也不能當作)安全驗證/u,
  /(?<!(aren’t|aren't|isn’t|isn't|not) a )safety validation/iu,
  /自動找|自動最佳|automatically find/iu,
  /取代|replace/iu,
  /作業系統|operating system/iu,
]

// Exact key paths allowed to contain one pattern, because they state the negation.
const ALLOW: Record<string, RegExp[]> = {
  'zh:board.rules.6.body': [/最佳解|最佳化|最優|optimi[sz]/iu],
  'en:board.rules.6.body': [/\boptimal\b/iu],
  'zh:faq.items.6.q': [/最佳方案/u],
  'en:faq.items.6.q': [/\boptimal\b/iu],
  'zh:steps.1.note': [/精確|精準|precise/iu],
  'en:steps.1.note': [/\bexact/iu],
  'en:faq.items.5.q': [/(?<!not )field results/iu],
  'zh:faq.items.7.q': [/(?<!不)控制/u],
  'en:faq.items.7.q': [/(?<!(doesn’t|doesn't|does not|don’t|don't|not) )\bcontrols?\b/iu],
  'zh:board.rules.8.title': [/取代|replace/iu],
  'en:board.rules.8.title': [/取代|replace/iu],
  'zh:faq.items.8.q': [/取代|replace/iu],
  'en:faq.items.8.q': [/取代|replace/iu],
}

function leaves(value: unknown, keyPath: string, out: Array<[string, string]>) {
  if (typeof value === 'string') out.push([keyPath, value])
  else if (Array.isArray(value)) value.forEach((item, i) => leaves(item, `${keyPath}.${i}`, out))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) leaves(item, keyPath ? `${keyPath}.${key}` : key, out)
  }
  return out
}

const copy = (['zh', 'en'] as const).flatMap((locale) =>
  leaves(officialContent[locale], '', []).map(([key, text]) => [`${locale}:${key}`, text] as const),
)

describe('official copy lint', () => {
  it('walks every string in both locales', () => {
    expect(copy.length).toBeGreaterThan(300)
  })

  it('never mentions the legacy factory product or customers', () => {
    const offenders = copy.filter(([, text]) => [LEGACY_CS, LEGACY_I, CUSTOMER_NAMES, CUSTOMER_FIGURES].some((re) => re.test(text)))
    expect(offenders).toEqual([])
  })

  it('never overclaims outside the allowlisted negations', () => {
    const offenders: string[] = []
    for (const [key, text] of copy) {
      for (const pattern of OVERCLAIM) {
        if (!pattern.test(text)) continue
        const allowed = ALLOW[key]?.some((re) => re.source === pattern.source)
        if (!allowed) offenders.push(`${key} ~ ${pattern.source}: ${text}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the crawler text on the warehouse product', () => {
    for (const text of [buildOfficialMarkdown(), buildLlmsTxt()]) {
      for (const re of [LEGACY_CS, LEGACY_I, CUSTOMER_NAMES, CUSTOMER_FIGURES]) expect(text).not.toMatch(re)
    }
  })

  it('keeps legacy and customer names out of the official source code', () => {
    const sources: Record<string, string> = {
      ...import.meta.glob(['./**/*.{ts,tsx,css}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../../official/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }),
      'official.html': officialHtml,
      'scripts/prerender-official.mjs': prerenderScript,
    }
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const offenders = Object.entries(sources)
      .filter(([, source]) => LEGACY_CS.test(source) || LEGACY_I.test(source) || CUSTOMER_NAMES.test(source))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
