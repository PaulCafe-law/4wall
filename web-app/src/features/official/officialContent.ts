// All copy for www.4wall.io (zh at /, en at /en).
//
// Public-copy policy (founder decision, 2026-10; supersedes the earlier
// "label every number as an estimate" policy — do not add disclaimers back):
// 1. A marketing page sells. Write what the product does and what the customer
//    gets, framed around the planning decisions a goods-to-person AGV warehouse
//    makes (peak capacity, AGV fleet, open stations, queue slots, operating
//    rules, storage and flow).
// 2. No negative narrative about the product: no limitations, disclaimers or
//    "cannot / not yet / not supported / does not ..." lines. Reframe a fact into
//    a true capability or leave it out. A selling point that happens to use a
//    negation ("no floor plan needed") is fine.
// 3. 4WALL AI is a simulator: never frame results around field calibration,
//    field measurement or field results.
// 4. Never name the AI model or its vendor. Data handling is described by what
//    the system does; full details are provided on request.
// 5. No unpackaged labels ("illustrative" stamps, "not a forecast" footers).
//    Every UI label is a finished, positive product label, or it is removed.
// 6. Rigor (same orders, three runs averaged, error ranges, one-click simulator
//    replay, source tracing, versioning) is presented as a strength, never as a caveat.
// Truth floor (still binding): every claim traces back to the warehouse
// system's own code and docs (see docs/official-warehouse-redesign.md). No
// invented numbers, improvement figures, customer names, pricing, "optimal",
// "accurate" or "guaranteed" claims, and nothing that implies the product runs
// AGVs or the floor. Formal Taiwanese B2B voice in zh; crisp, natural B2B
// English in en with the same meaning. officialCopy.lint.test.ts guards the
// forbidden phrases.
//
// Inline links: `{text}` renders as a "book a demo" mailto link and
// `{text|email}` as a plain mailto link to the contact address.

export type OfficialLocale = 'zh' | 'en'

export type TextRun = { text: string; accent?: boolean }

const zh = {
  meta: {
    title: '4WALL AI｜倉庫的每個決定，先在電腦裡跑一遍',
    description:
      '上傳設施清單、平面圖或倉庫簡報，AI 即生成可旋轉、可對話修改的 3D 倉庫；再以模擬比較作業規則，並由 AI 快判數秒試算 AGV 台數、開站數與站前排隊對 KPI 的影響，事先掌握尖峰訂單能否消化。',
    ogTitle: '倉庫的每個決定，先在電腦裡跑一遍｜4WALL AI',
    ogDescription: '以現有的設施清單、平面圖或簡報建立 3D 倉庫，透過對話修改，再以模擬比較作業規則，數秒試算 AGV 台數與開站數。',
    ogImage: '/official-assets/og-4wall-warehouse-zh.png',
    ogImageAlt: '4WALL AI：倉庫平面圖轉為 3D 倉庫，標題為「倉庫的每個決定，先在電腦裡跑一遍。」',
    ogLocale: 'zh_TW',
    ogLocaleAlternate: 'en_US',
    organizationDescription:
      '4WALL AI 開發倉庫數位分身與 AGV 倉儲模擬：依據設施清單、平面圖或倉庫簡報生成 3D 倉庫並以對話修改，再以模擬比較貨到人倉庫的作業規則，由 AI 快判數秒預測 KPI，並以模擬器一鍵驗算，協助規劃尖峰產能、AGV 台數與工作站配置。',
    serviceName: '倉庫數位分身與模擬比較',
    serviceType: '倉儲模擬與規劃',
    serviceDescription: '上傳資料、生成 3D 倉庫、對話修改、模擬比較、AI 快判 KPI 與模擬器驗算。',
    ogImageText: {
      eyebrow: '倉庫數位分身',
      stamp: '倉儲模擬',
    },
  },
  skip: '跳至主要內容',
  cta: {
    demo: '預約示範',
    demoAria: '預約示範（寄信至 admin@4wall.io）',
    start: '開始使用 →',
    startAria: '開始使用（前往 platform.4wall.io）',
    login: '登入',
    loginLong: '登入平台',
    loginAria: '登入（前往 platform.4wall.io）',
  },
  mail: {
    subject: '預約示範｜4WALL AI 倉庫模擬',
    body: [
      '公司名稱／倉庫類型：',
      'AGV 台數／工作站數（貨到人）：',
      '希望優先評估的決策（例如尖峰產能、開站數）：',
      '尖峰日訂單量（概略即可）：',
      '現有資料（設施清單／平面圖／簡報／訂單資料）：',
      '方便聯絡的時段：',
    ],
  },
  copyEmail: {
    label: '複製信箱',
    done: '已複製',
    aria: '複製信箱 admin@4wall.io',
    live: '信箱已複製',
  },
  motion: {
    pause: '暫停動畫',
    play: '播放動畫',
  },
  stamp: {
    illustrativeAnim: '流程導覽',
    forecast: '數秒預測',
    estimated: '推估',
    interp: 'AI 即時預測',
    outOfRange: '延伸設定 · 一鍵交由模擬器重演',
    verify: '5 座以上 · 一鍵交由模擬器驗算',
  },
  nav: {
    label: '主要導覽',
    homeAria: '4WALL AI 首頁',
    items: [
      { href: '#flow', label: '產品流程' },
      { href: '#numbers', label: '應用情境' },
      { href: '#how', label: '合作方式' },
      { href: '#faq', label: '常見問題' },
    ],
    lang: 'EN',
    langAria: 'English version',
    langHref: '/en',
    langCode: 'en',
    menu: '選單',
    close: '關閉選單',
    menuLabel: '網站選單',
  },
  hero: {
    eyebrow: '4WALL AI · 倉庫數位分身',
    h1: [[{ text: '倉庫的每個決定，' }], [{ text: '先在' }, { text: '電腦裡', accent: true }, { text: '跑一遍。' }]] as TextRun[][],
    sub: '上傳設施清單、平面圖或倉庫簡報，由 AI 生成 3D 倉庫，可旋轉檢視、以對話修改。加入作業資料後，即可模擬尖峰訂單能否消化、工作站是否壅塞、AGV 是否互相阻擋，先看清結果，再決定現場如何調整。',
    note: '› 沒有平面圖，也能先建立 3D 倉庫。',
    microStart: '開始使用 → platform.4wall.io',
    microEmail: '或來信洽詢：',
    scrollCue: '向下捲動，平面圖將轉為 3D 倉庫',
  },
  stage: {
    srIntro: '以下六個步驟搭配流程動畫：倉庫平面圖轉為 3D 倉庫，接著依序呈現對話修改、模擬比較、AI 快判與模擬器驗算。',
    railLabel: '產品流程步驟',
    rail: ['上傳', '生成', '修改', '比較', '快判', '驗算'],
    railAria: ['第 1 步：上傳資料', '第 2 步：生成 3D 倉庫', '第 3 步：對話修改', '第 4 步：模擬比較', '第 5 步：AI 快判', '第 6 步：模擬器驗算'],
    legendPlan: '圖 00／06 · 平面圖 · 1 格 = 1 公尺',
    legendSteps: ['上傳資料', '生成 3D 倉庫', '對話修改', '模擬比較', 'AI 快判', '模擬器驗算'],
    legendPattern: '圖 {k}／06 · {name} · 1 格 = 1 公尺',
    legendHeat: ' · 熱區標示壅塞位置',
    skip: '跳過流程動畫 ↓',
  },
  intro: {
    eyebrow: '00 / 06 · 開始之前',
    h2: ['實體倉庫只有一座，', '電腦裡可以反覆試驗各種方案。'],
    fit: '4WALL AI 將現有的倉庫資料轉為可對話修改的 3D 倉庫。模擬比較與 AI 快判專為貨到人 AGV 倉庫打造：由 AGV 將料架送達工作站，揀貨人員在站內完成揀貨。',
    fitLink: '了解適用的倉庫型態 ↓',
  },
  steps: [
    {
      id: 'step-01',
      eyebrow: '01 / 06 · 上傳資料',
      h3: '從現有資料開始。',
      body: '設施清單（Excel、CSV）、平面圖或倉庫簡報（PDF、PPTX、照片）皆可直接上傳，簡報內的影片畫面也會一併判讀。平面圖為選填，大型清單也能完整處理。',
      spec: 'PPTX · PDF · XLSX · CSV（UTF-8／Big5）· JPG · PNG · 每次最多 20 份',
    },
    {
      id: 'step-02',
      eyebrow: '02 / 06 · 生成 3D 倉庫',
      h3: 'AI 判讀資料，生成 3D 倉庫。',
      body: '按下「建立 3D 倉庫」，AI 即判讀表格與圖面、自動對應欄位與單位，產生可旋轉、縮放與點選的參數化 3D 倉庫。沒有座標的設施，系統會自動排出建議位置並標示「推估」；每項設施皆可追溯至來源檔案與列號，並可展開檢視 AI 的判讀依據。',
      note: '料架尺寸、層數與位置皆為可調參數，隨時以一句話修改。',
      isoFallbackAlt: '由同一張平面圖生成的 3D 倉庫：料架以青綠色線框表示，推估位置的料架以虛線標示。',
    },
    {
      id: 'step-03',
      eyebrow: '03 / 06 · 對話修改',
      h3: '輸入一句話，即可修改。',
      body: '在 3D 畫面旁以對話調整尺寸、位置與層數，可指定單一設施或整類設施；附上 CSV、XLSX、PDF 或圖片，AI 即依附件批次更新。批次修改整批檢核後一次套用，資料始終一致；每次修改皆存為新版本，可隨時復原，並可下載倉庫資料（JSON）。',
    },
    {
      id: 'step-04',
      eyebrow: '04 / 06 · 模擬比較',
      h3: '同一批訂單、兩套作業規則，各模擬 3 次。',
      body: '以同一批出貨訂單與補貨單，在模擬器中分別執行「比較基準」與「調整方案」兩套作業規則，各 3 次並取平均值。完成件數、AGV 搬運距離、工作站等候時間與待完成工作並列比較，結果頁直接指出兩案的規則差異，再以 3D 回放、熱區圖與工作站分析找出瓶頸。',
      note: '內建 24 條作業規則，整理自公開研究，涵蓋出貨訂單分配、揀貨料架選擇、料架回庫、補貨單分配與補貨料架選擇，每條皆附白話說明；也可依目標一鍵套用規則組合，例如減少 AGV 搬運距離或提高完成件數。',
    },
    {
      id: 'step-05',
      eyebrow: '05 / 06 · AI 快判',
      h3: '數秒內預測 9 項 KPI。',
      body: '選定訂單批次、AGV 台數與開站數，AI 快判即在數秒內預測 9 項 KPI，並與現行做法並列比較；也可一次比較上百種作業規則組合，提出穩定的建議做法，並列出值得以模擬器驗算的潛力方案。',
      badgeNote: '每項 KPI 預測皆附一般誤差範圍，建議做法可一鍵交由模擬器驗算。',
      caveat: 'AI 快判以您倉庫的作業資料專屬訓練，預測結果反映您的料架配置、訂單結構與設備規模。',
    },
    {
      id: 'step-06',
      eyebrow: '06 / 06 · 模擬器驗算',
      h3: 'AI 快速預測，模擬器完整驗算。',
      body: 'AI 提出的建議可一鍵送入模擬器，以同一批訂單完整重演，約需一到數分鐘。AI 預測與模擬器結果並列對照，並附依計算結果撰寫的白話說明，選定方案前即有充分依據。',
      end: '想了解六個步驟的實際操作，歡迎預約示範 →',
    },
  ],
  ticket: {
    title: '收貨單 · DOCK 00',
    rows: ['設施清單.xlsx', '倉庫平面圖.pdf', '倉庫簡報.pptx', '現場照片.jpg'],
    done: '✓ 已判讀',
    pending: '… 判讀中',
    found: '已辨識：料架 · 揀貨站 · 牆 · 柱 · 門 · 區域 · AGV · 充電位 · 設備',
    footer: '4 份檔案 · 每次最多 20 份',
  },
  chat: {
    groupAria: '對話修改體驗',
    header: '對話修改 · 互動體驗',
    version: '版本 {n}',
    chips: ['A01 高度改成 4 公尺', 'B 排料架往右移一格', '附件：料架高度.xlsx'],
    replyA01: '✓ 已套用 · 版本 {n} · 可復原',
    replyBMove: '✓ 已套用 · B 排料架右移 1 格 · 版本 {n}',
    replyBatch: '✓ 已依附件批次更新 12 座料架高度 · 版本 {n}',
    replyUndo: '↺ 已還原為版本 {from} 的內容 · 另存為版本 {n}',
    parsing: '解析中…',
    fallback: '網頁體驗版提供下方三句指令與「復原」；如需體驗完整的對話修改功能，歡迎{預約示範 →}',
    undo: '復原',
    undoWords: ['復原', 'undo'],
    placeholder: '輸入一句話修改倉庫…',
    inputAria: '輸入修改指令',
    send: '送出',
    footer: '點選指令或直接輸入，即可體驗對話修改',
    you: '您',
    system: '4WALL AI',
  },
  zebra: {
    title: '加入作業資料，即可開始模擬',
    body: '匯入 AGV 路網、料架與庫存、訂單，以及 AGV 與工作站規則，3D 倉庫即可進入模擬比較；系統會自動檢查並列出待補項目。{預約示範}時，我們協助您盤點並整理現有資料。',
  },
  score: {
    title: '模擬比較 · 3 次平均',
    cols: ['比較基準', '調整方案'],
    run: '第 {n}／3 次',
    rows: ['完成件數', 'AGV 搬運距離', '工作站等候時間', '待完成工作'],
    chips: ['方案較佳', '方案較佳', '持平', '基準較佳'],
    rowAria: '{row}：{chip}',
    footer: '同一批訂單 · 各項指標並列，取捨一目了然',
  },
  kpi: {
    scenario: '範例情境 · AGV 40 台 · 啟用 6 站 · 站前排隊 3 座',
    cards: [
      { label: '每小時揀貨行數', ends: ['少', '多'] },
      { label: '每行平均等候時間', ends: ['短', '長'] },
      { label: '最慢一成等候時間', ends: ['短', '長'] },
      { label: '每揀一件的 AGV 行駛距離', ends: ['短', '長'] },
    ],
    cardAria: '{label}：預測長條圖',
    chips: ['料架每次到站揀貨件數', '揀貨人員利用率', 'AGV 利用率', '站前平均排隊座數', '準時比例'],
  },
  slot: {
    label: '站前排隊座數',
    value: '{n} 座',
    valuetext: '站前排隊 {n} 座',
    stamp: '拖曳即時試算',
    static: '站前排隊可設定 1–8 座，此處以 3 座為例。',
    note: '在產品中，AI 快判可一次試算站前排隊 1–8 座，並標出等候時間趨於持平的座數，協助您決定站前該保留幾座。',
  },
  ruler: {
    aiLabel: 'AI 快判 · 數秒',
    simLabel: '模擬器重演 · 約一到數分鐘',
    rulerTag: '同一批訂單 · 完整重演驗算',
    progress: '模擬器重演中…',
    done: '✓ 重演完成',
    gap: '兩者並列對照',
    replay: '重新播放',
    aria: '手繪線條代表 AI 快判的預測，直尺線條代表模擬器重演；兩者並列對照，差距以括號標示。',
  },
  boss: {
    q: '這份結果可以向主管報告嗎？',
    a: '可以。結果摘要可一鍵複製，比較條件與主要指標一併整理，直接貼入內部報告或簡報；相同設定也能重現同一結果。',
  },
  spec: {
    eyebrow: '規格 · SPEC',
    line: '從上傳到驗算，六個數字看懂 4WALL AI。',
    items: [
      { num: '0', text: '張平面圖也能開始建立 3D 倉庫。' },
      { num: '6', text: '種檔案格式：PPTX、PDF、XLSX、CSV、JPG、PNG。' },
      { num: '24', text: '條內建作業規則，整理自公開研究。' },
      { num: '×3', text: '比較基準與調整方案各模擬 3 次並取平均。' },
      { num: '9', text: '項 KPI，AI 快判數秒內完成預測。' },
      { num: '1–8', text: '座站前排隊設定，拖曳滑桿即可試算。' },
    ],
  },
  board: {
    eyebrow: '應用情境',
    finePre: 'AI 快判提出的每項建議，都能一鍵交由模擬器完整重演：',
    bigLine: '數秒預測 · 完整驗算。',
    h2: '九項決策，都能先跑一遍。',
    intro: '從尖峰產能、作業規則到儲位與動線，以下決策皆可先以您的訂單與設施資料試算比較，再決定現場如何調整。',
    rules: [
      { shape: 'circle', title: '旺季尖峰，訂單能否如期消化？', body: '以尖峰時段的訂單批次模擬，完成件數與待完成工作並列呈現，旺季前先掌握產能。' },
      { shape: 'circle', title: 'AGV 台數增減，揀貨量如何變化？', body: '調整 AGV 台數，AI 快判數秒預測每小時揀貨行數與 AGV 利用率，再一鍵交由模擬器驗算。' },
      { shape: 'circle', title: '尖峰時段該開幾站？', body: '以 AI 快判比較不同開站數下的等候時間與揀貨人員利用率，工作站與人力安排更有依據。' },
      { shape: 'square', title: '出貨訂單該分配到哪一站？', body: '比較最早收到、最早到期、共同品項等訂單分配規則，檢視等候時間與站前排隊的變化。' },
      { shape: 'square', title: '揀貨時，該調哪一座料架到站？', body: '比較最近料架、需求最多、訂單等候最久優先等選擇規則，兼顧每次到站揀貨件數與 AGV 行駛距離。' },
      { shape: 'square', title: '補貨與揀貨，能否同時兼顧？', body: '出貨訂單與補貨單同時模擬，比較補貨單分配與補貨料架選擇規則，揀補合一工作站也能納入。' },
      { shape: 'triangle', title: '站前排隊該保留幾座？', body: '一次試算 1–8 座，對照等候時間與揀貨行數，並標出等候時間趨於持平的座數。' },
      { shape: 'triangle', title: '料架揀完，該回哪個儲位？', body: '比較固定儲位、最近儲位、靠近工作站等回庫規則，檢視 AGV 搬運距離與等候時間的變化。' },
      { shape: 'triangle', title: '料架調整後，動線是否順暢？', body: '以對話移動料架，再推演多台 AGV 路線並逐步回放，事先找出等候與互相阻擋之處。' },
    ] as Array<{ shape: 'circle' | 'square' | 'triangle'; title: string; body: string }>,
  },
  toolkit: {
    eyebrow: '延伸功能',
    h2: '主流程之外，另有六項工具。',
    caption: '主流程以外的功能',
    head: ['儲位', '功能', '用途'],
    rows: [
      { bin: 'B-01-01', name: '路徑規劃', text: '推演單台 AGV 最短路線與多台 AGV 協同路線，以 3D 逐步回放，事先找出等候或互相阻擋之處。' },
      { bin: 'B-01-02', name: '3D 素材庫', text: '內建料架、棧板、輸送帶、工作站、AGV 與 AMR 等參數化模板，也可匯入 GLB／USD 模型，或由 AI 依型錄與照片建立參數化素材。' },
      { bin: 'B-01-03', name: '方案探索', text: '模擬比較、AI 快判與路徑規劃集中管理，每次模擬皆保存紀錄，隨時開啟比對。' },
      { bin: 'B-02-01', name: '配置生成', text: '以一句話描述倉庫規模，AI 即排出 3D 配置並檢查走道與 AGV 可達性；擴建提案可將變動前後並列對照。' },
      { bin: 'B-02-02', name: '版本與溯源', text: '每次修改自動存成新版本，可隨時復原或下載 JSON；每項設施皆可追溯至來源檔案與列號。' },
      { bin: 'B-02-03', name: '示範情境', text: '內建多組示範情境，資料備妥前即可完整體驗模擬比較與 3D 回放。' },
    ],
    planAria: '延伸功能位置圖',
  },
  how: {
    eyebrow: '合作方式',
    h2: '帶著決策問題來，帶走有依據的答案。',
    body: '從確認決策到交付方案比較與建議做法，所有試驗皆在電腦中完成，現場照常作業。',
    stops: [
      { num: '01', title: '確認評估問題', body: '雙方共同確認待評估的決策、要比較的作業規則與評估指標。' },
      { num: '02', title: '建模與模擬', body: '以現有檔案與訂單資料建立 3D 倉庫，執行模擬比較。' },
      { num: '03', title: '交付比較結果', body: '交付方案比較、建議做法與 3D 回放，可直接用於內部報告。' },
    ],
    cta: '預約示範，從第一個決策開始 →',
    envelopeAria: '插圖：從信封中取出交付給您的模擬結果。',
    card: '模擬結果',
  },
  faq: {
    eyebrow: '常見問題',
    h2: '您可能關心的問題。',
    items: [
      { q: '可以用旺季尖峰的訂單來模擬嗎？', a: '可以。模擬以您提供的訂單批次為輸入，例如尖峰時段的出貨訂單與補貨單，即可檢視完成件數、待完成工作與工作站壅塞情形。' },
      { q: '開始模擬需要準備哪些資料？', a: '除 3D 倉庫外，備妥 AGV 路網、料架與庫存、訂單，以及 AGV 與工作站規則，即可開始模擬。系統會自動列出待補項目；{預約示範}時，我們協助您盤點並整理現有資料。' },
      { q: '一定要提供平面圖嗎？', a: '不需要。設施清單、平面圖或倉庫簡報，提供任一份即可開始。沒有座標的設施，系統會自動排出建議位置並標示「推估」；建立完成後，可透過對話調整位置與尺寸。' },
      { q: '支援哪些檔案格式？', a: '支援 PPTX、PDF、XLSX、CSV（UTF-8／Big5）、JPG、PNG，每次最多 20 份，Excel 的多個工作表可一次讀取；素材庫另可匯入 GLB 與 USD（.usd／.usda／.usdc／.usdz，100 MB 以內）。CAD 圖面匯出為 PDF 後即可上傳。' },
      { id: 'faq-fit', q: '哪些倉庫適合使用 4WALL AI？', a: '3D 建模、對話修改與素材庫適用各類倉庫，人工揀貨與堆高機作業皆可使用；模擬比較與 AI 快判專為貨到人 AGV 倉庫打造。歡迎來信說明您的作業型態，我們將為您規劃合適的導入方式。' },
      { q: '適合哪些團隊使用？', a: '倉儲營運與物流規劃團隊，可用來評估作業規則、AGV 台數與工作站配置；第三方物流業者可在新客戶進駐前規劃倉內配置；AGV 系統整合商則可在提案階段，以 3D 倉庫與模擬比較向客戶呈現方案。' },
      { q: 'AI 快判與模擬器有何不同？', a: 'AI 快判在數秒內預測 9 項 KPI，適合快速篩選方案；模擬器以同一批訂單完整重演，約需一到數分鐘，用於確認選定的方案。兩者結果並列呈現。' },
      { q: 'AI 快判如何應用在我們的倉庫？', a: 'AI 快判以您倉庫的作業資料專屬訓練，可數秒預測 9 項 KPI，預測結果反映您的料架配置、訂單結構與設備規模；也可直接以一句話提問，例如「若只開 6 站，等候時間會如何變化？」，AI 即轉為設定，經您確認後開始預測。' },
      { q: 'AI 如何提出建議做法？', a: 'AI 快判可在數秒內比較上百種作業規則組合，以每行平均等候時間評比各方案，提出穩定的建議做法，並列出值得進一步驗算的潛力方案。建議做法與潛力方案皆可一鍵交由模擬器完整重演。' },
      { q: '導入時需要更動現有系統嗎？', a: '不需要。4WALL AI 以上傳的檔案運作：WMS 或 Excel 匯出的設施清單即可直接上傳建立 3D 倉庫，系統自動辨識欄位；模擬所需的作業資料，我們可協助您由現有報表整理。現場作業照常進行。' },
      { q: '我們的資料如何處理？', a: '系統僅將判讀所需的內容交由 AI 處理：大型表格只提供欄位摘要與樣本列，完整資料由系統逐列建立設施；AI 快判的文字提問中，料號、訂單與料架編號等代碼會先自動遮蔽。倉庫資料保存檔名、檔案指紋、建模結果與對話紀錄，方便日後溯源。如需完整的資料處理說明，歡迎來信洽詢。' },
      { q: '供 IT 審查參考：AI 的修改如何把關？', a: 'AI 的回覆須符合固定資料格式，經系統逐項檢核後，才以資料操作套用至指定的設施與欄位；上傳檔案的內容一律作為資料判讀。批次修改全數通過檢核後寫入，每次修改皆保留版本，可隨時復原。' },
      { q: '費用如何計算？', a: '依倉庫規模與評估範圍而定，歡迎來信{預約示範}，我們將為您說明合適的合作方式。' },
      { q: '如何聯絡 4WALL AI？', a: '請來信 {admin@4wall.io|email}，我們將盡快回覆。', copy: true },
    ] as Array<{ id?: string; q: string; a: string; copy?: boolean }>,
  },
  dock: {
    plate: 'DOCK 07 · 出貨口',
    h2: ['調整倉庫之前，', '先以模擬評估可行性。'],
    sub: '只需準備現有的設施清單或簡報，沒有平面圖也能開始。',
    wit: '從現有資料開始：先模擬，再決策。',
    slipTitle: '出貨單 · DOCK 07',
    slipRows: [
      { k: '聯絡信箱', v: 'admin@4wall.io', copy: true },
      { k: '回覆', v: '我們將盡快回覆' },
      { k: '所在地', v: '台灣台南' },
    ],
  },
  footer: {
    tagline: '倉庫數位分身',
    company: '4WALL AI（第四面牆）· 台灣台南',
    navLabel: '頁尾連結',
    colSite: '網站',
    colPlatform: '平台',
    colContact: '聯絡我們',
    colLanguage: '語言',
    siteLinks: [
      { href: '#flow', label: '產品流程' },
      { href: '#numbers', label: '應用情境' },
      { href: '#toolkit', label: '延伸功能' },
      { href: '#how', label: '合作方式' },
      { href: '#faq', label: '常見問題' },
    ],
    languages: { zh: '中文', en: 'English' },
    copyright: '© 2026 4WALL AI',
  },
  toast: {
    label: '提示',
    default: '調整料架配置前，建議先以模擬評估。',
    flowEarly: '沒有平面圖，也能先建立 3D 倉庫。',
    chat: '附件批次修改，整批檢核後一次套用。',
    sim: 'AI 數秒預測，模擬器完整驗算。',
    board: '九項倉儲決策，都能先試算再定案。',
    faq: '方案是否可行，建議先以模擬評估。',
    short: '先模擬，再決策。',
    cta: '預約示範 →',
    close: '關閉提示',
  },
}

const en: typeof zh = {
  meta: {
    title: '4WALL AI — Run every warehouse decision on screen first',
    description:
      'Turn facility lists, floor plans or decks into a 3D warehouse you can edit by chat. Compare operating rules in simulation and forecast in seconds how AGV count, open stations and queue slots move your KPIs.',
    ogTitle: 'Run every warehouse decision on screen first | 4WALL AI',
    ogDescription:
      'Turn the facility lists, floor plans and decks you already have into a 3D warehouse. Edit it by chat, compare operating rules in simulation, and try AGV and station counts in seconds.',
    ogImage: '/official-assets/og-4wall-warehouse-en.png',
    ogImageAlt: '4WALL AI: a warehouse floor plan turning into a 3D warehouse, with the headline “Run every warehouse decision on screen first.”',
    ogLocale: 'en_US',
    ogLocaleAlternate: 'zh_TW',
    organizationDescription:
      '4WALL AI builds warehouse digital twins and AGV warehouse simulation: it turns facility lists, floor plans or warehouse decks into a 3D warehouse you can edit by chat, compares operating rules for goods-to-person warehouses in simulation, and forecasts KPIs in seconds with AI QuickJudge, verified by the simulator in one click, to help plan peak capacity, AGV fleets and workstations.',
    serviceName: 'Warehouse digital twin and simulation comparison',
    serviceType: 'Warehouse simulation and planning',
    serviceDescription:
      'Upload data, build a 3D warehouse, edit by chat, compare operating rules in simulation, forecast KPIs with AI QuickJudge and verify with the simulator.',
    ogImageText: {
      eyebrow: 'WAREHOUSE DIGITAL TWIN',
      stamp: 'SIMULATION',
    },
  },
  skip: 'Skip to content',
  cta: {
    demo: 'Book a demo',
    demoAria: 'Book a demo (email admin@4wall.io)',
    start: 'Get started →',
    startAria: 'Get started (opens platform.4wall.io)',
    login: 'Log in',
    loginLong: 'Log in to the platform',
    loginAria: 'Log in (opens platform.4wall.io)',
  },
  mail: {
    subject: 'Book a demo | 4WALL AI warehouse simulation',
    body: [
      'Company / warehouse type:',
      'AGVs / workstations (goods-to-person):',
      'The decision you want to evaluate first (e.g. peak capacity, open stations):',
      'Peak-day order volume (a rough figure is fine):',
      'Data you have (facility list / floor plan / deck / orders):',
      'Best time to reach you:',
    ],
  },
  copyEmail: {
    label: 'Copy email',
    done: 'Copied',
    aria: 'Copy email address admin@4wall.io',
    live: 'Email address copied',
  },
  motion: {
    pause: 'Pause animation',
    play: 'Play animation',
  },
  stamp: {
    illustrativeAnim: 'PRODUCT TOUR',
    forecast: 'FORECAST IN SECONDS',
    estimated: 'ESTIMATED',
    interp: 'Instant AI forecast',
    outOfRange: 'Extended setting · one-click simulator replay',
    verify: '5+ slots · verify in one click',
  },
  nav: {
    label: 'Main',
    homeAria: '4WALL AI home',
    items: [
      { href: '#flow', label: 'Product' },
      { href: '#numbers', label: 'Use cases' },
      { href: '#how', label: 'How we work' },
      { href: '#faq', label: 'FAQ' },
    ],
    lang: '中文',
    langAria: '中文版',
    langHref: '/',
    langCode: 'zh-Hant-TW',
    menu: 'Menu',
    close: 'Close menu',
    menuLabel: 'Site menu',
  },
  hero: {
    eyebrow: '4WALL AI · WAREHOUSE DIGITAL TWIN',
    h1: [[{ text: 'Run every warehouse decision ' }, { text: 'on screen', accent: true }, { text: ' first.' }]],
    sub: 'Upload a facility list, floor plan or warehouse deck and AI builds a 3D warehouse you can rotate and edit by chat. Add your operating data and simulate it: will peak orders clear, will workstations back up, will AGVs block each other? See the answer before you change the floor.',
    note: '› No floor plan needed to get started.',
    microStart: 'Get started → platform.4wall.io',
    microEmail: 'Or email:',
    scrollCue: 'Scroll to see the plan become a 3D warehouse',
  },
  stage: {
    srIntro:
      'The six steps below come with a product tour animation: a warehouse floor plan turns into a 3D warehouse, then shows chat edits, simulation comparison, AI QuickJudge and simulator verification.',
    railLabel: 'Product flow steps',
    rail: ['Upload', 'Build', 'Edit', 'Compare', 'QuickJudge', 'Verify'],
    railAria: [
      'Step 1: Upload data',
      'Step 2: Build the 3D warehouse',
      'Step 3: Edit by chat',
      'Step 4: Simulation comparison',
      'Step 5: AI QuickJudge',
      'Step 6: Simulator verification',
    ],
    legendPlan: 'FIG. 00/06 · PLAN · 1 cell = 1 m',
    legendSteps: ['UPLOAD DATA', 'BUILD THE 3D WAREHOUSE', 'EDIT BY CHAT', 'SIMULATION COMPARISON', 'AI QUICKJUDGE', 'SIMULATOR VERIFICATION'],
    legendPattern: 'FIG. {k}/06 · {name} · 1 cell = 1 m',
    legendHeat: ' · heatmap marks congestion',
    skip: 'Skip the flow animation ↓',
  },
  intro: {
    eyebrow: '00 / 06 · BEFORE WE START',
    h2: ['There’s only one warehouse on the floor.', 'On screen, you can test as many options as you need.'],
    fit: '4WALL AI turns the warehouse data you already have into a 3D warehouse you can edit by chat. Simulation comparison and AI QuickJudge are built for goods-to-person AGV warehouses, where AGVs bring racks to workstations and pickers stay at their stations.',
    fitLink: 'See which warehouses it fits ↓',
  },
  steps: [
    {
      id: 'step-01',
      eyebrow: '01 / 06 · UPLOAD DATA',
      h3: 'Start with whatever you already have.',
      body: 'Upload facility lists (Excel, CSV), floor plans or decks (PDF, PPTX, photos) as they are; video frames inside a deck are read too. A floor plan is optional, and large lists are handled in full.',
      spec: 'PPTX · PDF · XLSX · CSV (UTF-8/Big5) · JPG · PNG · up to 20 files per upload',
    },
    {
      id: 'step-02',
      eyebrow: '02 / 06 · BUILD THE 3D WAREHOUSE',
      h3: 'AI reads your data and builds the 3D warehouse.',
      body: 'Press “Build 3D warehouse” and AI reads your tables and drawings, maps columns and units automatically, and lays out a parametric 3D warehouse you can rotate, zoom and click. Facilities with no coordinates are placed in a suggested layout and marked “Estimated”. Every facility traces back to its source file and row, and you can review how the AI read your files.',
      note: 'Rack sizes, levels and positions are all parameters you can change in one sentence.',
      isoFallbackAlt: 'A 3D warehouse built from the same floor plan: racks drawn as teal wireframes, estimated racks dashed.',
    },
    {
      id: 'step-03',
      eyebrow: '03 / 06 · EDIT BY CHAT',
      h3: 'Want a change? Type one sentence.',
      body: 'Change sizes, positions and levels by chat right next to the 3D view, for one facility or a whole type at once, or attach a CSV, XLSX, PDF or image and let AI update in bulk. Each batch is checked as a whole and applied in one go, so your data stays consistent. Every change is saved as a new version you can roll back, and the warehouse data downloads as JSON.',
    },
    {
      id: 'step-04',
      eyebrow: '04 / 06 · SIMULATION COMPARISON',
      h3: 'Same orders. Two ways of working. Three runs each.',
      body: 'With the same outbound and replenishment orders, the simulator runs a baseline and an alternative set of operating rules three times each and averages the results. Units completed, AGV travel distance, workstation wait time and work remaining sit side by side; the results page points out which rules differ, and 3D replay, heatmaps and station analysis show where the bottlenecks are.',
      note: '24 built-in operating rules, compiled from published research, cover order assignment, rack selection for picking, rack return, replenishment assignment and replenishment rack selection, each explained in plain language. Or pick a goal, such as less AGV travel or more units completed, and apply a matching rule set in one click.',
    },
    {
      id: 'step-05',
      eyebrow: '05 / 06 · AI QUICKJUDGE',
      h3: 'Nine KPIs, forecast in seconds.',
      body: 'Choose a batch of orders, the number of AGVs and open stations, and AI QuickJudge forecasts nine KPIs in seconds, side by side with your current approach. It can also compare hundreds of rule combinations at once, recommend a dependable approach and list promising alternatives worth verifying in the simulator.',
      badgeNote: 'Every KPI forecast shows its typical error range, and recommended approaches go to the simulator in one click.',
      caveat: 'AI QuickJudge is trained on your own warehouse’s operating data, so its forecasts reflect your layout, order profile and fleet.',
    },
    {
      id: 'step-06',
      eyebrow: '06 / 06 · SIMULATOR VERIFICATION',
      h3: 'Fast AI forecasts, verified by the simulator.',
      body: 'Send an AI suggestion to the simulator in one click, and it replays the same orders in full in about one to a few minutes. The AI forecast and the simulator result sit side by side, with a plain-language explanation written from the numbers, so you choose with the evidence in hand.',
      end: 'Want to see all six steps live? Book a demo →',
    },
  ],
  ticket: {
    title: 'RECEIVING SLIP · DOCK 00',
    rows: ['facility-list.xlsx', 'floor-plan.pdf', 'warehouse-deck.pptx', 'site-photo.jpg'],
    done: '✓ read',
    pending: '… reading',
    found: 'Found: racks · picking stations · walls · columns · doors · zones · AGVs · chargers · equipment',
    footer: '4 files · up to 20 per upload',
  },
  chat: {
    groupAria: 'Chat edit demo',
    header: 'Edit by chat · try it',
    version: 'Version {n}',
    chips: ['Set A01 height to 4 m', 'Move row B one cell right', 'Attach: rack-heights.xlsx'],
    replyA01: '✓ Applied · version {n} · undo available',
    replyBMove: '✓ Applied · row B moved 1 cell right · version {n}',
    replyBatch: '✓ Updated 12 rack heights from the attachment · version {n}',
    replyUndo: '↺ Restored the content of version {from} · saved as version {n}',
    parsing: 'Reading…',
    fallback: 'This web demo runs the three suggestions below and “undo”. For full chat editing, {book a demo →}',
    undo: 'Undo',
    undoWords: ['undo', '復原'],
    placeholder: 'Change the warehouse in one sentence…',
    inputAria: 'Type an edit',
    send: 'Send',
    footer: 'Pick a suggestion or type your own to try it',
    you: 'You',
    system: '4WALL AI',
  },
  zebra: {
    title: 'Add operating data and start simulating',
    body: 'Bring in the AGV network, racks and inventory, orders, and AGV and workstation rules, and your 3D warehouse is ready for simulation comparison; the system checks what you have and lists anything to add. In a {demo}, we help you take stock of the data you already have.',
  },
  score: {
    title: 'Simulation comparison · 3-run average',
    cols: ['Baseline', 'Alternative'],
    run: 'Run {n} of 3',
    rows: ['Units completed', 'AGV travel distance', 'Workstation wait time', 'Work remaining'],
    chips: ['Alternative better', 'Alternative better', 'Even', 'Baseline better'],
    rowAria: '{row}: {chip}',
    footer: 'Same orders · every metric side by side, trade-offs at a glance',
  },
  kpi: {
    scenario: 'Sample setup · 40 AGVs · 6 stations open · 3 queue slots',
    cards: [
      { label: 'Lines picked per hour', ends: ['fewer', 'more'] },
      { label: 'Avg. wait per line', ends: ['shorter', 'longer'] },
      { label: 'Slowest-tenth wait', ends: ['shorter', 'longer'] },
      { label: 'AGV meters per unit picked', ends: ['shorter', 'longer'] },
    ],
    cardAria: '{label}: forecast bar',
    chips: ['Units per rack visit', 'Picker utilization', 'AGV utilization', 'Avg. queue at station', 'On-time rate'],
  },
  slot: {
    label: 'Queue slots per station',
    value: '{n} slots',
    valuetext: '{n} queue slots',
    stamp: 'Drag to try',
    static: '1–8 queue slots per station; this sample uses 3.',
    note: 'In the product, AI QuickJudge tries every setting from 1 to 8 slots at once and marks where waiting time levels off, so you can decide how many slots each station needs.',
  },
  ruler: {
    aiLabel: 'QuickJudge · seconds',
    simLabel: 'Simulator replay · one to a few minutes',
    rulerTag: 'Same orders · full replay',
    progress: 'Replaying…',
    done: '✓ Replay done',
    gap: 'Side by side',
    replay: 'Draw again',
    aria: 'A quick freehand line stands for the AI QuickJudge forecast and a ruled line for the simulator replay; the two sit side by side with the gaps bracketed.',
  },
  boss: {
    q: 'Can I take this to my manager?',
    a: 'Yes. Copy the results summary in one click, with the setup and key metrics laid out for your report or deck; the same settings reproduce the same result.',
  },
  spec: {
    eyebrow: 'SPEC',
    line: 'From upload to verification, in six numbers.',
    items: [
      { num: '0', text: 'floor plans needed to start.' },
      { num: '6', text: 'file formats: PPTX, PDF, XLSX, CSV, JPG, PNG.' },
      { num: '24', text: 'built-in operating rules, compiled from published research.' },
      { num: '×3', text: 'runs each for baseline and alternative, then averaged.' },
      { num: '9', text: 'KPIs, forecast by AI QuickJudge in seconds.' },
      { num: '1–8', text: 'queue slots per station, tried with a slider.' },
    ],
  },
  board: {
    eyebrow: 'USE CASES',
    finePre: 'Every AI QuickJudge suggestion can go to the simulator for a full replay, in one click:',
    bigLine: 'Forecast in seconds · verify in full.',
    h2: 'Nine decisions to run first.',
    intro: 'From peak capacity to storage and flow, test each of these decisions on your own orders and facility data before you change the floor.',
    rules: [
      { shape: 'circle', title: 'Will peak orders clear on time?', body: 'Simulate a peak-hour order batch and see units completed next to work remaining, before the season starts.' },
      { shape: 'circle', title: 'What if the fleet grows or shrinks?', body: 'Change the AGV count and QuickJudge forecasts lines picked per hour and AGV utilization in seconds; the simulator verifies in one click.' },
      { shape: 'circle', title: 'How many stations to open at peak?', body: 'Use QuickJudge to compare waiting time and picker utilization across open-station counts, and plan stations and staffing with evidence.' },
      { shape: 'square', title: 'Which station gets which order?', body: 'Compare order-assignment rules such as first received, earliest due and most items in common, and see how waiting time and station queues shift.' },
      { shape: 'square', title: 'Which rack should come to the station next?', body: 'Compare rack-selection rules such as nearest rack, highest demand and longest-waiting orders first, balancing units per visit and AGV travel.' },
      { shape: 'square', title: 'Can replenishment keep pace with picking?', body: 'Simulate outbound and replenishment orders together, compare replenishment rules, and include combined pick-and-replenish stations.' },
      { shape: 'triangle', title: 'How many queue slots per station?', body: 'Try 1 to 8 slots at once, compare waiting time with lines per hour, and see where waiting levels off.' },
      { shape: 'triangle', title: 'Where should a rack go after picking?', body: 'Compare rack-return rules such as fixed home, nearest slot and closest to a station, and see how AGV travel and waiting time change.' },
      { shape: 'triangle', title: 'Will traffic flow after the change?', body: 'Move racks by chat, then rehearse multi-AGV routes step by step to find where AGVs would wait or block each other.' },
    ],
  },
  toolkit: {
    eyebrow: 'TOOLKIT',
    h2: 'Six more tools beyond the main flow.',
    caption: 'Features beside the main flow',
    head: ['Location', 'Tool', 'What it does for you'],
    rows: [
      { bin: 'B-01-01', name: 'Path planning', text: 'Plan the shortest route for one AGV or coordinated routes for many, replay them step by step in 3D, and spot where AGVs would wait or block each other.' },
      { bin: 'B-01-02', name: '3D asset library', text: 'Start from built-in templates for racks, pallets, conveyors, workstations, AGVs and AMRs, import GLB/USD models, or have AI build parametric assets from catalogs and photos.' },
      { bin: 'B-01-03', name: 'Explore', text: 'Simulation comparison, AI QuickJudge and path planning in one place; every run is saved to reopen and compare.' },
      { bin: 'B-02-01', name: 'Layout generator', text: 'Describe a site in one sentence and AI lays out a 3D warehouse and checks aisles and AGV reach; for expansion proposals, put before and after side by side.' },
      { bin: 'B-02-02', name: 'Versions & provenance', text: 'Every change is saved as a version you can roll back or download as JSON, and every facility traces back to its source file and row.' },
      { bin: 'B-02-03', name: 'Demo scenarios', text: 'Built-in demo scenarios let you try simulation comparison and 3D replay end to end before your own data is ready.' },
    ],
    planAria: 'Toolkit location map',
  },
  how: {
    eyebrow: 'HOW WE WORK',
    h2: 'Bring a decision. Leave with an answer you can act on.',
    body: 'From defining the decision to handing over the comparison and a recommended approach, every trial runs on screen while your floor keeps working as usual.',
    stops: [
      { num: '01', title: 'Define the question', body: 'Agree on the decision, the operating rules to compare and the KPIs to watch.' },
      { num: '02', title: 'Build and simulate', body: 'Build the 3D warehouse from your files and orders, then run the comparison.' },
      { num: '03', title: 'Hand over the results', body: 'Comparison results, a recommended approach and 3D replays, ready for your internal report.' },
    ],
    cta: 'Book a demo and start with your first decision →',
    envelopeAria: 'An envelope opening to reveal the simulation results we deliver.',
    card: 'RESULTS',
  },
  faq: {
    eyebrow: 'FAQ',
    h2: 'Questions you might have.',
    items: [
      { q: 'Can we simulate our peak-season orders?', a: 'Yes. The simulation runs on the order batch you provide, such as a peak period’s outbound and replenishment orders, and shows units completed, work remaining and where workstations back up.' },
      { q: 'What data do we need to start simulating?', a: 'Alongside the 3D warehouse: the AGV network, racks and inventory, orders, and AGV and workstation rules. The system lists anything still to add, and in a {demo} we help you take stock of what you already have.' },
      { q: 'Do I need a floor plan?', a: 'No. A facility list, a floor plan or a warehouse deck: any one is enough to start. Facilities with no coordinates are placed in a suggested layout and marked “Estimated”, and you can adjust their position and size by chat once the model is built.' },
      { q: 'Which files are supported?', a: 'PPTX, PDF, XLSX, CSV (UTF-8/Big5), JPG and PNG, up to 20 files per upload, with every sheet of an Excel workbook read at once; the asset library also imports GLB and USD (.usd/.usda/.usdc/.usdz, up to 100 MB). CAD drawings can be uploaded once exported to PDF.' },
      { id: 'faq-fit', q: 'Which warehouses is 4WALL AI for?', a: '3D modeling, chat edits and the asset library work for any warehouse, including manual picking and forklift operations. Simulation comparison and AI QuickJudge are built for goods-to-person AGV warehouses. Email us about your operation and we’ll recommend the right way to start.' },
      { q: 'Which teams is 4WALL AI built for?', a: 'Warehouse operations and logistics planning teams can use it to evaluate operating rules, AGV fleets and station setups. 3PL operators can plan a site before a new client moves in, and AGV integrators can show clients how a proposal performs, in 3D and in simulation.' },
      { q: 'How do AI QuickJudge and the simulator differ?', a: 'QuickJudge forecasts nine KPIs in seconds to shortlist options; the simulator replays the same orders in full in about one to a few minutes to confirm the one you choose. Both results sit side by side.' },
      { q: 'How does AI QuickJudge work for our warehouse?', a: 'QuickJudge is trained on your warehouse’s own operating data and forecasts nine KPIs in seconds, reflecting your layout, order profile and fleet. You can also ask in plain language, such as “What if we open only 6 stations?”, and it turns the question into a setup for you to confirm before forecasting.' },
      { q: 'How does the AI recommend an approach?', a: 'QuickJudge compares hundreds of rule combinations in seconds on average wait per line, recommends a dependable approach and lists promising alternatives worth verifying. Both go to the simulator in one click for a full replay.' },
      { q: 'Do we need to change our existing systems?', a: 'No. 4WALL AI works from the files you upload: facility lists exported from your WMS or Excel go straight in to build the 3D warehouse, with columns recognized automatically, and we help you prepare the operating data for simulation from the reports you already have. Floor operations continue as usual.' },
      { q: 'How is our data handled?', a: 'The system shares only what the AI needs to read your files: for large tables, that is a column summary and sample rows, and the system then builds every facility row by row. Part, order and rack numbers in a typed QuickJudge question are masked automatically. Warehouse data keeps file names, file fingerprints, the resulting 3D model and the chat history, for traceability. Email us for full data-handling details.' },
      { q: 'For IT reviewers: how are AI edits checked?', a: 'AI replies must match a fixed data schema and are checked by the system before being applied as data operations to the specified facilities and fields; uploaded file contents are always read as data. Batch edits are written once every row passes, and every change is versioned so it can be rolled back.' },
      { q: 'How is it priced?', a: 'It is scoped to your warehouse size and the questions you want answered. Email us to {book a demo} and we’ll walk you through the options.' },
      { q: 'How do I reach you?', a: 'Email {admin@4wall.io|email} and we’ll reply as soon as we can.', copy: true },
    ],
  },
  dock: {
    plate: 'DOCK 07 · SHIPPING',
    h2: ['Before you change the floor,', 'assess it in simulation first.'],
    sub: 'All you need is the facility list or deck you already have; no floor plan required.',
    wit: 'Start with the data you have: simulate first, then decide.',
    slipTitle: 'SHIPPING SLIP · DOCK 07',
    slipRows: [
      { k: 'Email', v: 'admin@4wall.io', copy: true },
      { k: 'Reply', v: 'as soon as we can' },
      { k: 'Based in', v: 'Tainan, Taiwan' },
    ],
  },
  footer: {
    tagline: 'A digital twin for your warehouse',
    company: '4WALL AI · Tainan, Taiwan',
    navLabel: 'Footer links',
    colSite: 'Site',
    colPlatform: 'Platform',
    colContact: 'Contact',
    colLanguage: 'Language',
    siteLinks: [
      { href: '#flow', label: 'Product' },
      { href: '#numbers', label: 'Use cases' },
      { href: '#toolkit', label: 'Toolkit' },
      { href: '#how', label: 'How we work' },
      { href: '#faq', label: 'FAQ' },
    ],
    languages: { zh: '中文', en: 'English' },
    copyright: '© 2026 4WALL AI',
  },
  toast: {
    label: 'Tip',
    default: 'Before changing your rack layout, evaluate it in simulation.',
    flowEarly: 'No floor plan needed to build the 3D warehouse.',
    chat: 'Batch edits are checked as a whole, then applied in one go.',
    sim: 'Forecast in seconds, verify in full.',
    board: 'Nine decisions to try before you commit.',
    faq: 'Evaluate feasibility in simulation before you decide.',
    short: 'Simulate first, then decide.',
    cta: 'Book a demo →',
    close: 'Dismiss',
  },
}

export const officialContent: Record<OfficialLocale, typeof zh> = { zh, en }

export type OfficialCopy = typeof zh

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

export function mailtoDemo(locale: OfficialLocale) {
  const mail = officialContent[locale].mail
  return `mailto:admin@4wall.io?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body.join('\r\n'))}`
}

export const MAILTO_EMAIL = 'mailto:admin@4wall.io'

/** Plain-text version of the zh H1, used for the display-font subset and tests. */
export function headlineText(locale: OfficialLocale) {
  return officialContent[locale].hero.h1.map((line) => line.map((run) => run.text).join('')).join('')
}
