import { Link } from 'react-router-dom'

import { useOfficialSiteMeta } from './useOfficialSiteMeta'

const problemCards = [
  {
    title: '現場資訊分散',
    body: '影像、巡檢紀錄、異常事件與人員回報散在不同工具，管理者很難建立同一套現場事實。',
  },
  {
    title: '異常發現太晚',
    body: '問題常等到人工巡檢或事故發生後才被注意，缺少持續運作的早期提醒。',
  },
  {
    title: '遠端掌握困難',
    body: '老闆與主管需要在不進場的情況下，快速理解工地與工廠目前最重要的狀態。',
  },
  {
    title: '經驗難以累積',
    body: '現場判斷依賴資深人員與口頭交接，缺少可追蹤、可回查、可協作的營運資料。',
  },
]

const workflowSteps = [
  '建立場域模型',
  '接入攝影機 / 無人機',
  'AI 分析影像與事件',
  '呈現 3D / 平面圖 / 事件卡',
  'LINE / Web 通知',
  '累積營運資料庫',
]

const siteTypes = ['建築工地', '工廠產線周邊', '倉儲與物流空間', '設備巡檢場域', '校園、園區、停車場']

const partnerCards = [
  {
    name: '成大建築系',
    tag: '工地場域｜BIM｜建築空間模型',
    body: '我們為成大建築系提供工地巡檢、BIM / 3D 場域模型整合、事件定位與營建現場管理流程設計，協助建築場域建立更完整的現場資料工作流。',
  },
  {
    name: '靚程企業有限公司',
    tag: '虛擬工廠｜設備監測｜日常營運',
    body: '我們為靚程企業有限公司提供虛擬工廠 Digital Twin、固定攝影機監測、設備狀態紀錄、異常事件通報與 LINE AI 助手通知流程。',
  },
]

const industrialDataSteps = [
  {
    title: '生成工業場景',
    body: '建立工廠、機台區、通道與設備區等場景。',
  },
  {
    title: '模擬異常事件',
    body: '產生冒煙、漏水、危險區入侵、通道阻塞等稀有事件。',
  },
  {
    title: '自動產生標註',
    body: '產出影像、事件標籤、mask、bounding box 與 metadata。',
  },
  {
    title: '訓練巡檢模型',
    body: '在真實資料不足時，持續驗證與優化事件辨識模型。',
  },
]

const industrialValueCards = [
  {
    title: '補足稀有異常資料',
    body: '不必等待事故真的發生，也能建立模型訓練資料。',
  },
  {
    title: '降低標註與導入成本',
    body: '自動產生影像、事件與標註資料，減少前期資料準備時間。',
  },
  {
    title: '強化現場事件辨識',
    body: '讓第四面牆平台從看見現場，進一步理解現場。',
  },
]

const industrialRelationNodes = [
  '現場管理平台',
  '需要 AI 看懂事件',
  '異常資料不足',
  'Industrial Data Engine',
  '更好的事件辨識模型',
  '回到現場管理平台',
]

const industrialOutputs = ['合成影像與影片', '異常事件資料', '標註資料', '模型訓練集', '模型驗證資料']

function CtaLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: string
  variant?: 'primary' | 'secondary'
}) {
  const classes =
    variant === 'primary'
      ? 'bg-[#0071e3] text-white hover:bg-[#0077ed]'
      : 'border border-[#0071e3] text-[#0071e3] hover:bg-[#0071e3] hover:text-white'

  return (
    <a className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition ${classes}`} href={href}>
      {children}
    </a>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h2 className="font-display text-4xl font-semibold tracking-[-0.055em] text-chrome-950 md:text-6xl">
        {title}
      </h2>
      {subtitle ? <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-chrome-700">{subtitle}</p> : null}
    </div>
  )
}

function ImageCard({
  title,
  body,
  image,
  alt,
  tone = 'light',
  imageOnly = false,
}: {
  title: string
  body: string
  image: string
  alt: string
  tone?: 'light' | 'dark'
  imageOnly?: boolean
}) {
  const dark = tone === 'dark'

  return (
    <article
      className={`overflow-hidden rounded-[2rem] ${dark ? 'bg-chrome-950 text-white' : 'bg-white text-chrome-950'} shadow-[0_18px_70px_rgba(18,24,33,0.12)]`}
    >
      {!imageOnly ? (
        <div className="px-6 pt-7 text-center md:px-10 md:pt-10">
          <h3 className="font-display text-3xl font-semibold tracking-[-0.05em] md:text-4xl">{title}</h3>
          <p className={`mx-auto mt-3 max-w-2xl text-sm leading-6 md:text-base ${dark ? 'text-chrome-200' : 'text-chrome-700'}`}>
            {body}
          </p>
        </div>
      ) : null}
      <div className={`${imageOnly ? '' : 'mt-6'} overflow-hidden`}>
        <img
          className={imageOnly ? 'w-full object-contain' : 'h-[22rem] w-full object-cover md:h-[30rem]'}
          src={image}
          alt={alt}
          loading="lazy"
        />
      </div>
    </article>
  )
}

export function OfficialSitePage() {
  useOfficialSiteMeta()

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-chrome-950">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5f5f7]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="#top" className="font-display text-sm font-semibold tracking-[-0.02em] text-chrome-950">
            第四面牆 AI
          </a>
          <nav className="hidden items-center gap-7 text-xs text-chrome-700 md:flex">
            <a className="transition hover:text-chrome-950" href="#services">
              服務內容
            </a>
            <a className="transition hover:text-chrome-950" href="#industrial-data-engine">
              AI 資料引擎
            </a>
            <a className="transition hover:text-chrome-950" href="#workflow">
              系統流程
            </a>
            <a className="transition hover:text-chrome-950" href="#partners">
              合作機構
            </a>
            <a className="transition hover:text-chrome-950" href="#contact">
              聯絡我們
            </a>
          </nav>
          <Link className="rounded-full bg-chrome-950 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-chrome-800" to="/login">
            進入管理平台
          </Link>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto max-w-7xl px-4 pb-6 pt-12 md:pt-20">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-[-0.07em] text-chrome-950 md:text-7xl lg:text-8xl">
              第四面牆 AI｜重塑現場管理：讓真實空間具備感知、追蹤與協作能力
            </h1>
            <p className="mx-auto mt-6 max-w-4xl text-xl leading-9 tracking-[-0.02em] text-chrome-700 md:text-2xl">
              透過無人機、固定攝影機與 AI Agent 的無縫整合，為工廠與工地打造專屬的 Digital Twin，實現即時通報、精準追蹤與歷史回放的智慧大腦。
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <CtaLink href="#services">了解服務內容</CtaLink>
              <CtaLink href="#contact" variant="secondary">
                聯繫我們
              </CtaLink>
            </div>
          </div>

          <div className="mt-12 overflow-hidden rounded-[2.5rem] bg-chrome-950 shadow-[0_30px_100px_rgba(18,24,33,0.24)]">
            <img
              className="h-[28rem] w-full object-cover md:h-[42rem]"
              src="/official-assets/hero-field-ai.jpg"
              alt="第四面牆 AI 將無人機巡檢、現場影像與 AI 辨識疊合在工廠場域上"
            />
          </div>

          <div className="mt-5 flex flex-col gap-4 rounded-[2rem] bg-white px-6 py-5 shadow-[0_18px_70px_rgba(18,24,33,0.08)] md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-500">Platform AI layer</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.045em] text-chrome-950">
                平台底層 AI 能力建置中
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-chrome-700">
                4WALL Industrial Data Engine 將協助第四面牆在異常事件資料不足時，仍能訓練與驗證現場事件辨識模型。
              </p>
            </div>
            <CtaLink href="#industrial-data-engine" variant="secondary">
              了解 Industrial Data Engine
            </CtaLink>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-2 xl:grid-cols-4">
          {problemCards.map((item) => (
            <article key={item.title} className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-chrome-700">{item.body}</p>
            </article>
          ))}
        </section>

        <section id="services" className="scroll-mt-20 px-4 py-10">
          <SectionHeading
            title="AI、現場資料、3D 場域，放在同一個工作流。"
            subtitle="第四面牆不是一般 SaaS 儀表板，而是把真實場域資料接進異常事件完整流程，讓管理者能看懂現場、指派處理、留下紀錄。"
          />

          <div className="mx-auto mt-10 grid max-w-7xl gap-5 lg:grid-cols-2">
            <ImageCard
              title="智慧工地巡檢與風險管理"
              body="整合工地影像、無人機或手機巡檢資料，辨識安全帽、危險區域、洞口、材料堆置與施工異常，並把事件標記在 3D / 平面圖上。"
              image="/official-assets/construction-plan.png"
              alt="工地分期規劃與動線管理示意圖"
              imageOnly
            />
            <ImageCard
              title="日常營運的虛擬工廠 Digital Twin"
              body="用固定攝影機與 3D 場域模型追蹤設備、儀表板與工作區域狀態，讓主管遠端掌握工廠現況，並由 LINE 群組 AI 助手主動提醒。"
              image="/official-assets/dashboard-bim.png"
              alt="管理平台中實景與 BIM 模型對照的操作畫面"
              tone="dark"
              imageOnly
            />
          </div>

          <div className="mx-auto mt-5 grid max-w-7xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <ImageCard
              title="異常被看見，也被追蹤。"
              body="材料存量、施工落差與人員位置不只停在畫面上，而是進入事件紀錄、指派與結案流程。"
              image="/official-assets/materials-detection.jpg"
              alt="AI 辨識木材庫存過低的現場畫面"
            />
            <ImageCard
              title="LINE 助手，把提醒送到人。"
              body="事件建立、確認、指派、處理中與結案都能形成可回查紀錄，未來可接群組 quick reply 與現場回報。"
              image="/official-assets/line-agent-card.jpg"
              alt="LINE AI 助手推送工期警示與處理建議的卡片"
            />
          </div>
        </section>

        <section id="industrial-data-engine" className="scroll-mt-20 px-4 py-14 md:py-24">
          <SectionHeading
            title="4WALL Industrial Data Engine"
            subtitle="讓現場管理平台從「看見現場」進一步走向「理解現場」。"
          />
          <p className="mx-auto mt-5 max-w-4xl text-center text-base leading-8 text-chrome-700 md:text-lg">
            第四面牆的現場管理平台整合影像、巡檢紀錄、Digital Twin、異常事件與處理流程。為了讓 AI 更穩定地辨識危險區入侵、通道阻塞、漏水、冒煙、儀表板異常與人員靠近高風險區域，我們正在建置平台底層的 AI 訓練資料與模型驗證引擎。
          </p>

          <div className="mx-auto mt-10 grid max-w-7xl gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <article className="overflow-hidden rounded-[2.5rem] bg-white shadow-[0_18px_70px_rgba(18,24,33,0.1)]">
              <img
                className="h-full min-h-[25rem] w-full object-cover"
                src="/official-assets/industrial-data-engine-control-room.png"
                alt="台灣工業現場工程師正在討論監控影像中異常事件資料不足的問題。"
                loading="lazy"
              />
            </article>
            <article className="flex flex-col justify-center rounded-[2.5rem] bg-chrome-950 px-7 py-10 text-white shadow-[0_18px_70px_rgba(18,24,33,0.16)] md:px-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-300">Data gap</p>
              <h3 className="mt-3 font-display text-4xl font-semibold tracking-[-0.055em] md:text-6xl">
                現場影像很多，異常資料很少。
              </h3>
              <p className="mt-5 text-base leading-8 text-chrome-200">
                工業現場每天累積大量正常影像，但真正重要的異常事件發生頻率低、蒐集困難，也不適合為了訓練模型刻意製造事故。
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {['異常事件少', '標註成本高', '真實資料難取得'].map((chip) => (
                  <span key={chip} className="rounded-full bg-white/10 px-4 py-2 text-sm text-chrome-100">
                    {chip}
                  </span>
                ))}
              </div>
            </article>
          </div>

          <div className="mx-auto mt-14 max-w-7xl">
            <div className="text-center">
              <h3 className="font-display text-3xl font-semibold tracking-[-0.045em] text-chrome-950 md:text-5xl">
                資料引擎如何支撐現場事件辨識
              </h3>
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-chrome-700 md:text-base">
                生成工業場景 → 模擬異常事件 → 自動產生標註 → 訓練巡檢模型
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {industrialDataSteps.map((step, index) => (
                <article key={step.title} className="rounded-[2rem] bg-white px-6 py-7 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf6f2] font-mono text-sm font-semibold text-moss-600">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h4 className="mt-5 font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">{step.title}</h4>
                  <p className="mt-3 text-sm leading-6 text-chrome-700">{step.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-7xl">
            <h3 className="text-center font-display text-3xl font-semibold tracking-[-0.045em] text-chrome-950 md:text-5xl">
              底層資料能力，回到現場管理價值。
            </h3>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {industrialValueCards.map((card) => (
                <article key={card.title} className="rounded-[2rem] bg-white px-6 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                  <h4 className="font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">{card.title}</h4>
                  <p className="mt-3 text-sm leading-6 text-chrome-700">{card.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-7xl gap-5 rounded-[2.5rem] bg-white px-6 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.1)] lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {industrialRelationNodes.map((node, index) => (
                  <div key={node} className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-4 py-2 text-sm font-medium ${
                        node === 'Industrial Data Engine'
                          ? 'bg-chrome-950 text-white'
                          : 'bg-[#f5f5f7] text-chrome-800'
                      }`}
                    >
                      {node}
                    </span>
                    {index < industrialRelationNodes.length - 1 ? <span className="text-chrome-400">→</span> : null}
                  </div>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                {industrialOutputs.map((output) => (
                  <span key={output} className="rounded-full border border-chrome-200 bg-white px-4 py-2 text-sm text-chrome-700">
                    {output}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-base leading-8 text-chrome-700">
              Industrial Data Engine 不是獨立的新方向，而是第四面牆現場管理平台的底層 AI 資料能力，協助平台在真實異常資料不足時，仍能持續訓練、驗證與優化事件辨識模型。
            </p>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 bg-white px-4 py-16 md:py-24">
          <SectionHeading title="從影像到處理紀錄，形成完整流程。" />
          <div className="mx-auto mt-10 grid max-w-6xl gap-3 md:grid-cols-3 lg:grid-cols-6">
            {workflowSteps.map((step, index) => (
              <div key={step} className="rounded-[1.5rem] bg-[#f5f5f7] px-4 py-5 text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-500">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-chrome-900">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-5 px-4 py-10 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2.5rem] bg-chrome-950 px-7 py-10 text-white shadow-[0_18px_70px_rgba(18,24,33,0.16)] md:px-10">
            <h2 className="font-display text-4xl font-semibold tracking-[-0.055em] md:text-6xl">適用在每一個需要遠端掌握的現場。</h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-chrome-200">
              建築工地、工廠產線周邊、倉儲物流、設備巡檢、校園園區與停車場，都可以先從影像與事件完整流程開始。
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {siteTypes.map((site) => (
                <span key={site} className="rounded-full bg-white/10 px-4 py-2 text-sm text-chrome-100">
                  {site}
                </span>
              ))}
            </div>
          </article>
          <article className="overflow-hidden rounded-[2.5rem] bg-white shadow-[0_18px_70px_rgba(18,24,33,0.12)]">
            <img
              className="h-full min-h-[28rem] w-full object-cover"
              src="/official-assets/safety-detection.jpg"
              alt="AI 在工廠場域中辨識人員位置與安全狀態"
              loading="lazy"
            />
          </article>
        </section>

        <section id="partners" className="scroll-mt-20 px-4 py-12 md:py-20">
          <SectionHeading
            title="合作機構"
            subtitle="4wall AI 在建立下一代工廠及工地 AI native 系統。"
          />
          <div className="mx-auto mt-10 grid max-w-6xl gap-5 md:grid-cols-2">
            {partnerCards.map((partner) => (
              <article key={partner.name} className="rounded-[2rem] bg-white px-7 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-500">合作機構</p>
                <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.045em] text-chrome-950">{partner.name}</h3>
                <p className="mt-2 text-sm font-medium text-ember-500">{partner.tag}</p>
                <p className="mt-5 text-sm leading-7 text-chrome-700">{partner.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 px-4 pb-10">
          <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-chrome-950 px-6 py-14 text-center text-white md:px-10 md:py-20">
            <h2 className="font-display text-4xl font-semibold tracking-[-0.055em] md:text-6xl">把你的現場，變成可以協作的系統。</h2>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-chrome-200">
              歡迎寄信洽詢。
            </p>
            <a className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-chrome-950 transition hover:bg-chrome-100" href="mailto:4wallaitech@gmail.com">
              4wallaitech@gmail.com
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
