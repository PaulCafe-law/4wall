import { Link } from 'react-router-dom'

import { useOfficialSiteMeta } from './useOfficialSiteMeta'

const heroStats = [
  { value: '7 台機台', label: '台南射出成型工廠實裝' },
  { value: '3 支攝影機', label: '24 小時自動判讀' },
  { value: '3 天 → 3 小時', label: '異常處理時間' },
  { value: '< 3 個月', label: '客戶端投資回收（實裝場域實算）' },
]

const problemCards = [
  {
    title: '六套系統、六個孤島',
    body: 'ERP、監視器、Excel、群組訊息各說各話，出了事只能事後拼湊到底發生什麼。',
  },
  {
    title: '異常都是事後才知道',
    body: '夜班冒煙、儀表飄掉、機台停了——沒有人在看的時候，就沒有人知道。',
  },
  {
    title: '人不在廠，現場就是黑箱',
    body: '出門跑客戶、人在國外，工廠現在的狀況只能靠電話一通一通問。',
  },
  {
    title: '老師傅的判斷帶不走',
    body: '巡檢和判斷的經驗都在資深人員腦袋裡，人一走，經驗就歸零。',
  },
]

const onboardingSteps = [
  {
    title: '到廠場勘與 3D 掃描',
    body: 'LiDAR 實地掃描直接建出廠區 3D 模型，免 CAD 圖，幾十年的舊廠也能導入，不影響生產。',
  },
  {
    title: '部署攝影機與判讀節點',
    body: '架設攝影機與現場判讀主機，對準儀表、HMI 螢幕與派工單——不改機台、不停機，數據開始自動流進系統。',
  },
  {
    title: '上線，開始收通知',
    body: '鏡像工廠開通，異常直接推進你的 LINE 群組；想知道什麼，問一句話就有答案。',
  },
]

const pricingTiers = [
  {
    name: 'Spatial OS 基本方案',
    price: '月費 NT$8,000 起',
    setup: '建置費 NT$24,000 起',
    body: '3D 鏡像工廠、AI 儀表與派工單判讀、異常事件追蹤、LINE 群組通知與一句話查詢。',
    highlight: true,
  },
  {
    name: '室內定位加購',
    price: '月費 NT$3,000–5,000',
    setup: '建置費 NT$18,000–25,000',
    body: 'UWB 室內定位，人員、資產與搬運車的位置即時同步到鏡像工廠。',
    highlight: false,
  },
  {
    name: 'AMR 自主搬運加購',
    price: '月費 NT$5,000–8,000／台',
    setup: '建置費 NT$80,000–120,000／台',
    body: '免 SLAM 的 BIM 原生導航搬運車，直接用你的廠區模型規劃路徑。',
    highlight: false,
  },
]

const securityPoints = [
  {
    title: '人員偵測全程匿名',
    body: '系統只計算「有人在哪個位置」，不做人臉辨識、不追蹤個人身分，員工隱私不進資料庫。',
  },
  {
    title: '判讀在現場完成',
    body: '儀表與螢幕的 AI 判讀在現場節點執行，平台接收的是數值與事件，而不是把整天的錄影搬上雲。',
  },
  {
    title: '權限分級、可簽保密協議',
    body: '平台帳號依角色分級授權，誰能看什麼由你決定；導入前可簽 NDA，資料存放方式白紙黑字約定。',
  },
]

const partnerCards = [
  {
    name: '成大建築系',
    tag: '技術合作｜BIM 與建築空間模型',
    body: '工地場域巡檢、BIM / 3D 場域模型整合與營建現場資料流程的長期技術合作。',
  },
  {
    name: '安格科技',
    tag: '策略合作｜AIoT 軟硬整合',
    body: '神盾集團感測方案商，AIoT 軟硬體整合合作展開中。',
  },
]

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
      <h2 className="font-display text-4xl font-semibold tracking-[-0.01em] text-chrome-950 md:text-6xl">
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
  width,
  height,
  tone = 'light',
}: {
  title: string
  body: string
  image: string
  alt: string
  width: number
  height: number
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'

  return (
    <article
      className={`overflow-hidden rounded-[2rem] ${dark ? 'bg-chrome-950 text-white' : 'bg-white text-chrome-950'} shadow-[0_18px_70px_rgba(18,24,33,0.12)]`}
    >
      <div className="px-6 pt-7 text-center md:px-10 md:pt-10">
        <h3 className="font-display text-3xl font-semibold tracking-[-0.01em] md:text-4xl">{title}</h3>
        <p className={`mx-auto mt-3 max-w-2xl text-sm leading-6 md:text-base ${dark ? 'text-chrome-200' : 'text-chrome-700'}`}>
          {body}
        </p>
      </div>
      <div className="mt-6 overflow-hidden">
        <img
          className="h-[22rem] w-full object-cover md:h-[30rem]"
          src={image}
          alt={alt}
          width={width}
          height={height}
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
            <a className="transition hover:text-chrome-950" href="#case">
              實裝場域
            </a>
            <a className="transition hover:text-chrome-950" href="#pricing">
              方案與費用
            </a>
            <a className="transition hover:text-chrome-950" href="#onboarding">
              導入流程
            </a>
            <a className="transition hover:text-chrome-950" href="#security">
              資料保護
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              className="hidden text-xs text-chrome-700 transition hover:text-chrome-950 md:inline"
              rel="nofollow"
              to="/login"
            >
              進入管理平台
            </Link>
            <a
              className="rounded-full bg-chrome-950 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-chrome-800"
              href="#contact"
            >
              聯絡我們
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto max-w-7xl px-4 pb-6 pt-12 md:pt-20">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-chrome-950 md:text-7xl lg:text-8xl">
              整座工廠，看得見、問得到。
            </h1>
            <p className="mx-auto mt-6 max-w-4xl text-xl leading-9 text-chrome-700 md:text-2xl">
              第四面牆把機台狀態、儀表讀值、人員位置與異常事件，即時收進同一座 3D 鏡像工廠。
              你在 LINE 問一句話就有答案；出狀況，系統先告訴你。
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <CtaLink href="#contact">預約到廠評估</CtaLink>
              <CtaLink href="#services" variant="secondary">
                看看我們怎麼做
              </CtaLink>
            </div>
          </div>

          <div className="mt-12 overflow-hidden rounded-[2.5rem] bg-chrome-950 shadow-[0_30px_100px_rgba(18,24,33,0.24)]">
            <img
              className="h-[28rem] w-full object-cover md:h-[42rem]"
              src="/official-assets/hero-field-ai.webp"
              alt="第四面牆 AI 把現場影像、AI 辨識與 3D 鏡像工廠疊合在真實工廠場域上"
              width={1800}
              height={1350}
              fetchPriority="high"
            />
          </div>

          <div className="mt-5 grid gap-4 rounded-[2rem] bg-white px-6 py-6 shadow-[0_18px_70px_rgba(18,24,33,0.08)] sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {heroStats.map((stat) => (
              <div key={stat.value} className="text-center lg:text-left">
                <p className="font-display text-3xl font-semibold tracking-[-0.01em] text-chrome-950 md:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm leading-6 text-chrome-700">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6">
          <h2 className="sr-only">工廠老闆每天遇到的問題</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {problemCards.map((item) => (
              <article key={item.title} className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-chrome-700">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="services" className="scroll-mt-20 px-4 py-10">
          <SectionHeading
            title="不是第七個 dashboard，是一個會回答你的工廠。"
            subtitle="機台、儀表、人員與事件收進同一座 3D 數位分身（Digital Twin）。你不用學新系統——用 LINE 問，它就回答；有異常，它先開口。"
          />

          <div className="mx-auto mt-10 grid max-w-7xl gap-5 lg:grid-cols-2">
            <ImageCard
              title="鏡像工廠：整座廠，一個畫面"
              body="LiDAR 實掃建出你的廠區 3D 模型，機台狀態、人員位置、異常事件即時同步在同一個畫面。免 CAD 圖，舊廠也能導入。"
              image="/official-assets/dashboard-bim.webp"
              alt="管理平台中實景影像與 3D 鏡像工廠對照的操作畫面"
              width={1254}
              height={1254}
              tone="dark"
            />
            <ImageCard
              title="儀表、派工單，AI 自動讀"
              body="老設備沒有數位輸出？攝影機對準儀表、HMI 螢幕與紙本派工單，AI 全天自動判讀——不改機台、不碰 PLC、不停機，超標就記錄、就通知。"
              image="/official-assets/materials-detection.jpg"
              alt="AI 自動辨識現場物料與設備狀態的畫面"
              width={1200}
              height={896}
            />
          </div>

          <div className="mx-auto mt-5 grid max-w-7xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <ImageCard
              title="事件有頭有尾，不再淹沒在群組裡"
              body="每個異常自動建立事件，走完確認、指派、處理、結案的流程，全部可回查——誰處理的、花多久，一目了然。"
              image="/official-assets/safety-detection.jpg"
              alt="AI 在工廠場域中偵測人員位置與安全狀態"
              width={1195}
              height={896}
            />
            <ImageCard
              title="LINE 主動通知，把消息送到人"
              body="異常推播、每日摘要直接進你的 LINE 群組；想查現場，在群組問「3 號機今天狀況？」就有答案。"
              image="/official-assets/line-agent-card.jpg"
              alt="LINE AI 助手推送異常警示與處理建議的卡片"
              width={409}
              height={800}
            />
          </div>

          <div className="mx-auto mt-5 max-w-7xl rounded-[2rem] bg-white px-6 py-6 text-center shadow-[0_18px_70px_rgba(18,24,33,0.08)] md:px-8">
            <p className="mx-auto max-w-4xl text-sm leading-7 text-chrome-700 md:text-base">
              平台底層是自建的 4WALL Industrial Data Engine——用模擬事件預先訓練辨識模型，
              所以就算你的廠從沒發生過火警，系統也認得冒煙。
            </p>
          </div>
        </section>

        <section id="case" className="scroll-mt-20 px-4 py-14 md:py-20">
          <SectionHeading
            title="真實場域，真實運作中。"
            subtitle="不是概念展示——以下畫面與數字都來自營運中的系統。"
          />

          <div className="mx-auto mt-10 max-w-7xl overflow-hidden rounded-[2.5rem] bg-chrome-950 text-white shadow-[0_18px_70px_rgba(18,24,33,0.16)]">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="flex flex-col justify-center px-7 py-10 md:px-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-300">實裝場域</p>
                <h3 className="mt-3 font-display text-4xl font-semibold tracking-[-0.01em] md:text-5xl">
                  靚程企業｜台南・射出成型
                </h3>
                <p className="mt-5 max-w-2xl text-base leading-8 text-chrome-200">
                  在 7 台射出機的廠區實裝 3 支攝影機、8 個語意分區。HC600 的 HMI 溫度與現場指針電表由 AI 自動判讀，
                  紙本派工單拍照即結構化，機台狀態即時同步到 3D 鏡像工廠，異常直接推進 LINE 群組。
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {['異常處理 3 天 → 3 小時', 'HMI 與電表自動判讀', '派工單自動辨識', 'LINE 群組即時通報'].map((chip) => (
                    <span key={chip} className="rounded-full bg-white/10 px-4 py-2 text-sm text-chrome-100">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <img
                className="h-full min-h-[20rem] w-full object-cover"
                src="/official-assets/industrial-data-engine-control-room.webp"
                alt="工程師在控制室檢視工廠監控影像與判讀結果"
                width={1672}
                height={941}
                loading="lazy"
              />
            </div>
          </div>

          <div className="mx-auto mt-6 grid max-w-5xl gap-5 md:grid-cols-2">
            {partnerCards.map((partner) => (
              <article key={partner.name} className="rounded-[2rem] bg-white px-7 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-500">合作機構</p>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{partner.name}</h3>
                <p className="mt-2 text-sm font-medium text-ember-600">{partner.tag}</p>
                <p className="mt-4 text-sm leading-7 text-chrome-700">{partner.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 bg-white px-4 py-16 md:py-24">
          <SectionHeading
            title="方案與費用"
            subtitle="訂閱制、以廠區為單位。實際報價依廠區規模與需求，來信即可取得完整方案。"
          />
          <div className="mx-auto mt-10 grid max-w-7xl gap-5 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <article
                key={tier.name}
                className={`flex flex-col rounded-[2rem] px-7 py-9 ${
                  tier.highlight
                    ? 'bg-chrome-950 text-white shadow-[0_18px_70px_rgba(18,24,33,0.2)]'
                    : 'bg-[#f5f5f7] text-chrome-950'
                }`}
              >
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">{tier.name}</h3>
                <p className={`mt-5 font-display text-3xl font-semibold tracking-[-0.01em] ${tier.highlight ? 'text-white' : 'text-chrome-950'}`}>
                  {tier.price}
                </p>
                <p className={`mt-1 text-sm ${tier.highlight ? 'text-chrome-300' : 'text-chrome-600'}`}>{tier.setup}</p>
                <p className={`mt-5 text-sm leading-7 ${tier.highlight ? 'text-chrome-200' : 'text-chrome-700'}`}>{tier.body}</p>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-7 text-chrome-700">
            以實裝場域實際計算，客戶端投資回收少於 3 個月。
            一次沒被發現的異常，損失往往就超過一年的訂閱費用。
          </p>
        </section>

        <section id="onboarding" className="scroll-mt-20 px-4 py-16 md:py-24">
          <SectionHeading
            title="導入只要三步，以週為單位。"
            subtitle="不動你的產線、不用重拉管線，從場勘到上線都由我們到廠完成。"
          />
          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-3">
            {onboardingSteps.map((step, index) => (
              <article key={step.title} className="rounded-[2rem] bg-white px-6 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf6f2] font-mono text-sm font-semibold text-moss-600">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-chrome-700">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="security" className="scroll-mt-20 bg-white px-4 py-16 md:py-24">
          <SectionHeading
            title="你的工廠資料，只屬於你。"
            subtitle="要看老闆的產線，先講清楚資料怎麼被保護。"
          />
          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-3">
            {securityPoints.map((point) => (
              <article key={point.title} className="rounded-[2rem] bg-[#f5f5f7] px-6 py-8">
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{point.title}</h3>
                <p className="mt-3 text-sm leading-7 text-chrome-700">{point.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 px-4 py-14">
          <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-chrome-950 px-6 py-14 text-center text-white md:px-10 md:py-20">
            <h2 className="font-display text-4xl font-semibold tracking-[-0.01em] md:text-6xl">
              一封信，看你的工廠適不適合。
            </h2>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-chrome-200">
              告訴我們你的產業與廠區規模，我們會盡快回覆，並安排到廠評估。
            </p>
            <a
              className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-chrome-950 transition hover:bg-chrome-100"
              href="mailto:4wallaitech@gmail.com?subject=%E9%A0%90%E7%B4%84%E5%88%B0%E5%BB%A0%E8%A9%95%E4%BC%B0"
            >
              4wallaitech@gmail.com
            </a>
            <p className="mt-6 text-sm text-chrome-400">
              第四面牆 4WALL AI｜成大跨領域團隊（電機 × 建築 × 資管）｜台南
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-display text-sm font-semibold tracking-[-0.02em] text-chrome-950">第四面牆 4WALL AI</p>
            <p className="mt-2 max-w-sm text-xs leading-6 text-chrome-600">
              工廠與工地的空間智慧平台：3D 鏡像工廠、AI 儀表判讀、事件追蹤與 LINE 通報。
            </p>
            <p className="mt-3 text-xs text-chrome-500">台南｜國立成功大學</p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-chrome-600">
            <a className="transition hover:text-chrome-950" href="#services">
              服務內容
            </a>
            <a className="transition hover:text-chrome-950" href="#case">
              實裝場域
            </a>
            <a className="transition hover:text-chrome-950" href="#pricing">
              方案與費用
            </a>
            <a className="transition hover:text-chrome-950" href="#security">
              資料保護
            </a>
          </div>
          <div className="flex flex-col gap-2 text-xs text-chrome-600">
            <a className="transition hover:text-chrome-950" href="mailto:4wallaitech@gmail.com">
              4wallaitech@gmail.com
            </a>
            <Link className="transition hover:text-chrome-950" rel="nofollow" to="/login">
              進入管理平台
            </Link>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-[11px] text-chrome-400">© 2026 第四面牆 4WALL AI. All rights reserved.</p>
      </footer>
    </div>
  )
}
