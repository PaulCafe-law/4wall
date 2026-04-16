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
  ops: '內部營運',
  customer_admin: '客戶管理者',
  customer_viewer: '客戶檢視者',
}

const statusLabels: Record<string, string> = {
  ready: '準備交付',
  published: '已發布',
  planning: '規劃中',
  failed: '失敗',
  draft: '草稿',
  issued: '已開立',
  invoice_due: '即將到期',
  paid: '已付款',
  overdue: '已逾期',
  void: '已作廢',
  open: '待處理',
  claimed: '已接手',
  acknowledged: '已確認',
  resolved: '已結案',
  fresh: '最新',
  stale: '延遲',
  missing: '缺失',
  live: '直播中',
  unavailable: '不可用',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: '帳號或密碼不正確。',
  missing_refresh_cookie: '目前沒有可用的登入工作階段，請重新登入。',
  web_refresh_token_revoked: '登入工作階段已失效，請重新登入。',
  user_inactive: '這個帳號目前已停用。',
  forbidden_role: '你目前的角色沒有這個操作權限。',
  organization_slug_exists: '這個組織代號已經被使用。',
  organization_not_found: '找不到指定的組織。',
  membership_not_found: '找不到指定的成員。',
  invite_not_found: '找不到這筆邀請。',
  invite_not_resendable: '這筆邀請目前無法重新寄送。',
  invite_revoked: '這筆邀請已經撤銷。',
  invite_used: '這筆邀請已經完成開通。',
  invite_expired: '這筆邀請已經過期。',
  site_not_found: '找不到指定的場址。',
  invoice_not_found: '找不到指定的帳單。',
  invalid_slug: '組織代號只能使用小寫英數字與連字號。',
  origin_not_allowed: '這個來源目前不允許建立或更新工作階段。',
  rate_limit_exceeded: '嘗試次數過多，請稍後再試。',
  flight_not_found: '找不到指定的飛行工作項。',
  support_item_not_found: '找不到指定的支援項目。',
}

const auditActionLabels: Record<string, string> = {
  web_login: '登入',
  web_logout: '登出',
  web_refresh: '刷新工作階段',
  organization_created: '建立組織',
  organization_updated: '更新組織',
  invite_created: '建立邀請',
  invite_resent: '重新寄送邀請',
  invite_accepted: '接受邀請',
  site_created: '建立場址',
  invoice_created: '建立帳單',
  invoice_updated: '更新帳單',
  membership_updated: '更新成員權限',
  'organization.detail.read_access': '讀取組織詳情',
  'flight.control_intent_requested': '送出控制意圖',
  'flight.control_intent_acknowledged': '確認控制意圖',
  'flight.live_ops.read_access': '檢視 Live Ops',
  'flight.control_intent.read_access': '檢視控制意圖',
  'flight.control_intent.write_access': '建立控制意圖',
  'support.queue.claimed': '接手支援項目',
  'support.queue.acknowledged': '確認支援項目',
  'support.queue.resolved': '完成支援項目',
  'support.queue.released': '釋出支援項目',
}

const auditTargetTypeLabels: Record<string, string> = {
  system: '系統',
  organization: '組織',
  invite: '邀請',
  site: '場址',
  invoice: '帳單',
  mission: '任務',
  flight: '飛行工作項',
  session: '登入工作階段',
  user: '使用者',
  membership: '成員資格',
  support_item: '支援項目',
}

const controlModeLabels: Record<ControlMode, string> = {
  monitor_only: '僅監看',
  remote_control_requested: '等待遠端接手',
  remote_control_active: '遠端控制中',
  released: '已釋放',
}

const controlActionLabels: Record<ControlIntentAction, string> = {
  request_remote_control: '申請遠端控制',
  release_remote_control: '釋放遠端控制',
  pause_mission: '暫停任務',
  resume_mission: '恢復任務',
  hold: '保持待命',
  return_to_home: '返航',
}

const supportSeverityLabels: Record<SupportSeverity, string> = {
  info: '資訊',
  warning: '警示',
  critical: '關鍵',
}

const supportCategoryLabels: Record<SupportCategory, string> = {
  mission_failed: '任務失敗',
  battery_low: '電量偏低',
  telemetry_stale: '遙測延遲',
  bridge_alert: 'Bridge 告警',
}

const supportWorkflowLabels: Record<SupportWorkflowState, string> = {
  open: '待處理',
  claimed: '已接手',
  acknowledged: '已確認',
  resolved: '已結案',
}

const alertLabels: Record<string, string> = {
  low_battery: '電量偏低',
  telemetry_stale: '遙測延遲',
  video_unavailable: '影像不可用',
  bridge_alert: 'Bridge 告警',
}

const flightStateLabels: Record<string, string> = {
  HOLD: '保持待命',
  TRANSIT: '飛行中',
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
  return isInternal ? '內部模式' : '客戶模式'
}

export function formatSearchMode(hasFilter: boolean): string {
  return hasFilter ? '已套用篩選' : '全部資料'
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
    return '這筆帳單已經完成付款，可對照收款註記與收據編號。'
  }
  if (status === 'overdue') {
    return '這筆帳單已逾期，請優先確認付款安排與收款回覆。'
  }
  if (status === 'invoice_due') {
    return '這筆帳單即將到期，建議先確認付款時間與匯款資訊。'
  }
  if (status === 'issued') {
    return '這筆帳單已開立，等待客戶安排付款。'
  }
  if (status === 'void') {
    return '這筆帳單已作廢，請查看作廢原因與內部說明。'
  }
  return '這筆帳單目前仍在整理中，後續會更新正式狀態。'
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
