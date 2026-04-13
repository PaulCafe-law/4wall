import type {
  ControlIntentAction,
  ControlMode,
  InvoiceStatus,
  Role,
  SupportSeverity,
} from './types'

const roleLabels: Record<Role, string> = {
  platform_admin: '平台管理員',
  ops: '內部營運',
  customer_admin: '客戶管理員',
  customer_viewer: '客戶檢視者',
}

const statusLabels: Record<string, string> = {
  ready: '已就緒',
  planning: '規劃中',
  failed: '失敗',
  draft: '草稿',
  issued: '已開立',
  invoice_due: '待付款',
  paid: '已付款',
  overdue: '逾期',
  void: '已作廢',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: '帳號或密碼不正確。',
  missing_refresh_cookie: '找不到工作階段，請重新登入。',
  web_refresh_token_revoked: '工作階段已失效，請重新登入。',
  user_inactive: '帳號目前未啟用。',
  forbidden_role: '目前角色沒有執行這個操作的權限。',
  organization_slug_exists: '組織代號已經存在。',
  organization_not_found: '找不到指定的組織。',
  membership_not_found: '找不到指定的成員關係。',
  invite_not_found: '找不到邀請。',
  invite_revoked: '這個邀請已被撤銷。',
  invite_used: '這個邀請已經被使用。',
  invite_expired: '這個邀請已經過期。',
  site_not_found: '找不到指定的場址。',
  invoice_not_found: '找不到指定的帳單。',
  invalid_slug: '組織代號格式不正確。',
  origin_not_allowed: '目前來源不允許建立或刷新工作階段。',
  rate_limit_exceeded: '操作過於頻繁，請稍後再試。',
  flight_not_found: '找不到指定的飛行會話。',
}

const auditActionLabels: Record<string, string> = {
  web_login: '登入',
  web_logout: '登出',
  web_refresh: '刷新工作階段',
  organization_created: '建立組織',
  invite_created: '建立邀請',
  invite_accepted: '接受邀請',
  site_created: '建立場址',
  invoice_created: '建立帳單',
  'flight.control_intent_requested': '提出控制請求',
  'flight.control_intent_acknowledged': '回覆控制請求',
  'flight.live_ops.read_access': '讀取飛行監看',
  'flight.control_intent.read_access': '讀取控制請求',
  'flight.control_intent.write_access': '寫入控制請求',
}

const auditTargetTypeLabels: Record<string, string> = {
  system: '系統',
  organization: '組織',
  invite: '邀請',
  site: '場址',
  invoice: '帳單',
  mission: '任務',
  flight: '飛行',
  session: '工作階段',
  user: '使用者',
  membership: '成員關係',
}

const controlModeLabels: Record<ControlMode, string> = {
  monitor_only: '僅監看',
  remote_control_requested: '待接管',
  remote_control_active: '遠端控制中',
  released: '已釋放',
}

const controlActionLabels: Record<ControlIntentAction, string> = {
  request_remote_control: '申請遠端接管',
  release_remote_control: '釋放遠端控制',
  pause_mission: '請求暫停任務',
  resume_mission: '請求繼續任務',
  hold: '請求保持位置',
  return_to_home: '請求返航',
}

const supportSeverityLabels: Record<SupportSeverity, string> = {
  info: '資訊',
  warning: '警示',
  critical: '嚴重',
}

const alertLabels: Record<string, string> = {
  low_battery: '低電量',
  telemetry_stale: '遙測中斷',
  video_unavailable: '視訊不可用',
  bridge_alert: 'Bridge 告警',
}

const flightStateLabels: Record<string, string> = {
  HOLD: '保持位置',
  TRANSIT: '航線飛行',
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
  return isInternal ? '內部視角' : '客戶視角'
}

export function formatSearchMode(hasFilter: boolean): string {
  return hasFilter ? '篩選中' : '全部資料'
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

export function formatControlMode(mode: ControlMode): string {
  return controlModeLabels[mode] ?? mode
}

export function formatControlAction(action: ControlIntentAction): string {
  return controlActionLabels[action] ?? action
}

export function formatSupportSeverity(severity: SupportSeverity): string {
  return supportSeverityLabels[severity] ?? severity
}

export function formatFlightAlert(alert: string): string {
  return alertLabels[alert] ?? alert
}

export function formatFlightState(state: string): string {
  return flightStateLabels[state] ?? state
}
