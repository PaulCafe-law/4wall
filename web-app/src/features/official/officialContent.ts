export type OfficialLocale = 'zh' | 'en'

const zh = {
  meta: {
    title: '第四面牆 AI｜會回答你的工廠——3D 鏡像工廠與 AI 值班代理',
    description:
      '第四面牆 AI 把機台、儀表、人員與異常事件收進 3D 鏡像工廠：在 LINE 問一句話就有答案，沒人問的時候 AI 替你值班主動通報。已於台南射出成型工廠實裝運作。',
  },
  nav: {
    services: '它會做什麼',
    day: '它的一天',
    caseStudy: '實裝場域',
    pricing: '方案與費用',
    security: '資料保護',
    contact: '聯絡我們',
    login: '進入管理平台',
    langSwitch: 'EN',
    langHref: '/official/en',
  },
  hero: {
    title: '會回答你的工廠。',
    subtitle:
      '第四面牆把機台、儀表、人員與異常事件，收進同一座 3D 鏡像工廠。你在 LINE 問一句話就有答案；沒有人問的時候，AI 替你值班。',
    ctaPrimary: '預約到廠評估',
    ctaSecondary: '看看它怎麼運作',
  },
  warRoom: {
    badge: 'SUPERVISOR AGENT・值班中',
    chatTitle: '工廠對話',
    chatState: 'AI 代理在線',
    userMsg: '派小明去處理 HC600-01',
    agentMsg: '已指派 小明 → HC600-01 成型機，開始維修。已在大螢幕標出位置。',
    machineName: 'HC600-01 成型機',
    statusLabel: '運轉中',
    metrics: [
      { k: 'OEE', v: '86%' },
      { k: '今日產量', v: '414' },
      { k: '週期', v: '32s' },
      { k: '今日告警', v: '2' },
    ],
    gaugesTitle: '實際讀表・現場攝影機判讀',
    gauges: [
      { label: 'PRESS AM METER', value: '9.7 A', note: '讀表信心 38%' },
      { label: 'FLOW AM METER', value: '4.1 A', note: '讀表信心 26%' },
      { label: 'HC600 料管一段', value: '205.0°C', note: '讀表信心 70%' },
    ],
    caption: '內容取自營運中系統・台南靚程 7 機台實裝場域',
    imageAlt:
      '第四面牆 3D 鏡像工廠戰情室：左側 AI 對話派工、中間即時 3D 工廠、右側 HC600-01 機台儀表與電表判讀值',
  },
  lineQa: {
    botName: '第四面牆 AI・工廠助手',
    messages: [
      { from: 'user', text: '給我現在機台狀況以及對應的維修人員' },
      {
        from: 'bot',
        text: '目前機台：HC600-01、03、04、06 運轉中；HC600-02、07 閒置；HC600-05 維護中。維修人員：志強（維護技師）站點 HC600-06；阿華（成型技師）站點 HC600-03。',
      },
    ],
  },
  proactiveAlert: {
    botName: '第四面牆 AI・主動通知',
    tag: '機台告警',
    title: 'HC600-01 成型機・溫度異常',
    body: '偵測到模溫連續 2 次超標，已自動推播 LINE 群組。',
    dispatch: '已派工 志強 前往處理',
    time: '08:01',
  },
  stats: [
    { value: '7 台機台', label: '台南射出成型工廠實裝' },
    { value: '3 支攝影機', label: '24 小時自動判讀' },
    { value: '3 天 → 3 小時', label: '異常處理時間' },
    { value: '< 3 個月', label: '客戶端投資回收（實裝場域實算）' },
  ],
  problemsHeading: '工廠老闆每天遇到的問題',
  problems: [
    { title: '六套系統、六個孤島', body: 'ERP、監視器、Excel、群組訊息各說各話，出了事只能事後拼湊到底發生什麼。' },
    { title: '異常都是事後才知道', body: '夜班冒煙、儀表飄掉、機台停了——沒有人在看的時候，就沒有人知道。' },
    { title: '人不在廠，現場就是黑箱', body: '出門跑客戶、人在國外，工廠現在的狀況只能靠電話一通一通問。' },
    { title: '老師傅的判斷帶不走', body: '巡檢和判斷的經驗都在資深人員腦袋裡，人一走，經驗就歸零。' },
  ],
  services: {
    title: '不是第七個 dashboard，是替你值班的 AI。',
    subtitle:
      '機台、儀表、人員與事件收進同一座 3D 數位分身（Digital Twin）。你不用學新系統——用 LINE 問，它就回答；有異常，它先開口。',
    cards: [
      {
        title: '問它，它就回答',
        body: '「現在機台狀況？誰在維修？」——在 LINE 或平台問一句話，AI 讀取現場即時數據回答你，還會在 3D 畫面標給你看。',
        image: '/official-assets/line-qa-live.webp',
        alt: 'LINE 中文問答實錄：主管問機台狀況，AI 回覆各機台運轉狀態與對應維修人員',
        width: 483,
        height: 512,
        contain: true,
      },
      {
        title: '沒人問，它主動通報',
        body: '溫度異常、儀表超標、機台停機——AI 全天值班，異常一發生就推進 LINE 群組，連夜班也有人「看著」。',
        mock: 'alert' as const,
      },
      {
        title: '儀表、派工單，AI 自動讀',
        body: '老設備沒有數位輸出？攝影機對準儀表、HMI 螢幕與紙本派工單，AI 全天自動判讀——不改機台、不碰 PLC、不停機。',
        image: '/official-assets/materials-detection.jpg',
        alt: 'AI 自動辨識現場物料與設備狀態的畫面',
        width: 1200,
        height: 896,
      },
      {
        title: '事件有頭有尾，可回查',
        body: '每個異常自動建立事件，走完確認、指派、處理、結案流程——誰處理的、花多久，一目了然。',
        image: '/official-assets/safety-detection.jpg',
        alt: 'AI 在工廠場域中偵測人員位置與安全狀態',
        width: 1195,
        height: 896,
      },
    ],
    engineNote:
      '平台底層是自建的 4WALL Industrial Data Engine——用模擬事件預先訓練辨識模型，所以就算你的廠從沒發生過火警，系統也認得冒煙。',
  },
  day: {
    title: '它的一天，替你值的班。',
    subtitle: '以下流程的各項功能，已於台南實裝場域實測上線。',
    steps: [
      { time: '07:30', title: 'LINE 主動推播', body: '「夜班 3 號機模溫異常 2 次」——系統值完夜班，關鍵畫面已自動留存。' },
      { time: '08:00', title: '一句話查詢', body: '「昨晚狀況？」→ 3D 鏡像工廠高亮異常機台，附完整事件時間軸。' },
      { time: '09:30', title: '指派與處理', body: '從 LINE 指派維修，AI 追蹤處理進度；完修自動記錄，事件結案。' },
      { time: '10:00', title: '回到你的生意', body: '你繼續跑客戶。工廠的眼睛和值班的人，都還在線上。' },
    ],
  },
  caseStudy: {
    heading: '真實場域，真實運作中。',
    subheading: '不是概念展示——以下畫面與數字都來自營運中的系統。',
    tag: '實裝場域',
    name: '靚程企業｜台南・射出成型',
    body: '在 7 台射出機的廠區實裝 3 支攝影機、8 個語意分區。HC600 的 HMI 溫度與現場指針電表由 AI 自動判讀，紙本派工單拍照即結構化，機台狀態即時同步到 3D 鏡像工廠，異常直接推進 LINE 群組。',
    chips: ['異常處理 3 天 → 3 小時', 'HMI 與電表自動判讀', '派工單自動辨識', 'LINE 群組即時通報'],
    imageAlt: '工程師在控制室檢視工廠監控影像與判讀結果',
  },
  partnersTag: '合作機構',
  partners: [
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
  ],
  pricing: {
    title: '方案與費用',
    subtitle: '訂閱制、以廠區為單位。實際報價依廠區規模與需求，來信即可取得完整方案。',
    tiers: [
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
    ],
    roi: '以實裝場域實際計算，客戶端投資回收少於 3 個月。一次沒被發現的異常，損失往往就超過一年的訂閱費用。',
  },
  onboarding: {
    title: '導入只要三步，以週為單位。',
    subtitle: '不動你的產線、不用重拉管線，從場勘到上線都由我們到廠完成。',
    steps: [
      { title: '到廠場勘與 3D 掃描', body: 'LiDAR 實地掃描直接建出廠區 3D 模型，免 CAD 圖，幾十年的舊廠也能導入，不影響生產。' },
      { title: '部署攝影機與判讀節點', body: '架設攝影機與現場判讀主機，對準儀表、HMI 螢幕與派工單——不改機台、不停機。' },
      { title: '上線，開始收通知', body: '鏡像工廠開通，異常直接推進你的 LINE 群組；想知道什麼，問一句話就有答案。' },
    ],
  },
  security: {
    title: '你的工廠資料，只屬於你。',
    subtitle: '要看老闆的產線，先講清楚資料怎麼被保護。',
    points: [
      { title: '人員偵測全程匿名', body: '系統只計算「有人在哪個位置」，不做人臉辨識、不追蹤個人身分，員工隱私不進資料庫。' },
      { title: '判讀在現場完成', body: '儀表與螢幕的 AI 判讀在現場節點執行，平台接收的是數值與事件，而不是把整天的錄影搬上雲。' },
      { title: '權限分級、可簽保密協議', body: '平台帳號依角色分級授權，誰能看什麼由你決定；導入前可簽 NDA，資料存放方式白紙黑字約定。' },
    ],
  },
  contact: {
    title: '一封信，看你的工廠適不適合。',
    body: '告訴我們你的產業與廠區規模，我們會盡快回覆，並安排到廠評估。',
    mailSubject: '%E9%A0%90%E7%B4%84%E5%88%B0%E5%BB%A0%E8%A9%95%E4%BC%B0',
    teamLine: '第四面牆 4WALL AI｜成大跨領域團隊（電機 × 建築 × 資管）｜台南',
  },
  footer: {
    blurb: '工廠與工地的空間智慧平台：3D 鏡像工廠、AI 值班代理、儀表判讀、事件追蹤與 LINE 通報。',
    location: '台南｜國立成功大學',
    rights: '© 2026 第四面牆 4WALL AI. All rights reserved.',
  },
}

const en: typeof zh = {
  meta: {
    title: '4WALL AI | A Factory That Answers — 3D Mirror Factory & AI Duty Agent',
    description:
      '4WALL AI brings machines, gauges, people and incidents into one 3D mirror factory: ask in one sentence and get answers grounded in live data, while the AI agent keeps watch and reports anomalies proactively. Running in production at an injection-molding plant in Tainan, Taiwan.',
  },
  nav: {
    services: 'What it does',
    day: 'A day on duty',
    caseStudy: 'Live deployment',
    pricing: 'Pricing',
    security: 'Data protection',
    contact: 'Contact',
    login: 'Platform login',
    langSwitch: '中文',
    langHref: '/official',
  },
  hero: {
    title: 'A factory that answers.',
    subtitle:
      '4WALL brings your machines, gauges, people and incidents into one live 3D mirror factory. Ask a question in chat and get an answer grounded in real-time data — and when nobody is asking, the AI keeps watch for you.',
    ctaPrimary: 'Book an on-site assessment',
    ctaSecondary: 'See how it works',
  },
  warRoom: {
    badge: 'SUPERVISOR AGENT · ON DUTY',
    chatTitle: 'Factory chat',
    chatState: 'AI agent online',
    userMsg: 'Send a technician to HC600-01',
    agentMsg: 'Assigned technician → HC600-01 molding machine; repair started. Position marked on the big screen.',
    machineName: 'HC600-01 molding machine',
    statusLabel: 'Running',
    metrics: [
      { k: 'OEE', v: '86%' },
      { k: 'Output today', v: '414' },
      { k: 'Cycle', v: '32s' },
      { k: 'Alerts today', v: '2' },
    ],
    gaugesTitle: 'Live gauge reads · from on-site cameras',
    gauges: [
      { label: 'PRESS AM METER', value: '9.7 A', note: 'read confidence 38%' },
      { label: 'FLOW AM METER', value: '4.1 A', note: 'read confidence 26%' },
      { label: 'HC600 barrel zone 1', value: '205.0°C', note: 'read confidence 70%' },
    ],
    caption: 'Content from the live production system · Jing-Cheng 7-machine plant, Tainan',
    imageAlt:
      '4WALL 3D mirror-factory war room: AI dispatch chat on the left, live 3D factory in the center, HC600-01 machine gauges and meter reads on the right',
  },
  lineQa: {
    botName: '4WALL AI · Factory assistant',
    messages: [
      { from: 'user', text: 'Give me current machine status and the assigned technicians' },
      {
        from: 'bot',
        text: 'Running: HC600-01, 03, 04, 06. Idle: HC600-02, 07. Maintenance: HC600-05. Technicians — Zhi-Qiang (maintenance) at HC600-06; A-Hua (molding) at HC600-03.',
      },
    ],
  },
  proactiveAlert: {
    botName: '4WALL AI · Proactive alert',
    tag: 'Machine alert',
    title: 'HC600-01 molding machine · temperature anomaly',
    body: 'Mold temperature exceeded the limit twice in a row — pushed to the LINE group automatically.',
    dispatch: 'Technician Zhi-Qiang dispatched',
    time: '08:01',
  },
  stats: [
    { value: '7 machines', label: 'Injection-molding plant, Tainan' },
    { value: '3 cameras', label: 'Read by AI around the clock' },
    { value: '3 days → 3 hrs', label: 'Incident resolution time' },
    { value: '< 3 months', label: 'Customer payback (measured on-site)' },
  ],
  problemsHeading: 'Problems every plant owner knows',
  problems: [
    { title: 'Six systems, six silos', body: 'ERP, CCTV, spreadsheets and chat groups each tell a different story. When something breaks, you reconstruct events after the fact.' },
    { title: 'Anomalies surface too late', body: 'Smoke on the night shift, a drifting gauge, a stopped machine — when nobody is watching, nobody knows.' },
    { title: 'Away from the plant, it is a black box', body: 'Visiting customers or traveling abroad, your only window into the factory is one phone call at a time.' },
    { title: 'Veteran judgment walks out the door', body: 'Inspection know-how lives in senior staff. When they leave, the experience leaves with them.' },
  ],
  services: {
    title: 'Not a seventh dashboard — an AI that stands watch.',
    subtitle:
      'Machines, gauges, people and events live in one 3D digital twin. No new software to learn: ask in chat and it answers; when something goes wrong, it speaks first.',
    cards: [
      {
        title: 'Ask, and it answers',
        body: '“What’s the machine status? Who’s on repair?” — ask in chat and the AI answers from live plant data, highlighting the answer in 3D.',
        image: '/official-assets/line-qa-live.webp',
        alt: 'Real LINE chat: a supervisor asks machine status, the AI replies with each machine’s state and the assigned technicians',
        width: 483,
        height: 512,
        contain: true,
      },
      {
        title: 'Nobody asks — it reports anyway',
        body: 'Temperature anomalies, gauge excursions, machine stoppages: the AI is on duty all day and pushes alerts to your chat group, night shift included.',
        mock: 'alert' as const,
      },
      {
        title: 'Gauges and paper forms, read by AI',
        body: 'Legacy equipment with no digital output? Cameras watch gauges, HMI screens and paper dispatch sheets. No machine retrofits, no PLC wiring, no downtime.',
        image: '/official-assets/materials-detection.jpg',
        alt: 'AI recognizing on-site materials and equipment status',
        width: 1200,
        height: 896,
      },
      {
        title: 'Every incident, start to finish',
        body: 'Each anomaly becomes a tracked incident — confirmed, assigned, handled, closed. Who fixed it and how long it took is always on record.',
        image: '/official-assets/safety-detection.jpg',
        alt: 'AI detecting personnel position and safety status on the factory floor',
        width: 1195,
        height: 896,
      },
    ],
    engineNote:
      'Under the hood is our own 4WALL Industrial Data Engine — recognition models pre-trained on simulated events, so the system knows what smoke looks like even if your plant has never had a fire.',
  },
  day: {
    title: 'A day on duty, so you don’t have to be.',
    subtitle: 'Every step below is live in our production deployment in Tainan.',
    steps: [
      { time: '07:30', title: 'Proactive morning brief', body: '“Night shift: 2 mold-temperature anomalies on machine 3.” The agent worked the night shift; key frames are already saved.' },
      { time: '08:00', title: 'One-sentence query', body: '“What happened last night?” → the 3D twin highlights the affected machine with a full event timeline.' },
      { time: '09:30', title: 'Assign and resolve', body: 'Dispatch maintenance from chat; the AI tracks progress and logs the repair automatically.' },
      { time: '10:00', title: 'Back to your business', body: 'You go meet customers. The factory’s eyes — and its duty officer — stay online.' },
    ],
  },
  caseStudy: {
    heading: 'Real plant. Really running.',
    subheading: 'Not a concept demo — the numbers below come from a system in production.',
    tag: 'LIVE DEPLOYMENT',
    name: 'Jing-Cheng Enterprise | Tainan · Injection molding',
    body: '3 cameras and 8 semantic zones deployed across a 7-machine plant. AI reads HC600 HMI temperatures and analog gauges, paper dispatch sheets are structured from photos, machine status streams into the 3D mirror factory, and anomalies go straight to the team chat group.',
    chips: ['Incidents: 3 days → 3 hours', 'HMI & gauge auto-reading', 'Dispatch-sheet recognition', 'Real-time chat alerts'],
    imageAlt: 'Engineers reviewing factory camera feeds and AI readings in a control room',
  },
  partnersTag: 'Partners',
  partners: [
    {
      name: 'NCKU Dept. of Architecture',
      tag: 'Technical partner | BIM & spatial modeling',
      body: 'Long-term collaboration on construction-site inspection, BIM/3D site models and field data workflows.',
    },
    {
      name: 'Anger Technology',
      tag: 'Strategic partner | AIoT integration',
      body: 'Sensing-solution provider of the Egis Group; AIoT hardware-software integration underway.',
    },
  ],
  pricing: {
    title: 'Pricing',
    subtitle: 'Subscription per plant. Final quotes depend on plant size and scope — email us for a full proposal.',
    tiers: [
      {
        name: 'Spatial OS Base',
        price: 'From NT$8,000 / month',
        setup: 'Setup from NT$24,000',
        body: '3D mirror factory, AI gauge & dispatch-sheet reading, incident tracking, chat alerts and one-sentence queries.',
        highlight: true,
      },
      {
        name: 'Indoor positioning add-on',
        price: 'NT$3,000–5,000 / month',
        setup: 'Setup NT$18,000–25,000',
        body: 'UWB positioning: people, assets and mobile robots synced live into the mirror factory.',
        highlight: false,
      },
      {
        name: 'AMR add-on',
        price: 'NT$5,000–8,000 / unit / month',
        setup: 'NT$80,000–120,000 / unit',
        body: 'SLAM-free, BIM-native autonomous mobile robots navigating directly on your plant model.',
        highlight: false,
      },
    ],
    roi: 'Measured on our live deployment, customer payback is under 3 months. A single missed anomaly often costs more than a year of subscription.',
  },
  onboarding: {
    title: 'Three steps to go live, measured in weeks.',
    subtitle: 'No production-line changes, no rewiring — we handle survey to go-live on site.',
    steps: [
      { title: 'Site survey & 3D scan', body: 'LiDAR scanning builds your plant’s 3D model directly — no CAD drawings needed, decades-old plants included, production unaffected.' },
      { title: 'Deploy cameras & edge readers', body: 'Cameras aimed at gauges, HMI screens and dispatch sheets — no machine retrofits, no downtime.' },
      { title: 'Go live, get alerts', body: 'The mirror factory comes online. Anomalies reach your chat group; any question is one sentence away.' },
    ],
  },
  security: {
    title: 'Your factory data belongs to you.',
    subtitle: 'Before watching your production line, we spell out how the data is protected.',
    points: [
      { title: 'Anonymous people detection', body: 'The system computes “someone is at this position” only — no face recognition, no identity tracking, no personal data stored.' },
      { title: 'Reading happens on site', body: 'AI reading of gauges and screens runs on on-site nodes; the platform receives values and events — not a day’s worth of raw footage.' },
      { title: 'Role-based access, NDA available', body: 'Platform accounts are permissioned by role — you decide who sees what. NDAs and data-residency terms in writing before rollout.' },
    ],
  },
  contact: {
    title: 'One email to see if your plant is a fit.',
    body: 'Tell us your industry and plant size — we will get back to you promptly and arrange an on-site assessment.',
    mailSubject: 'On-site%20assessment%20inquiry',
    teamLine: '4WALL AI | Cross-disciplinary team from NCKU (EE × Architecture × IM) | Tainan, Taiwan',
  },
  footer: {
    blurb: 'Spatial intelligence for factories and construction sites: 3D mirror factory, AI duty agent, gauge reading, incident tracking and chat alerts.',
    location: 'Tainan, Taiwan | National Cheng Kung University',
    rights: '© 2026 4WALL AI. All rights reserved.',
  },
}

export const officialContent: Record<OfficialLocale, typeof zh> = { zh, en }
