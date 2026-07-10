# 4WALL 展示工廠跨空間倉儲決策翼

## Sprint Boundary

本 sprint 僅修改 `web-app/`、`planner-server/deploy/twin-agent-worker/`、`docs/` 與必要測試。Android、飛行控制、靚程攝影機 ingest、HMI OCR、人員辨識與正式決策總帳不在範圍內。

Checkpoint: `codex/checkpoint-warehouse-portal-20260711` at `d96625e`.

## Goal

內部 `/demo-factory` 在原有 3D 生產區提供一座可點擊的「4WALL 倉儲決策區」入口。進入後仍在同一頁與同一展示工作階段，但載入獨立的 3D 倉庫空間，顯示 AMR、貨架、工作站、情境與三套可重現的啟發式模擬提案。

靚程客戶 `/factory-twin` 保持原樣，不顯示入口、不建立倉儲展示狀態、不主動請求倉庫資產，也不把展示摘要送入正式組織快照。

## What Already Exists

- `FactoryScene`、`FactoryModel`、`CameraRig` 與 `EntityMarker` 已提供 3D 畫布、真實 GLB、攝影機和互動。
- `AmrVisual` 已提供展示用 AMR GLB 與備援幾何。
- `factoryStore` 已集中管理展示實體、訊息、選取、模擬時鐘與 UI 狀態。
- `warehouse/` 已有固定種子料號、訂單、儲位、NN／2-opt 路由與 KPI。
- `WarehouseSimulator` 已有 2D 熱圖和策略比較，但狀態侷限在元件內，且展示模式不會顯示。
- `useTwinAgentBridge` 已將 `accelerator_demo` 快照與靚程 `organization_live` 快照隔離。
- `ChatPanel` 與 3090 worker 已支援展示問答和受限工具呼叫。

## Scope Decision

第一版不重建靚程 GLB，也不把倉庫永久放進同一個大型世界座標。採同一頁面的分區場景入口：

```text
FactoryTwinWorkspace (internal demo only)
        |
        +-- space=factory
        |     +-- FactoryScene
        |     +-- WarehousePortal
        |
        +-- transition state: idle -> loading -> entering -> active | failed
        |
        +-- space=warehouse
              +-- WarehouseScene
              +-- shared warehouse proposal state
              +-- return portal
```

設施狀態與 3D 呈現分離。切換空間不重算提案；瀏覽器重新整理則回到固定預設情境與生產區。

## First-release Proposal Engine

第一版結果稱為「模擬提案」，不宣稱全域最佳解。

- 規劃期間：480 分鐘。
- 場景：A 系列需求增加 40%，WS-03 從第 0 分鐘停機 120 分鐘，4 台 AMR，最多搬遷 80 個料號。
- 提案：最少搬遷、最短距離、最大產能。
- 相同輸入、固定 seed 和固定迭代預算必須產生相同結果。
- 若兩個目標得到同一結果，UI 明確標示相同，不捏造差異。
- 若輸入不合法或固定搜尋預算內沒有候選，顯示原因，不產生假的 KPI。

完整產品契約和 KPI 定義記錄於本功能的 office-hours 設計文件；程式第一版只攜帶 3D 與助手需要的緊湊摘要，不把 12,480 個料號送入 twin-agent 快照。

## Visual Thesis

明亮、可信、可檢查的工業設施。原有生產區保留，入口使用具方向性的工業捲門與白色工作燈；倉庫以冷灰鋼構、黃色安全線、氧化綠資訊層與鏽橘警示呈現。畫面中心永遠是 3D 空間，不使用卡片牆或科幻霓虹裝飾。

## Content Plan

- 生產區：現有 3D 工廠與一座展示專用入口。
- 轉場：攝影機靠近入口、短暫遮罩、載入倉庫。
- 倉儲區：四條走道、雙面貨架、進貨／出貨、緩衝、充電與三個工作站。
- 決策控制：情境、三套提案、KPI 和時間播放，保持為場景上的緊湊操作列。
- 助手：第一回合建立情境，提案完成並成功發布摘要後，第二回合解釋結果。

## Interaction Thesis

1. 入口 hover 只強化照明和門框，不改變版面尺寸。
2. 進出場景使用 0.9–1.2 秒攝影機／遮罩轉場，轉場中鎖定重複操作。
3. 切換提案時，貨架熱度、AMR 路線與 KPI 一起更新，避免單純換數字。

## Data and Trust Boundaries

- 入口和倉儲場景只在 `demoPresentation=true` 建立。
- 客戶 `liveOnly` 路徑不 import、不 render、不發布倉儲展示摘要。
- twin-agent 摘要維持 `accelerator_demo`，不得攜帶 organization id、靚程 ledger、OCR、儀表或人員資料。
- 所有倉儲回答以「模擬情境：」開頭。
- 通用靜態 3D 資產不視為機密；未來若使用客戶機密模型，需改用 authenticated asset delivery。

## Failure Modes

| Failure | User experience | Test |
|---|---|---|
| 倉庫場景載入失敗 | 不白屏，顯示錯誤說明與返回成型工廠按鈕 | component test |
| 連點入口 | 只啟動一個轉場 | state-machine test |
| 輸入超過展示範圍 | 正規化至安全上下限後再計算 | engine test |
| 沒有可行候選 | 回傳不可行原因，不捏造 KPI | engine test |
| 摘要發布失敗 | 3090 不會收到新的倉儲摘要；網頁仍保留本機確定性結果 | bridge test |
| 摘要 hash 過期 | 第一版以 plan id／hash 提示約束回答，嚴格伺服器拒絕列為後續強化 | worker test + deferred hardening |
| 客戶路由誤載入口 | 測試失敗，禁止部署 | customer regression test |
| AMR 路線越過貨架 | 視覺／路徑測試失敗 | geometry/path test |

## NOT in Scope

- 正式 OR-Tools 最佳化、校準後離散事件模擬與全域最佳性證明。
- Excel／WMS／WCS 串接、正式核准、稽核與實際搬遷執行。
- 和泰品牌、真實倉庫布局或真實料號。
- 倉儲專用 LINE 控制與自動第二次 LLM 回合。
- 靚程正式數位工廠的任何 UI 或資料行為改版。

## Acceptance

- 只有平台管理員／內部營運的 `/demo-factory` 可看到並使用入口。
- 入口可進入倉庫並返回，錯誤時不白屏。
- 倉庫有非空白 3D 畫面、四條走道、三個工作站與四台 AMR。
- 三套提案可重現，KPI 與 3D 路線同步。
- 1920x1080、1440x900、1280x720 截圖沒有 UI 重疊，畫布像素檢查非空白。
- 靚程客戶模式的登入、3D 工廠、三支攝影機、現場人員和助手行為回歸通過。
- Web tests、lint、build 與相關 worker/backend tests 通過。

## Implemented and Verified

- 內部展示工廠已具備同頁跨空間入口、返回入口、0.92 秒轉場與場景錯誤邊界。
- 3D 倉庫包含四條走道、八組貨架、三個工作站、收貨／緩衝區、充電區與四台移動 AMR。
- 固定情境會產生「最少搬遷、最短距離、最大產能」三套可重現提案；方案名稱以實際 KPI 排序結果決定。
- 切換方案會同步更新 KPI、搬遷清單、貨架熱度與 AMR 路線。
- 3090 助手只在 `accelerator_demo` 且具有模擬摘要時取得倉儲工具；客戶與 LINE 路徑不會取得倉儲工具。
- 1280 寬度進入倉庫會暫時收起助手，返回時恢復；1920 投影寬度維持完整助手、3D 與指標三欄。
- 2026-07-11 驗證：Web 44 個測試檔、178 項測試通過；worker 36 項測試通過；typecheck、lint、production build 與高風險套件稽核通過。

## Deferred Hardening

- 提案計算若發生非預期執行期錯誤，目前尚未提供「保留上一版結果並顯示重試」的專用 UI。
- 摘要發布狀態尚未做成可見的助手啟用／停用門檻；第一版依快照內容決定 3090 是否可使用倉儲工具。
- plan id／summary hash 目前是回答約束與追溯欄位，尚未由 API 以資料庫狀態做強制過期拒絕。
- OR-Tools、校準後離散事件模擬、真實 WMS／WCS、主管核准與實際執行仍屬正式產品階段。
