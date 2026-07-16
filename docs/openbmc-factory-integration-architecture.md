# OpenBMC 與 4WALL 展示工廠融合架構

## Architecture goals

本架構把 `openbmc_final` 現有 Pi5 health demo 接到 4WALL 的正式租戶、稽核與 web 體系，同時保留現場自主性：

- Pi5 sensor agent 與 QEMU OpenBMC sidecar 繼續負責現場 sensor/command 執行。
- 3090 collector 繼續是現場的狀態聚合點。
- 新增 outbound connector，讓現場主動推送正規化資料並拉取已確認命令。
- planner-server 負責 identity、org/site scope、持久化、freshness、command workflow 與 audit。
- web-app 只呼叫 planner-server，不直接接觸 collector。
- `/demo-factory` 是第一個 presentation surface，不是設備安全邊界。OpenBMC 以場景內設備物件呈現，只有在使用者點選後才進入既有右側詳細資訊欄。

## Target topology

```text
Site LAN
────────────────────────────────────────────────────────
Pi5 sensor agent
    ^
    | fixed, allowlisted agent API
    |
QEMU OpenBMC guest sidecar
    |  state/events push + command pull
    v
3090 collector
    |  GET /api/state
    |  fixed local command endpoints
    v
4WALL OpenBMC Connector
    |
    | outbound HTTPS only
    | scoped connector credential
    v
────────────────────────────────────────────────────────
4WALL planner-server
    | identity / org-site-device binding
    | telemetry / events / freshness
    | typed proposal / confirmation / audit
    v
Postgres
    ^
    |
web-app
    |
    +-- /demo-factory Pi5/OpenBMC object -> right-side live detail
    +-- future customer device page
```

若 connector 與 collector 在同一台 3090，collector 應綁 `127.0.0.1`。若不同主機，collector 防火牆只允許 connector 主機；兩者都不開放到公網。

## Demo factory interaction

- 展示工廠預設只顯示 Pi5/OpenBMC 設備物件，不在頁面頂端常駐遙測面板。
- 設備物件沿用數位分身既有的 entity selection、3D focus 與右側 detail panel 模式。
- 點選設備物件時，右側欄顯示資料來源、最近觀測、溫度、健康、風扇、近期事件與受控命令。
- 點選場景空白處、其他物件或收起右側欄時，OpenBMC 詳情不再佔用主畫面。
- 設備仍存在於 unavailable/stale 狀態；使用者點選後會看到誠實的無資料或過期說明，不以模擬值掩蓋 API 錯誤。

## Trust boundaries

### Browser

- 只持有正常 web session。
- 只能傳 device id、typed command enum 與 schema-validated arguments。
- 不能傳 collector URL、Pi5 URL、shell、HTTP method、header、檔案路徑或任意 payload template。
- command proposal 與 confirm 為兩次不同的 authenticated POST。

### Planner server

- 從 current user membership 與資料庫 binding 決定 org/site。
- 從 connector credential 決定可 ingest/claim 的 connector 與 devices。
- 不向現場發起連線，不做代理，不解析任意 URL。
- 所有 command state transition 由 server 驗證並留下 audit。

### Outbound connector

- 是唯一同時能接觸 local collector 與 cloud API 的 component。
- local collector base URL 來自受保護的部署設定，不接受 cloud/browser payload 覆寫。
- 只實作 hard-coded adapter methods，禁止通用 HTTP proxy、shell execution 或 subprocess command template。
- credential 存在現場 secret store，log 不可輸出 token、collector URL query 或原始命令 secret。

### Collector/QEMU/Pi5

- collector 的既有 `GET /api/state` 是第一版 read adapter。
- collector local command id 不是 cloud success proof。
- QEMU sidecar/Pi5 必須回報 terminal result，才能將 cloud command 標為 succeeded。
- 無回報、格式錯誤或超時皆保持 unknown/failed，不推論成功。

## Existing collector mapping

connector 每 5 秒讀取一次 `GET /api/state`。欄位映射如下：

| Collector field | Cloud field | Rule |
|---|---|---|
| `reading.timestamp` | `observedAt` | 必須含 timezone 或由已設定的 source timezone 正規化 |
| `reading.received_at` | `collectorReceivedAt` | 診斷用，不取代 source time |
| `reading.temperature_c` | `temperatureC` | finite number；超範圍拒絕該欄位 |
| `reading.status` | `status` | 正規化成 `normal/warning/critical/unknown` |
| `reading.health` | `health` | 正規化成 `ok/warning/critical/unknown` |
| `reading.stale` | `collectorStale` | true 時整筆 current state fail closed |
| `fan.present` | `fan.present` | false 是有效值，不等於 missing |
| `fan.rpm` | `fan.rpm` | non-negative integer 或 null |
| `fan.pwm` | `fan.pwm` | bounded integer 或 null |
| `fan.cooling_state` | `fan.coolingState` | non-negative integer 或 null |
| `fan.cooling_max_state` | `fan.coolingMaxState` | non-negative integer 或 null |
| `fan.manual_boost_supported` | capability evidence | 只能縮小 server-configured capability，不能自行開權限 |
| `thresholds.warning_c` | `thresholds.warningC` | 顯示與 policy evidence |
| `thresholds.critical_c` | `thresholds.criticalC` | 顯示與 policy evidence |
| `events[]` | event batch | 以 collector instance + source event id 去重 |

`history[]` 不在每次 poll 全量重送；cloud history 由 observations 產生。`commands[]` 不是 cloud command source of truth，只可作 connector reconciliation evidence。`agent_host`、`pi5_host` 不進一般 customer/demo response。

## Data model

以下為 target logical model；實作可依 repo 命名慣例調整 class 名稱，但 binding 與 invariants 不可省略。

### `OpenBmcConnector`

- `id`
- `organization_id`
- `site_id`
- `name`
- `status`: `active | disabled | revoked`
- `token_hash`
- `version`
- `last_heartbeat_at`
- `last_observation_at`
- `last_error_code`
- `created_at` / `updated_at`

一個 token 只對應一個 connector。明文 token 只在 provision/rotate 時顯示一次。

### `OpenBmcDevice`

- `id`
- `organization_id`
- `site_id`
- `connector_id`
- `name`
- `external_ref`
- `device_type`: first release 固定 `raspberry_pi_5`
- `status`: `active | disabled`
- `capabilities_json`
- `last_observed_at`
- `last_ingested_at`
- `latest_freshness`
- `created_at` / `updated_at`

資料庫 constraint 必須保證 connector/device 的 org/site 相同，`external_ref` 在 connector 內唯一。

### `OpenBmcTelemetryObservation`

- `id`
- `device_id`
- denormalized `organization_id` / `site_id`
- `source_observation_id`
- `observed_at`
- `collector_received_at`
- `ingested_at`
- `collector_stale`
- `temperature_c`
- `status`
- `health`
- `fan_json`
- `thresholds_json`
- `raw_schema_version`

唯一鍵至少包含 `(device_id, source_observation_id)`。不保存 collector raw env、token 或 URL。

### `OpenBmcEventRecord`

- `id`
- `device_id`
- `organization_id` / `site_id`
- `source_event_key`
- `occurred_at`
- `severity`
- `source`
- `code`
- `message`
- `details_json`
- `ingested_at`

message 為限長純文字；web rendering 不使用 raw HTML。

### `OpenBmcCommand`

- `id`
- `device_id`
- `organization_id` / `site_id`
- `command_type`
- `arguments_json`
- `proposal_hash`
- `status`
- `proposed_by_user_id` / `proposed_at`
- `confirmed_by_user_id` / `confirmed_at`
- `confirmation_expires_at`
- `claim_lease_id` / `claim_expires_at`
- `connector_id`
- `local_command_id`
- `result_json`
- `completed_at`
- `failure_code`
- `created_at` / `updated_at`

`AuditEvent` 另外記錄每一個安全相關 transition；command row 是 operational state，不取代 audit history。

## API contracts

所有 JSON contract 使用 schema version，拒絕未知 required field 形狀。所有 mutation 支援 idempotency key。

### Connector-authenticated APIs

```text
GET  /v1/openbmc-connector/config
POST /v1/openbmc-connector/heartbeat
POST /v1/openbmc-connector/observations
POST /v1/openbmc-connector/events:batch
POST /v1/openbmc-connector/commands:claim
POST /v1/openbmc-connector/commands/{commandId}/progress
POST /v1/openbmc-connector/commands/{commandId}/result
```

`GET config` 回傳 token 所屬 connector、允許的 device ids、poll interval、schema version 與 server-side capabilities；不回傳其他 connector/device。

Observation request：

```json
{
  "schemaVersion": "openbmc-observation.v1",
  "deviceId": "device-id",
  "sourceObservationId": "collector-instance:state-id",
  "observedAt": "2026-07-17T03:20:10Z",
  "collectorReceivedAt": "2026-07-17T03:20:11Z",
  "collectorStale": false,
  "temperatureC": 52.4,
  "status": "normal",
  "health": "ok",
  "fan": {
    "present": true,
    "rpm": 1180,
    "pwm": 75,
    "coolingState": 1,
    "coolingMaxState": 4,
    "manualBoostSupported": true
  },
  "thresholds": {
    "warningC": 65,
    "criticalC": 75
  }
}
```

Server 根據 credential 再驗證 device binding。`organizationId` 與 `siteId` 不由 connector 提供。

Atomic claim response：

```json
{
  "commandId": "command-id",
  "leaseId": "one-time-lease-id",
  "leaseExpiresAt": "2026-07-17T03:20:30Z",
  "deviceId": "device-id",
  "command": {
    "type": "fan_boost",
    "arguments": {
      "seconds": 10
    }
  },
  "idempotencyKey": "command-id"
}
```

connector 不認識的 type 必須回報 `unsupported_command`，不得 fallback 成文字或 shell。

Terminal result：

```json
{
  "leaseId": "one-time-lease-id",
  "status": "succeeded",
  "finishedAt": "2026-07-17T03:20:22Z",
  "localCommandId": "42",
  "result": {
    "effect": "fan_boost_completed",
    "durationSeconds": 10
  }
}
```

只有有效 lease、正確 connector/device 與合法 terminal status 可結束 command。

### Web-authenticated APIs

```text
GET  /v1/openbmc/devices
GET  /v1/openbmc/devices/{deviceId}
GET  /v1/openbmc/devices/{deviceId}/telemetry
GET  /v1/openbmc/devices/{deviceId}/events
GET  /v1/openbmc/devices/{deviceId}/commands
POST /v1/openbmc/devices/{deviceId}/command-proposals
POST /v1/openbmc/commands/{commandId}/confirm
POST /v1/openbmc/commands/{commandId}/cancel
```

Device detail response 必須包含 server-derived：

```json
{
  "deviceId": "device-id",
  "organizationId": "organization-id",
  "siteId": "site-id",
  "name": "Pi5 OpenBMC Demo",
  "freshness": "fresh",
  "controlEligible": true,
  "controlBlockReasons": [],
  "observedAt": "2026-07-17T03:20:10Z",
  "temperatureC": 52.4,
  "status": "normal",
  "health": "ok",
  "fan": {
    "present": true,
    "rpm": 1180,
    "pwm": 75
  }
}
```

Command proposal request 不接受自由文字：

```json
{
  "command": {
    "type": "fan_boost",
    "arguments": {
      "seconds": 10
    }
  },
  "reason": "Wiwynn product demonstration"
}
```

proposal response 回傳 canonical command summary、`proposalHash`、freshness evidence 與 confirmation expiry。confirm request 必須回傳相同 `expectedProposalHash`；server 在 transaction 內重新計算並重新檢查所有 guard。

## Command state machine

```text
awaiting_confirmation
    | confirm + guards pass
    v
queued
    | connector atomic claim
    v
claimed
    | fixed local adapter accepts
    v
accepted_by_collector
    | QEMU agent takes local command
    v
delivered_to_agent
    | explicit execution result
    +--------------------+
    v                    v
succeeded              failed
```

從非 terminal state 也可進入：

- `expired`: confirmation TTL、queue TTL 或 claim lease 超時。
- `cancelled`: 尚未 claim 前由有權限使用者取消。
- `rejected`: confirm/claim 時角色、scope、capability、freshness 或 policy 不再成立。

禁止的 transition 包括：

- `awaiting_confirmation -> claimed`
- `queued -> succeeded`
- `accepted_by_collector -> succeeded`（沒有 agent execution result）
- terminal state 回到 active state
- 重複 confirm 產生第二個 command

每個 device 最多一個 `queued/claimed/accepted_by_collector/delivered_to_agent` command。claim 使用短 lease；connector retry 必須攜帶相同 command id/idempotency key。

### Local adapter mapping

第一版 hard-coded mapping：

| Cloud type | Local action | Product status |
|---|---|---|
| `fan_boost` | `POST /api/fan/boost?seconds={boundedInt}` | capability/freshness/confirmation 通過後可開 |
| `reset_dry_run` | `POST /api/reset?dry_run=true` | dry-run phase 可開 |
| `simulate_critical` | 無 production mapping | demo fixture only |
| `reset` | 無 mapping | disabled |

connector 不接受 cloud 傳入 path、query name、method 或 base URL。

現有 collector 只能回報 command 已從 queue 交付；因此在補上 local result acknowledgement 之前：

- cloud 最多顯示 `delivered_to_agent`。
- command timeout 後顯示「結果無法確認」。
- 不允許真實 reset。
- fan boost 上線前應至少以後續 fresh telemetry 的 RPM 變化作 evidence，但 RPM evidence 仍不可取代明確 execution result。

## Freshness and fail-closed behavior

### UI freshness

`fresh` 必須同時滿足：

- latest observation 存在且 server ingest age ≤ 30 秒。
- source observation age ≤ 30 秒。
- connector heartbeat age ≤ 30 秒。
- `collectorStale=false`。
- connector/device active。
- timestamp 可解析且 clock skew ≤ 120 秒。

否則為 `stale` 或 `missing`。UI：

- 不把舊溫度/RPM 加上「目前」字樣。
- 可顯示最後觀測時間供診斷。
- 顯示固定 fail-closed 訊息。
- 關閉所有 command controls。

### Command freshness

confirm 與 claim 都重新要求：

- observation age ≤ 15 秒。
- heartbeat age ≤ 15 秒。
- collector 非 stale。
- device capability 與 server feature flag 皆開啟。

confirm 後到 claim 前若狀態變 stale，command 進入 `rejected` 或 `expired`，不得仍送往 collector。

## `/demo-factory` integration

展示工廠新增一個獨立的「Pi5 OpenBMC」設備入口／面板：

- 顯示 live/simulated badge。
- 顯示 org/site/device display name，但不顯示 IP 或 collector URL。
- 顯示 temperature、health、fan、freshness 與最近事件。
- real command panel 只在 production provider、fresh、eligible 且 feature flag 開啟時出現。
- confirmation dialog 必須完整重述目標與效果，不可用單一聊天訊息代替。
- real telemetry 不參與 3D 模擬的 OEE、產量、AMR 或機台警報計算。
- demo scenario 可以模擬 Critical、fan absent 與 stale，但資料上始終標示「模擬」。

資料 provider 介面：

```text
OpenBmcDataProvider
    +-- DemoOpenBmcDataProvider
    +-- ApiOpenBmcDataProvider
```

demo mode 必須繼續可啟動；prod mode 透過 dependency wiring 與 feature flag 選擇，不在 UI 中偷偷 fallback 成模擬值。

## LINE, LLM and external-text exclusion

- LINE router 不 import OpenBMC command service。
- LINE postback/text 沒有 OpenBMC command intent。
- Twin Agent snapshot 不含 command capability、connector metadata 或 command endpoint。
- assistant 摘要 Pi5 狀態時，只能讀取 server 已 scope/freshness 處理的 read model：
  `/demo-factory` 把 `/v1/openbmc/devices` 回應壓縮成 `world.openBmc` 唯讀摘要
  （溫度、健康、風扇、threshold、近期事件、freshness），排除 capabilities、
  `canControl`、`controlEligible`、`recentCommands`、connector 與 org 識別欄位。
  此摘要只進 `accelerator_demo` scope 的 snapshot。
- freshness fail closed：非 fresh 時 `world.openBmc` 只送最後觀測時間與過期／缺資料說明，
  不送數值，也不送近期事件（事件 message 可能內嵌溫度數字）；載入中標 `loading`、
  從未觀測標 `missing`，不得誤報成服務不可用或資料過期。
- 誠實標示：demo（simulation mode）中引用 `world.openBmc` authorized_live 且 state current
  的回答以「真實資料：」開頭。worker 的 deterministic 檢查要求全部成立：
  snapshot 年齡 ≤ 30 秒、`world.openBmc.source=authorized_live` 且 `state=current`、
  問答有提及 Pi5、回答未點名任何模擬實體；不成立時剝除「真實資料：」宣稱並
  強制「模擬情境：」前綴。
- 信任假設：`world.openBmc` 與其餘 world snapshot 同層級，皆由已通過
  `platform_admin`/`ops` 驗證的瀏覽器 session 組裝；worker 的檢查防的是模型
  錯標，不是惡意 snapshot。若要防後者，需改由 planner-server 端以自身
  read model enrich（未實作）。
- assistant 文字永遠不能直接轉成 command enum；使用者仍必須進 authenticated web proposal/confirmation UI。
- event message 中的 `curl`、URL、prompt 或 shell 字串一律只是純文字。

## Audit events

至少記錄：

- `openbmc.connector.provisioned`
- `openbmc.connector.token_rotated`
- `openbmc.connector.revoked`
- `openbmc.device.created`
- `openbmc.device.capability_changed`
- `openbmc.command.proposed`
- `openbmc.command.confirmed`
- `openbmc.command.rejected`
- `openbmc.command.claimed`
- `openbmc.command.progressed`
- `openbmc.command.succeeded`
- `openbmc.command.failed`
- `openbmc.command.expired`
- `openbmc.command.cancelled`

metadata 可含 command type、bounded arguments、freshness evidence、failure code 與 actor，但不可含 token、local URL、raw env 或任意 secret。

## Security controls

- connector token 使用高熵前綴 token、server-side hash、last-used metadata、rotation/revoke。
- connector endpoints rate-limited，payload/body/event batch 有大小上限。
- TLS certificate 驗證不得關閉。
- org/site/device binding 由 server 強制。
- command enum 使用 discriminated union/schema validation。
- proposal hash 包含 device id、command type、canonical arguments、expiry 與 schema version。
- confirm endpoint 執行 origin/session/role 檢查與 rate limit。
- local adapter 不提供 generic request method。
- collector local surface 綁 loopback/firewall；不靠 UI 隱藏當安全措施。
- log 與 audit 執行 secret redaction。
- production command rollout 前執行 CSO pass、dependency/CI/deploy supply-chain 檢查及 rollback 演練。

## Test plan

### Unit

- collector payload mapping，包含 null、0、fan absent、unknown status。
- timestamp、clock skew 與 freshness matrix。
- command discriminated union 與 argument bounds。
- proposal canonicalization/hash。
- command state transition table。
- event source key/idempotency。

### Backend integration

- connector provisioning/token rotate/revoke。
- org/site/device mismatch 與 cross-org IDOR。
- duplicate observation/event/claim/result。
- simultaneous confirm/claim，確認只有一筆 active command。
- confirm 後 freshness 失效。
- claim lease expiry/reclaim。
- delivered without result 不成為 succeeded。
- AuditEvent 完整且不含 secret。
- LINE/Twin Agent 不建立 command。

### Connector

- `/api/state` success、timeout、invalid JSON、collector stale。
- collector restart/event id reuse。
- cloud offline spool/retry with bounded disk。
- fixed endpoint mapping；惡意 path/URL/argument 被拒絕。
- process restart 不重複執行已 claim command。
- local command response 與 execution result reconciliation。

### Web

- live/simulated badge 與隔離。
- fresh/stale/missing/unknown/fan absent。
- viewer 無 command controls。
- proposal summary 與 explicit confirm。
- confirm expiry、server reject、command progress/timeout。
- `/demo-factory` 既有模擬與 camera features regression。

## Deployment sequence

1. 建立 DB migration、models、schemas 與 feature flags，全部預設 off。
2. 部署 planner-server read APIs，跑 org isolation/security tests。
3. provision connector/device；將 token 放入現場 secret store。
4. connector 以 read-only shadow 模式輪詢 `GET /api/state`。
5. 比對原 dashboard 與 cloud observations/events，確認至少一個完整 demo 時段。
6. 開啟 `/demo-factory` live read panel。
7. 加入 local command result contract，先開 `reset_dry_run`。
8. 完成 command audit/timeout/rollback rehearsal 後才開 bounded `fan_boost`。
9. 對緯穎展示前，以 fresh、stale、fan absent、Warning、dry-run、fan boost 各跑一次 rehearsal。

## Rollback

- command 異常：先關 `OPENBMC_COMMAND_EXECUTION_ENABLED`，不刪 audit。
- connector 異常：撤銷 token並停止 connector；cloud read model進入 stale。
- UI 異常：關 `OPENBMC_LIVE_VIEW_ENABLED`，所有角色（包含 `platform_admin` 與 `ops`）都停止讀取 live OpenBMC API，畫面回到明確標示的 demo fixture 或 unavailable 狀態。
- collector 異常：保留原 local dashboard，修復 collector/QEMU/Pi5；不得讓 web 直連 Pi5。
- migration rollback 前先停 ingest/claim，保留 exportable audit/command history。

任何 rollback 都不得恢復以下行為：

- 公開 unauthenticated collector。
- web/LINE/LLM 直接送 local command。
- 用最後一筆舊數值冒充 current state。
- 把 `delivered` 顯示成 succeeded。

## Production readiness gate

只有以下條件全部成立才可稱為正式產品基礎：

- org/site/device isolation tests 通過。
- connector token rotation/revoke 與現場 secret runbook 可操作。
- freshness 與 fail-closed behavior 經斷網/重啟/clock skew 驗證。
- typed command state machine、idempotency、explicit confirmation 與 audit 通過。
- collector/agent 有 terminal result contract；否則 UI 誠實停在 delivered/unknown。
- LINE、LLM、URL、shell 與任意工具控制路徑不存在。
- security pass、sprint-end review、部署 smoke 與 rollback rehearsal 完成。
