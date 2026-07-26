export type OfficialLocale = 'zh' | 'en'

const zh = {
  meta: {
    title: '4WALL AI｜工廠地端 AI、機台資料整合與生產最佳化',
    description:
      '4WALL AI 協助工廠匯出並整合機台資料，透過地端 AI 分析設備與生產狀態，提升稼動率、協助最佳化排程，並建立可追溯的產品履歷。',
  },
  nav: {
    services: '產品能力',
    day: '運作方式',
    caseStudy: '導入案例',
    pricing: '方案費用',
    security: '資料保護',
    contact: '聯絡我們',
    login: '進入管理平台',
    langSwitch: 'EN',
    langHref: '/official/en',
  },
  hero: {
    title: '讓機台資料真正用來改善生產。',
    subtitle:
      '4WALL AI（第四面牆）協助工廠匯出並整合既有機台資料，透過工廠地端 AI 持續分析設備與生產狀態，協助提升稼動率、最佳化生產排程，並為每批產品建立完整的製造履歷。從機台、PLC、HMI、儀表、攝影機到紙本派工單，分散的現場資訊都能逐步整理成可查詢、分析與持續改善的生產資料。',
    ctaPrimary: '預約到廠評估',
    ctaSecondary: '查看導入方式',
  },
  warRoom: {
    badge: '工廠地端 AI・持續分析中',
    chatTitle: '現場查詢',
    chatState: '資料更新中',
    userMsg: 'HC600-01 目前為什麼停機？',
    agentMsg: 'HC600-01 於 08:01 停機，現場已指派負責人處理。系統會持續追蹤並記錄確認結果。',
    machineName: 'HC600-01 成型機',
    statusLabel: '運轉中',
    metrics: [
      { k: 'OEE', v: '86%' },
      { k: '今日產量', v: '414' },
      { k: '週期', v: '32 秒' },
      { k: '今日告警', v: '2' },
    ],
    gaugesTitle: '現場設備判讀結果',
    gauges: [
      { label: 'PRESS AM METER', value: '9.7 A', note: '讀表信心 38%' },
      { label: 'FLOW AM METER', value: '4.1 A', note: '讀表信心 26%' },
      { label: 'HC600 料管一段', value: '205.0°C', note: '讀表信心 70%' },
    ],
    caption: '台南靚程射出成型工廠現場，畫面由廠內攝影機取得',
    imageAlt:
      '4WALL AI 在射出成型工廠整合機台與現場生產資料',
  },
  lineQa: {
    botName: '4WALL AI・工廠查詢',
    messages: [
      { from: 'user', text: '目前哪些機台停機？處理進度到哪裡？' },
      {
        from: 'bot',
        text: '目前 HC600-05 維護中，其他已開通機台持續回報狀態。主管可在 LINE 或管理平台查看異常原因、負責人與最新處理紀錄。',
      },
    ],
  },
  proactiveAlert: {
    botName: '4WALL AI・主動通知',
    tag: '機台告警',
    title: 'HC600-01 成型機溫度異常',
    body: '系統偵測到模溫連續 2 次超標，異常資訊已推送到 LINE 群組。',
    dispatch: '已指派負責人前往處理',
    time: '08:01',
  },
  stats: [
    { value: '7 台機台', label: '台南射出成型工廠實際部署' },
    { value: '3 支攝影機', label: '協助取得現場設備資料' },
    { value: '3 天 → 3 小時', label: '異常處理時間' },
    { value: '< 3 個月', label: '客戶端投資回收（依現有案例計算）' },
  ],
  problemsHeading: '工廠資料很多，卻很難真正用來改善生產',
  problems: [
    {
      title: '資料被鎖在不同機台裡',
      body: '不同年代、不同品牌的機台各有自己的資料格式。有些設備只能從機台 HMI 操作畫面或儀表查看，難以集中分析。',
    },
    {
      title: '稼動率下降，卻找不到真正原因',
      body: '停機、待機、換線與人員處理時間散落在不同紀錄裡。主管只能看到結果，很難還原損失發生的過程。',
    },
    {
      title: '排程跟不上現場變化',
      body: '生產計畫完成後，現場仍會遇到插單、停機、缺料與進度落後。資訊更新不夠即時，排程只能靠人員不斷協調。',
    },
    {
      title: '品質問題發生後難以回查',
      body: '機台參數、派工紀錄、異常與批次資訊分散在紙本、Excel 和不同系統中。出現品質問題時，製造過程需要重新拼湊。',
    },
  ],
  services: {
    title: '把分散的工廠資料，整理成改善生產的依據。',
    subtitle:
      '4WALL AI 從機台與現場取得資料，再由部署在工廠內的 AI 運算節點持續分析。主管可以掌握設備狀態、找出稼動率損失、調整生產排程，並逐步建立每批產品的製造履歷。',
    cards: [
      {
        title: '讓既有機台資料可以被使用',
        body: '4WALL AI 協助工廠從既有機台、PLC、HMI、儀表與其他現場設備取得資料，再將不同格式整理成一致的生產狀態。設備缺乏數位介面時，也可透過攝影機辨識儀表與操作畫面，減少更換機台的成本。',
        image: '/official-assets/factory-floor-live.webp',
        alt: '射出成型工廠內的機台與生產現場',
        width: 2304,
        height: 1296,
      },
      {
        title: '生產資料留在工廠，由地端 AI 持續分析',
        body: '地端 AI 是部署在工廠現場的運算與分析能力。系統可持續整理機台狀態、異常事件與生產進度，並同步管理所需的結構化結果；網路不穩時，現場節點仍可保留既有的分析流程。',
        image: '/official-assets/industrial-data-engine-control-room.webp',
        alt: '工廠人員在現場檢視設備與生產狀態',
        width: 1672,
        height: 941,
      },
      {
        title: '找出機台為什麼沒有持續生產',
        body: '系統持續記錄運轉、待機、停機、換線與異常事件，協助主管看見稼動率損失發生在哪一台設備、哪一個時段，以及可能的現場原因。完整事件紀錄也能用來比較重複發生的損失。',
        image: '/official-assets/line-qa-live.webp',
        alt: '主管透過 LINE 查詢機台狀態與異常處理進度',
        width: 483,
        height: 512,
        contain: true,
      },
      {
        title: '讓排程跟著真實現場調整',
        body: '排程可以參考設備狀態、目前進度、異常、換線與人員處理情況。機台停機或訂單進度改變時，系統提供重新安排生產順序的依據，由主管確認後調整，降低等待與空轉時間。',
        mock: 'alert' as const,
      },
      {
        title: '每批產品的製造過程都能回查',
        body: '系統可依生產批次整理製造時間、使用機台、製程參數、派工紀錄、異常事件與處理結果，持續形成可追溯的產品履歷。遇到品質問題時，管理者能更快回查當時的設備與現場狀況。',
        image: '/official-assets/dashboard-bim.webp',
        alt: '4WALL AI 平台整理設備、批次與製程事件紀錄',
        width: 1254,
        height: 1254,
      },
    ],
    engineNote:
      '工業現場資料引擎（4WALL Industrial Data Engine）負責整合機台、攝影機與事件資料，將不同來源轉換成可比較的生產狀態。LINE 是主管查詢與接收通知的入口；3D 鏡像工廠則以 3D 廠區模型呈現設備、位置與即時事件。',
  },
  day: {
    title: '從資料取得到異常結案，現場狀態持續累積。',
    subtitle: '系統先掌握機台與生產狀態，再發現異常、說明原因、指派處理、再次確認並產出紀錄。',
    steps: [
      {
        time: '07:30',
        title: '取得資料並發現異常',
        body: '現場運算節點持續整理設備狀態。系統發現夜班模溫異常後，保留發生時間、設備與關鍵畫面。',
      },
      {
        time: '08:00',
        title: '說明原因與影響',
        body: '主管可從平台或 LINE 查詢昨晚狀況。系統依現場資料說明受影響機台、事件時間軸與目前生產進度。',
      },
      {
        time: '09:30',
        title: '指派負責人處理',
        body: '異常資訊推送到 LINE 群組後，主管可以指派負責人。系統持續追蹤處理進度與排程影響。',
      },
      {
        time: '10:00',
        title: '再次確認並留下紀錄',
        body: '處理完成後，系統記錄完成時間與確認結果。事件資料會繼續累積，作為稼動率分析、排程調整與產品履歷的一部分。',
      },
    ],
  },
  caseStudy: {
    heading: '已在台南射出成型工廠實際部署。',
    subheading: '以下資料來自目前正式使用的導入案例，呈現系統如何取得現場資料並支援營運管理。',
    tag: '實際部署案例',
    name: '靚程企業｜台南射出成型工廠',
    body: '4WALL AI 在 7 台射出機的生產場域整合機台 HMI、指針電表、3 支攝影機、紙本派工單與 8 個語意分區。地端 AI 持續整理設備狀態與現場事件，協助主管掌握設備運轉狀況、提供排程調整依據，並逐步建立批次與製程履歷。異常發生時，系統會將資訊推送到 LINE 群組，並留下指派、處理與結案紀錄。',
    chips: ['異常處理 3 天 → 3 小時', '設備狀態持續整理', '派工單與 HMI 判讀', 'LINE 群組主動通知'],
    imageAlt: '4WALL AI 管理平台顯示工廠設備、現場事件與機台判讀結果',
  },
  partnersTag: '合作機構',
  partners: [
    {
      name: '成大建築系',
      tag: '技術合作｜BIM 與建築空間模型',
      body: '共同研究 BIM 與 3D 場域模型整合，以及空間資料在現場管理流程中的應用。',
    },
    {
      name: '安格科技',
      tag: '策略合作｜AIoT 軟硬整合',
      body: '神盾集團感測方案商，雙方持續推進 AIoT 軟硬體整合合作。',
    },
  ],
  pricing: {
    title: '方案費用',
    subtitle: '方案以廠區為單位，實際費用依機台數量、資料來源與導入範圍評估。',
    tiers: [
      {
        name: '4WALL 現場管理平台',
        price: '月費 NT$8,000 起',
        setup: '建置費 NT$24,000 起',
        body: '包含現場資料整合、設備狀態管理、異常事件追蹤、LINE 群組通知與 3D 廠區操作介面。實際功能依資料可取得程度確認。',
        highlight: true,
      },
      {
        name: '室內定位加購',
        price: '月費 NT$3,000–5,000',
        setup: '建置費 NT$18,000–25,000',
        body: 'UWB 室內定位可將人員、資產與搬運車的位置同步至管理平台。',
        highlight: false,
      },
      {
        name: 'AMR 自主搬運車加購',
        price: '月費 NT$5,000–8,000／台',
        setup: '建置費 NT$80,000–120,000／台',
        body: '依廠區模型與現場條件規劃搬運路徑，實際導入範圍需經到廠評估。',
        highlight: false,
      },
    ],
    roi: '依目前正式案例計算，客戶端投資回收少於 3 個月。不同工廠的設備、流程與改善目標不同，實際回收時間需另行評估。',
  },
  onboarding: {
    title: '從資料盤點到上線，以週為單位完成導入。',
    subtitle: '我們會先確認機台與資料來源，再規劃現場運算節點、管理平台與通知流程。',
    steps: [
      {
        title: '盤點機台與生產資料',
        body: '到廠確認機台品牌、PLC、HMI、儀表、派工單與既有系統，找出可取得的資料及最適合先改善的問題。',
      },
      {
        title: '部署現場運算與資料整合',
        body: '依設備條件設定資料取得方式，並部署工廠地端 AI。需要時可加入攝影機或 3D 廠區模型，不必為了導入而全面更換機台。',
      },
      {
        title: '驗證結果並開始使用',
        body: '與現場主管確認設備狀態、事件與通知是否正確，再逐步導入稼動率分析、排程調整依據及產品履歷。',
      },
    ],
  },
  security: {
    title: '敏感生產資料優先留在工廠。',
    subtitle: '機台參數、產量、製程與影像都是重要資料。4WALL AI 可先在現場運算節點完成資料整理與事件判讀，再將管理所需的結果同步至平台。',
    points: [
      {
        title: 'AI 分析在工廠現場執行',
        body: '儀表、機台畫面與事件分析可由工廠內的運算節點執行，降低對外部網路的依賴，也避免原始資料全部離開現場。',
      },
      {
        title: '只同步管理所需的結果',
        body: '平台優先接收設備狀態、數值與事件等結構化結果。人員偵測維持匿名，不做人臉辨識，也不以系統追蹤個人身分。',
      },
      {
        title: '依角色管理資料權限',
        body: '平台帳號可依角色分級授權，工廠可決定不同人員能查看的範圍。導入前也可簽署 NDA，明確約定資料處理與存放方式。',
      },
    ],
  },
  contact: {
    title: '先找出你的機台資料能怎麼用。',
    body: '告訴我們產業類型、機台數量與品牌，以及目前如何記錄生產與停機。我們會協助評估資料取得方式，並確認稼動率、排程或產品履歷最適合從哪裡開始。',
    mailSubject: '%E9%A0%90%E7%B4%84%E5%88%B0%E5%BB%A0%E8%A9%95%E4%BC%B0',
    teamLine: '4WALL AI（第四面牆）｜成大跨領域團隊（電機 × 建築 × 資管）｜台南',
  },
  footer: {
    blurb: '協助製造業整合機台與現場資料，透過工廠地端 AI 改善稼動率、提供生產排程調整依據，並建立可回查的產品履歷。',
    location: '台南｜國立成功大學',
    rights: '© 2026 4WALL AI（第四面牆）. All rights reserved.',
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
