import type {
  ControlIntentAction,
  ControlMode,
  ExecutionMode,
  InvoiceStatus,
  OperatingProfile,
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
  planning: '規劃中',
  failed: '失敗',
  draft: '草稿',
  scheduled: '已排程',
  dispatched: '已派工',
  running: '執行中',
  completed: '已完成',
  report_ready: '報表已就緒',
  not_started: '尚未開始',
  queued: '佇列中',
  generating: '產生中',
  issued: '已開立',
  invoice_due: '待付款',
  paid: '已付款',
  overdue: '逾期',
  void: '作廢',
  requested: '已請求',
  accepted: '已接受',
  rejected: '已拒絕',
  superseded: '已取代',
  open: '待處理',
  claimed: '已指派',
  acknowledged: '已確認',
  resolved: '已解決',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: '電子郵件或密碼錯誤。',
  missing_refresh_cookie: '缺少登入 session，請重新登入。',
  web_refresh_token_revoked: '登入已過期，請重新登入。',
  user_inactive: '此帳號已停用。',
  forbidden_role: '此帳號沒有執行該操作的權限。',
  organization_slug_exists: '此組織代稱已被使用。',
  organization_not_found: '找不到組織。',
  membership_not_found: '找不到成員資格。',
  invite_not_found: '找不到邀請。',
  invite_revoked: '此邀請已撤銷。',
  invite_used: '此邀請已被使用。',
  invite_expired: '此邀請已過期。',
  site_not_found: '找不到場域。',
  invoice_not_found: '找不到帳務資料。',
  invalid_slug: '代稱格式不正確。',
  origin_not_allowed: '此來源網域未被允許。',
  rate_limit_exceeded: '請求過於頻繁，請稍後再試。',
  flight_not_found: '找不到 flight。',
}

const auditActionLabels: Record<string, string> = {
  web_login: 'Web Login',
  web_logout: 'Web Logout',
  web_refresh: 'Refresh Session',
  organization_created: 'Create Organization',
  invite_created: 'Create Invite',
  invite_accepted: 'Accept Invite',
  site_created: 'Create Site',
  invoice_created: 'Create Invoice',
  'flight.control_intent_requested': 'Request Control Intent',
  'flight.control_intent_acknowledged': 'Acknowledge Control Intent',
  'flight.live_ops.read_access': 'Read Live Ops',
  'flight.control_intent.read_access': 'Read Control Intent',
  'flight.control_intent.write_access': 'Write Control Intent',
}

const auditTargetTypeLabels: Record<string, string> = {
  system: 'System',
  organization: 'Organization',
  invite: 'Invite',
  site: 'Site',
  invoice: 'Invoice',
  mission: 'Mission',
  flight: 'Flight',
  session: 'Session',
  user: 'User',
  membership: 'Membership',
}

const controlModeLabels: Record<ControlMode, string> = {
  monitor_only: '僅監看',
  remote_control_requested: '已請求接管',
  remote_control_active: '接管中',
  released: '已釋放',
}

const controlActionLabels: Record<ControlIntentAction, string> = {
  request_remote_control: '請求接管',
  release_remote_control: '釋放接管',
  pause_mission: '暫停任務',
  resume_mission: '恢復任務',
  hold: '保持',
  return_to_home: '返航',
}

const supportSeverityLabels: Record<SupportSeverity, string> = {
  info: '資訊',
  warning: '警示',
  critical: '嚴重',
}

const supportCategoryLabels: Record<SupportCategory, string> = {
  mission_failed: '任務失敗',
  battery_low: '低電量',
  telemetry_stale: '遙測逾時',
  bridge_alert: 'Bridge 告警',
  report_generation_failed: '報表產生失敗',
  dispatch_blocked: '派工受阻',
}

const supportWorkflowLabels: Record<SupportWorkflowState, string> = {
  open: '待處理',
  claimed: '已指派',
  acknowledged: '已確認',
  resolved: '已解決',
}

const alertLabels: Record<string, string> = {
  low_battery: '低電量',
  telemetry_stale: '遙測逾時',
  video_unavailable: '影像不可用',
  bridge_alert: 'Bridge 告警',
}

const flightStateLabels: Record<string, string> = {
  HOLD: '保持',
  TRANSIT: '航行中',
  RETURNING_HOME: '返航中',
  LANDED: '已降落',
  UNKNOWN: '未知',
}

const operatingProfileLabels: Record<OperatingProfile, string> = {
  outdoor_gps_patrol: '戶外 GPS 巡邏',
  indoor_no_gps: '室內手動',
}

const uploadStateLabels: Record<string, string> = {
  uploaded: '已上傳',
  pending_upload: '等待上傳',
  bundle_missing: '缺少任務包',
  bundle_unverified: '任務包未驗證',
}

const executionStateLabels: Record<string, string> = {
  idle: '閒置',
  precheck: '起飛前檢查',
  mission_ready: '任務已就緒',
  takeoff: '起飛中',
  hover_ready: '懸停就緒',
  transit: '航行中',
  hold: '保持',
  manual_override: '手動接管',
  rth: '返航',
  landing: '降落中',
  completed: '已完成',
  aborted: '已中止',
}

const landingPhaseLabels: Record<string, string> = {
  auto_landing: '自動降落',
  confirmation_required: '需要確認降落',
  rc_only_fallback: '遙控器 fallback',
  landed: '已降落',
}

const executionModeLabels: Record<ExecutionMode, string> = {
  patrol_route: '巡邏航線',
  manual_pilot: '手動飛行',
}

const cameraStreamStateLabels: Record<string, string> = {
  unavailable: '不可用',
  ready: '已就緒',
  streaming: '串流中',
  error: '錯誤',
}

const recordingStateLabels: Record<string, string> = {
  idle: '未錄影',
  recording: '錄影中',
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
  return isInternal ? '內部' : '客戶'
}

export function formatSearchMode(hasFilter: boolean): string {
  return hasFilter ? '已篩選' : '全部資料'
}

export function formatAuditAction(action: string): string {
  return auditActionLabels[action] ?? action
}

export function formatAuditTargetType(targetType: string | null): string {
  if (!targetType) {
    return 'System'
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

export function formatOperatingProfile(profile: OperatingProfile | string | null | undefined): string {
  if (!profile) {
    return '未知'
  }
  return operatingProfileLabels[profile as OperatingProfile] ?? profile
}

export function formatUploadState(value: string | null | undefined): string {
  if (!value) {
    return '未知'
  }
  return uploadStateLabels[value] ?? value
}

export function formatExecutionState(value: string | null | undefined): string {
  if (!value) {
    return '未知'
  }
  return executionStateLabels[value] ?? value
}

export function formatLandingPhase(value: string | null | undefined): string {
  if (!value) {
    return '未知'
  }
  return landingPhaseLabels[value] ?? value
}

export function formatExecutionMode(value: ExecutionMode | string | null | undefined): string {
  if (!value) {
    return '未知'
  }
  return executionModeLabels[value as ExecutionMode] ?? value
}

export function formatCameraStreamState(value: string | null | undefined): string {
  if (!value) {
    return '未知'
  }
  return cameraStreamStateLabels[value] ?? value
}

export function formatRecordingState(value: string | null | undefined): string {
  if (!value) {
    return '未知'
  }
  return recordingStateLabels[value] ?? value
}
