import type {
  ControlIntentAction,
  ControlMode,
  InvoiceStatus,
  Role,
  SupportCategory,
  SupportSeverity,
  SupportWorkflowState,
} from './types'

const roleLabels: Record<Role, string> = {
  platform_admin: '平台管理員',
  ops: '營運人員',
  customer_admin: '客戶管理員',
  customer_viewer: '客戶檢視者',
}

const statusLabels: Record<string, string> = {
  ready: '已就緒',
  published: '已發布',
  planning: '規劃中',
  failed: '失敗',
  running: '執行中',
  draft: '草稿',
  issued: '已開立',
  invoice_due: '即將到期',
  paid: '已付款',
  overdue: '已逾期',
  void: '已作廢',
  open: '待處理',
  claimed: '已認領',
  acknowledged: '已確認',
  resolved: '已解決',
  fresh: '最新',
  stale: '過期',
  missing: '缺失',
  live: '即時',
  unavailable: '不可用',
  scheduled: '已排程',
  paused: '已暫停',
  cancelled: '已取消',
  completed: '已完成',
  report_ready: '報表已就緒',
  queued: '佇列中',
  generating: '產生中',
  not_started: '尚未開始',
  assigned: '已指派',
  sent: '已送出',
  accepted: '已接受',
  dismissed: '已忽略',
  confirmed: '已確認',
  reviewed: '已複核',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: '帳號或密碼不正確。',
  missing_refresh_cookie: '目前沒有可用的重新整理 cookie。',
  web_refresh_token_revoked: '登入憑證已被撤銷。',
  user_inactive: '此使用者帳號已停用。',
  forbidden_role: '你的角色無權執行此操作。',
  organization_slug_exists: '組織代稱已存在。',
  organization_not_found: '找不到組織。',
  organization_requires_customer_admin: '每個組織至少要保留一位啟用中的客戶管理員。',
  membership_not_found: '找不到成員資料。',
  invite_not_found: '找不到邀請紀錄。',
  invite_not_resendable: '這筆邀請目前不能重寄。',
  invite_revoked: '這筆邀請已被撤銷。',
  invite_used: '這筆邀請已經使用過。',
  invite_expired: '這筆邀請已經過期。',
  site_not_found: '找不到場域。',
  invoice_not_found: '找不到帳單。',
  invalid_slug: '組織代稱包含不合法字元。',
  origin_not_allowed: '目前瀏覽器來源不被允許。',
  rate_limit_exceeded: '嘗試次數過多，請稍後再試。',
  flight_not_found: '找不到飛行紀錄。',
  support_item_not_found: '找不到支援項目。',
}

const auditActionLabels: Record<string, string> = {
  web_login: '網站登入',
  web_logout: '網站登出',
  web_refresh: '工作階段更新',
  organization_created: '建立組織',
  organization_updated: '更新組織',
  invite_created: '建立邀請',
  invite_resent: '重寄邀請',
  invite_accepted: '接受邀請',
  invite_revoked: '撤銷邀請',
  site_created: '建立場域',
  site_updated: '更新場域',
  invoice_created: '建立帳單',
  invoice_updated: '更新帳單',
  membership_updated: '更新成員權限',
  'organization.detail.read_access': '檢視組織詳情',
  'flight.control_intent_requested': '提出控制意圖',
  'flight.control_intent_acknowledged': '確認控制意圖',
  'flight.live_ops.read_access': '檢視即時營運',
  'flight.control_intent.read_access': '檢視控制意圖',
  'flight.control_intent.write_access': '建立控制意圖',
  'support.queue.claimed': '認領支援項目',
  'support.queue.acknowledged': '確認支援項目',
  'support.queue.resolved': '解決支援項目',
  'support.queue.released': '釋放支援項目',
  'inspection.analysis_reprocessed': '重新產生分析結果',
  'inspection.report_generated': '產生巡檢報表',
  'inspection.report_failed': '巡檢報表產生失敗',
}

const auditTargetTypeLabels: Record<string, string> = {
  system: '系統',
  organization: '組織',
  invite: '邀請',
  site: '場域',
  invoice: '帳單',
  mission: '任務',
  flight: '飛行',
  session: '工作階段',
  user: '使用者',
  membership: '成員',
  support_item: '支援項目',
}

const controlModeLabels: Record<ControlMode, string> = {
  monitor_only: '僅監看',
  remote_control_requested: '已申請遠端接管',
  remote_control_active: '遠端接管中',
  released: '已釋放',
}

const controlActionLabels: Record<ControlIntentAction, string> = {
  request_remote_control: '申請遠端接管',
  release_remote_control: '釋放遠端接管',
  pause_mission: '暫停任務',
  resume_mission: '恢復任務',
  hold: '保持待命',
  return_to_home: '返航',
}

const supportSeverityLabels: Record<SupportSeverity, string> = {
  info: '資訊',
  warning: '警示',
  critical: '嚴重',
}

const supportCategoryLabels: Record<SupportCategory, string> = {
  mission_failed: '任務失敗',
  battery_low: '電量過低',
  telemetry_stale: '遙測過期',
  bridge_alert: '橋接告警',
  report_generation_failed: '報表產生失敗',
  dispatch_blocked: '派工阻塞',
}

const supportWorkflowLabels: Record<SupportWorkflowState, string> = {
  open: '待處理',
  claimed: '已認領',
  acknowledged: '已確認',
  resolved: '已解決',
}

const alertLabels: Record<string, string> = {
  low_battery: '電量過低',
  telemetry_stale: '遙測過期',
  video_unavailable: '影像不可用',
  bridge_alert: '橋接告警',
}

const flightStateLabels: Record<string, string> = {
  HOLD: '待命',
  TRANSIT: '移動中',
  RETURNING_HOME: '返航中',
  LANDED: '已降落',
  UNKNOWN: '未知',
}

export function formatRole(role: Role): string {
  return roleLabels[role] ?? role
}

export function formatStatus(status: string): string {
  return statusLabels[status] ?? status.replaceAll('_', ' ')
}

export function formatApiError(detail: string | undefined, fallback: string): string {
  if (!detail) {
    return fallback
  }
  return apiErrorLabels[detail] ?? fallback
}

export function formatBoolean(value: boolean): string {
  return value ? '是' : '否'
}

export function formatAccessMode(isInternal: boolean): string {
  return isInternal ? '內部存取' : '客戶存取'
}

export function formatSearchMode(hasFilter: boolean): string {
  return hasFilter ? '已篩選' : '全部資料'
}

export function formatAuditAction(action: string): string {
  return auditActionLabels[action] ?? action
}

export function formatAuditTargetType(targetType: string | null): string {
  if (!targetType) {
    return '系統'
  }
  return auditTargetTypeLabels[targetType] ?? targetType
}

export function formatRoleOption(role: Role): string {
  return formatRole(role)
}

export function formatInvoiceStatus(status: InvoiceStatus): string {
  return formatStatus(status)
}

export function formatInvoiceStatusDescription(status: InvoiceStatus): string {
  if (status === 'paid') {
    return '帳單已完成付款並確認入帳。'
  }
  if (status === 'overdue') {
    return '帳單已逾期，需要儘快追蹤處理。'
  }
  if (status === 'invoice_due') {
    return '帳單即將到期，請提前追蹤付款進度。'
  }
  if (status === 'issued') {
    return '帳單已開立並送交客戶。'
  }
  if (status === 'void') {
    return '帳單已作廢，不需付款。'
  }
  return '帳單仍在整理或審核流程中。'
}

export function formatControlMode(mode: ControlMode): string {
  return controlModeLabels[mode] ?? mode
}

export function formatControlAction(action: ControlIntentAction): string {
  return controlActionLabels[action] ?? action
}

export function formatSupportSeverity(severity: SupportSeverity): string {
  return supportSeverityLabels[severity] ?? severity
}

export function formatSupportCategory(category: SupportCategory): string {
  return supportCategoryLabels[category] ?? category
}

export function formatSupportWorkflowState(state: SupportWorkflowState): string {
  return supportWorkflowLabels[state] ?? state
}

export function formatFlightAlert(alert: string): string {
  return alertLabels[alert] ?? alert
}

export function formatFlightState(state: string): string {
  return flightStateLabels[state] ?? state
}
