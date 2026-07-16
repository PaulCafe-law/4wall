# OpenBMC 與 4WALL 展示工廠融合 Gap Analysis

## Sprint boundary

本 sprint 屬於 Sprint 3，變更範圍限於 `planner-server/`、`web-app/`、`shared-schemas/` 與 `docs/`。起始 checkpoint 為 `fc28c93`（`chore: checkpoint OpenBMC factory integration sprint`）。

本文件先鎖定產品範圍、信任邊界與失效行為，再進行實作。Android 與飛行安全路徑不在本次整合範圍內。

## Product decision

第一位真實使用者是平台擁有者本人，主要需求是隨時確認 Raspberry Pi 5 的溫度、健康狀態、風扇與近期事件；第一個展示對象是緯穎公司。產品方向不是一次性的簡報頁，而是可逐步擴充到客戶環境的正式設備管理基礎。

因此第一版採下列原則：

- `/demo-factory` 是第一個展示入口，但資料、權限與 API 不綁死展示頁。
- 真實 Pi5 資料必須清楚標示為授權即時資料，不得併入展示工廠的模擬 KPI。
- 現場端主動向雲端建立 outbound HTTPS 連線；雲端與瀏覽器不直接連入 Pi5、QEMU 或 collector。
- 遙測可先上線；控制必須經型別化提案、明確確認、能力與 freshness 檢查、稽核及結果回報。
- 任一身份、租戶、裝置、資料新鮮度或命令結果不確定時，顯示不可確認並停止控制。

## Current 4WALL capabilities

現有 4WALL 已具備：

- 具 `organization`、`site`、membership 與角色的租戶基礎。
- `/demo-factory` 內部展示頁，以及 `accelerator_demo` 與 `organization_live` 的資料隔離。
- web session、org-scoped read/write guard、append-only `AuditEvent`。
- 固定攝影機使用的 device token、heartbeat、freshness 與 fail-closed 實作模式。
- 可呈現即時資料、事件與狀態卡的 web component/test 基礎。

現有 4WALL 尚未具備：

- OpenBMC connector 或一般設備身分。
- org/site/device 綁定的 BMC telemetry、event 與 capability 模型。
- 可追蹤的設備命令 proposal、confirmation、claim、execution result 狀態機。
- `/demo-factory` 中可點選的 Pi5/OpenBMC 設備物件與右側即時詳情。
- 對 collector 斷線、時鐘偏移、事件重送與命令重試的專用規則。

## Current `openbmc_final` capabilities

盤點 `D:\碩零(莊徐)\平行\openbmc_final` 後，現有資料路徑為：

```text
Pi5 sensor agent
    -> QEMU OpenBMC guest sidecar
    -> 3090 collector/dashboard
```

3090 collector 的 `GET /api/state` 已提供：

- `reading`
  - source/agent timestamp
  - collector `received_at`
  - Pi5 temperature
  - status、health
  - `stale`
- `fan`
  - present
  - rpm、pwm、pwm enable
  - cooling state/max state
  - manual boost capability
- temperature history
- recent events
- recent commands
- warning/critical thresholds
- collector freshness threshold，目前為 10 秒

現有控制端點包括：

- `POST /api/fan/boost`
- `POST /api/reset`
- `POST /api/simulate/critical`
- QEMU agent 以 `GET /qemu/pi5/command` 拉取 pending command

## Verified gaps in `openbmc_final`

目前 collector 適合做本地 demo，但不可直接公開或讓 4WALL web/LINE 呼叫：

| Gap | Current behavior | Product risk | Required closure |
|---|---|---|---|
| API authentication | state 與 command routes 未驗證 | 任一可達 collector 的人可讀狀態或送命令 | collector 僅允許本地 connector；雲端端點使用獨立、可輪替的 hashed device credential |
| Network exposure | 啟動範例使用 `0.0.0.0` | LAN 上不必要的攻擊面 | connector 同機時綁 loopback；不同主機時以 host firewall 僅允許 connector |
| Tenant identity | collector 沒有 org/site/device | 資料可能被放到錯誤客戶 | 由 planner-server 根據 connector token 與 device binding 決定 scope，不信任 payload 自報 org |
| Command typing | 本地 endpoint 可直接建立 command | 缺少雲端政策與確認 | 雲端只接受 enum command 和 bounded arguments，確認後才可排隊 |
| Command completion | `pending` 只會變 `delivered` | `delivered` 可能被誤當成功 | 新增明確 local execution result；沒有結果時最多顯示「已交付，結果未知」 |
| Idempotency | command 沒有跨系統 idempotency key | 網路重試可能重複執行 | cloud command id 必須一路傳到 connector/collector/agent 並去重 |
| Event cursor | event id 是單機 SQLite integer | DB 重建後可能重複或漏事件 | connector 保存 collector instance/cursor，雲端用 source key 去重 |
| Freshness | collector 只有本機 10 秒 stale | 雲端傳輸與 connector 斷線未納入 | 同時檢查 collector stale、source age、ingest age、connector heartbeat |
| Output trust | event/message 是本地文字 | HTML/log injection 或誤當指令 | 限長、純文字呈現；不得解析為命令、URL 或 HTML |

## Scope

### Read path

- 設定一個 org/site-scoped Pi5 managed device。
- 現場 outbound connector 輪詢既有 `GET /api/state`。
- 正規化並上傳目前溫度、健康狀態、風扇、threshold、freshness 與事件。
- `/demo-factory` 在 3D 工廠內顯示一個 Pi5/OpenBMC 設備物件；使用者點選後，既有右側詳細資訊欄顯示：
  - Pi5 連線與資料時間
  - 溫度、Normal/Warning/Critical、health
  - 風扇是否存在、RPM、PWM、cooling state
  - 最近事件
  - 明確的 live/stale/missing 狀態
- 保持 demo fixture，透過同一個介面切換 prod data provider；模擬資料必須標示為模擬。

### Command path

第一版允許的命令型別只有：

- `fan_boost`
  - `seconds` 為整數，範圍 1–60，UI 預設 10 秒。
  - 僅在 device 宣告 capability、狀態新鮮且沒有 active command 時可確認。
- `reset_dry_run`
  - 固定 `dryRun=true`，用於展示完整控制鏈但不重新啟動 Pi5。

`simulate_critical` 只屬於 deterministic demo fixture，不得對 production device 排隊。真實 `reset` 第一版停用；需待 local execution acknowledgement、額外權限與 rollback runbook 完成後另行開通。

每個真實命令都必須：

1. 由已登入、具 org write 權限的 web 使用者建立 typed proposal。
2. 顯示目標 org/site/device、命令、參數、影響與 freshness。
3. 經另一個明確的 confirm request，並驗證 proposal hash，防止確認前內容被替換。
4. 在 confirm transaction 中重新檢查角色、device 狀態、capability、freshness、expiry 與 active command。
5. 由 connector outbound claim，再映射到固定的 local endpoint。
6. 記錄 proposal、confirmation、claim、dispatch、result 或 timeout 的 audit/event。

## Non-scope

- 將 OpenBMC 原生移植到 Pi5。
- 從公網暴露 collector、QEMU、Redfish、SSH 或 Pi5 agent。
- 任意 shell、terminal、PowerShell、檔案系統、SQL、URL fetch 或 HTTP proxy。
- 由使用者輸入 local collector URL。
- 由 LINE、LLM、Twin Agent 或自由文字直接建立、確認或執行設備命令。
- 將 OpenBMC 控制接入 Android 或任何飛行安全路徑。
- 將 Pi5 telemetry 當成靚程或其他客戶的工廠 KPI。
- 第一版支援多廠牌 BMC、firmware 更新、BIOS 設定或真實 reset。
- 人臉、個資、螢幕截圖或其他與 Pi5 health 無關的現場資料。

## Data and authorization gaps

目標資料必須具備以下不可省略的 binding：

```text
Organization
  -> Site
    -> OpenBmcConnector
      -> OpenBmcDevice
        -> Telemetry / Events / Commands
```

必要規則：

- connector token 只代表一個 connector，並由伺服器取得其 org/site。
- device 必須屬於同一 connector、org 與 site；payload 中的名稱或 host 不能改變 scope。
- customer viewer 只讀；customer admin 可在 feature flag 開啟時提案與確認安全命令；platform admin/ops 的跨 org 支援存取照既有規則留下 audit。
- `/demo-factory` 仍只允許 `platform_admin` 與 `ops`，未來 customer device page 可重用相同 API，但不可透過展示頁權限繞過 org scope。
- response 不對外顯示 collector URL、Pi5 IP、agent host、token、raw env 或內部 command endpoint。

## Freshness decision

一筆狀態只有同時符合以下條件才是 `fresh`：

- collector 回傳 `reading.stale=false`。
- 可解析的 observation timestamp 距 server current time 不超過 30 秒。
- planner-server 收到該 observation 不超過 30 秒。
- connector heartbeat 不超過 30 秒。
- clock skew 不超過 120 秒。
- device 與 connector 皆為 active。

命令確認採更嚴格門檻：observation 與 heartbeat 皆不得超過 15 秒。任一時間缺失、無 timezone、未來時間超過允許 skew、collector stale、connector offline 或 device disabled，均拒絕確認與 claim。

UI 不得以最後一筆舊值冒充目前值。過期時保留時間戳供診斷，但主要狀態顯示「資料已過期，無法確認 Pi5 目前狀況」，command controls disabled。

## Delivery phases

### Phase 0 — contract and fixture

- 完成 schema、model、API contract、connector fixture 與 org isolation tests。
- `/demo-factory` 使用 clearly-labelled demo provider 驗證 UI。
- 所有 production command feature flags 關閉。

### Phase 1 — read-only shadow

- connector 只呼叫 collector `GET /api/state` 並上傳。
- 與原 dashboard 並行比對至少一個展示時段。
- 驗證 stale、clock skew、重送、0 RPM、fan absent 與 collector restart。

### Phase 2 — production read view

- `/demo-factory` 切換到綁定 Pi5 的 live provider。
- 保留原 dashboard 作交叉驗證與 rollback。
- 不開啟命令。

### Phase 3 — confirmed dry-run

- 僅開 `reset_dry_run`。
- 驗證 proposal/confirm/audit/claim/result 全鏈。
- 沒有 local result contract 時不得宣稱 succeeded。

### Phase 4 — bounded fan boost

- 開啟 `fan_boost`。
- 同時驗證 capability、freshness、單一 active command、timeout 與 RPM 回復。
- 真實 reset 仍停用。

## Test and acceptance gaps

實作完成至少需覆蓋：

- connector token 無法讀寫另一個 connector/device。
- org A 使用者無法讀取或控制 org B device。
- device id 與 token scope 不符時拒絕 ingest/claim。
- 相同 observation/event/idempotency key 重送不建立重複資料或命令。
- collector 回傳 stale、heartbeat stale、source time stale、future clock、缺 timestamp 全部 fail closed。
- `fan_present=false` 與 `fan_rpm=0` 不被誤判為 missing。
- event/message 只當純文字，惡意 HTML/URL/shell 字串不會執行。
- proposal 未確認、過期、hash 不符、權限改變或 freshness 失效均不能 queued。
- 一個 device 同時最多一個 active command。
- connector claim lease 過期可安全重試，但同一 idempotency key 不重複執行。
- collector `delivered` 不會被標成 `succeeded`。
- LINE、Twin Agent 與任意聊天文字建立零筆 OpenBMC command。
- demo fixture 不帶 production organization/device id，live panel 不混入 simulated KPI。

## Rollout and rollback

所有 rollout 由 feature flags 分離：

- `OPENBMC_INTEGRATION_ENABLED`
- `OPENBMC_LIVE_VIEW_ENABLED`
- `OPENBMC_COMMAND_PROPOSALS_ENABLED`
- `OPENBMC_COMMAND_EXECUTION_ENABLED`
- per-device command capability

rollback 順序：

1. 關閉 command execution，讓 queued/claimed command 到期，不新增命令。
2. 必要時撤銷 connector token並停止現場 connector。
3. `/demo-factory` 回到 clearly-labelled fixture，或隱藏 OpenBMC 設備物件及其詳情。
4. 保留 telemetry、event、command 與 audit 記錄供調查。
5. 不回復成 browser/LINE 直接呼叫 collector，也不以 stale data 填補畫面。

## Exit criteria

- 使用者可在 `/demo-factory` 點選 Pi5/OpenBMC 設備物件，並在右側詳情一眼辨識目前顯示的是 live 或 simulated Pi5 資料。
- fresh Pi5 state 可在 30 秒內呈現；斷線後 30 秒內進入 stale/missing 並停用控制。
- 所有資料與命令皆可追溯至正確 org/site/device/connector。
- 任何外部文字、URL 或 LINE event 無法建立 OpenBMC command。
- dry-run 與 fan boost 只有在明確確認、freshness/capability 通過後才會被 connector claim。
- UI、API 與 audit 不把 `delivered` 說成成功；只有 signed/scoped result 才能結束為 succeeded。
- backend/deploy security pass、sprint-end review、測試與 rollback 演練完成後才可對外展示。
