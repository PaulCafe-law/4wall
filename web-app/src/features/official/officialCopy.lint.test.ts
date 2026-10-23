import officialHtml from '../../../official.html?raw'
import prerenderScript from '../../../scripts/prerender-official.mjs?raw'
import { officialContent } from './officialContent'
import { buildLlmsTxt, buildOfficialMarkdown } from './officialText'

// Public copy sells what the warehouse product does, stays true, and never talks
// the product down (docs/official-warehouse-redesign.md, "Public-copy policy").

const LEGACY_CS = /\bLINE\b|\bOCR\b|\bHMI\b|\bPLC\b|\bOEE\b|\bOS\b|\.exe\b|Spatial OS/u
const LEGACY_I = /工廠|機台|廠區|產線|稼動|無人機|空拍|飛行|靚程|地端|產品履歷|factory|drone|flight|mission planning/iu
const CUSTOMER_NAMES = /和泰|Hotai|TOYOTA|Toyota|楊梅|安格|Algoltek|Angger|StarFab/u
const CUSTOMER_FIGURES = /\b876\b|\b913\b|68\s*台|20\s*站|\b342\b|8\.9\s*分|14\.0|09:05|15\s*分鐘/u

// Truth floor: claims the product cannot back up.
const OVERCLAIM: RegExp[] = [
  /最佳解|最佳化|最優|optimi[sz]/iu,
  /\boptimal\b/iu,
  /最佳方案/u,
  /精確|精準|precise/iu,
  /\bexact/iu,
  /準確|負責準|準不準|accura(te|cy)/iu,
  /已驗證|實測|validated|\bproven\b/iu,
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
  /控制|\bcontrols?\b/iu,
  /安全驗證|safety validation/iu,
  /自動找|自動最佳|automatically find/iu,
  /取代|replace/iu,
  /作業系統|operating system/iu,
]

// Negative narrative and disclaimers: say what the product does, or say nothing.
const NEGATIVE: RegExp[] = [
  /尚未|並非|不宣稱|不取代|不介入|不控制|不支援|不能|無法|不可以|不是/u,
  /校準|實績|導入成效|現場量測|盲測|如實|平手|示意/u,
  /not yet|calibrat|field results|illustrat|blind test|not supported/iu,
  /\bcannot\b|can[’']t|won[’']t|doesn[’']t|don[’']t|isn[’']t|aren[’']t|\btie\b/iu,
]

// The AI vendor and model behind the product are never named.
const VENDOR = /OpenAI|ChatGPT|\bGPT|\bLLM\b|大型語言模型|Anthropic|Claude|Gemini|供應商|provider/iu

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

function offenders(patterns: RegExp[]) {
  const found: string[] = []
  for (const [key, text] of copy) {
    for (const pattern of patterns) if (pattern.test(text)) found.push(`${key} ~ ${pattern.source}: ${text}`)
  }
  return found
}

describe('official copy lint', () => {
  it('walks every string in both locales', () => {
    expect(copy.length).toBeGreaterThan(300)
  })

  it('never leaves an empty string on the page', () => {
    expect(copy.filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([])
  })

  it('never mentions the legacy factory product or customers', () => {
    const found = copy.filter(([, text]) => [LEGACY_CS, LEGACY_I, CUSTOMER_NAMES, CUSTOMER_FIGURES].some((re) => re.test(text)))
    expect(found).toEqual([])
  })

  it('never overclaims', () => {
    expect(offenders(OVERCLAIM)).toEqual([])
  })

  it('never talks the product down or adds disclaimers', () => {
    expect(offenders(NEGATIVE)).toEqual([])
  })

  it('never names the AI vendor or model', () => {
    expect(offenders([VENDOR])).toEqual([])
  })

  it('keeps the crawler text and page head on the same policy', () => {
    for (const text of [buildOfficialMarkdown(), buildLlmsTxt(), officialHtml]) {
      for (const re of [LEGACY_CS, LEGACY_I, CUSTOMER_NAMES, CUSTOMER_FIGURES, VENDOR, ...NEGATIVE]) expect(text).not.toMatch(re)
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
    const found = Object.entries(sources)
      .filter(([, source]) => LEGACY_CS.test(source) || LEGACY_I.test(source) || CUSTOMER_NAMES.test(source))
      .map(([file]) => file)
    expect(found).toEqual([])
  })
})
