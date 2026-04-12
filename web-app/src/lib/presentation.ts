import type { InvoiceStatus, Role } from './types'

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
  issued: '已開立',
  invoice_due: '待付款',
  paid: '已付款',
  overdue: '逾期',
  void: '已作廢',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: '帳號或密碼錯誤。',
  missing_refresh_cookie: '找不到工作階段憑證，請重新登入。',
  web_refresh_token_revoked: '工作階段已失效，請重新登入。',
  user_inactive: '此帳號已停用。',
  forbidden_role: '目前角色沒有執行此操作的權限。',
  organization_slug_exists: '此組織代號已存在。',
  organization_not_found: '找不到指定的組織。',
  membership_not_found: '找不到指定的成員關係。',
  invite_not_found: '找不到邀請資料。',
  invite_revoked: '此邀請已被撤銷。',
  invite_used: '此邀請已經使用過。',
  invite_expired: '此邀請已過期。',
  site_not_found: '找不到指定的場址。',
  invoice_not_found: '找不到指定的帳單。',
  invalid_slug: '組織代號格式無效。',
  origin_not_allowed: '目前來源網域不允許執行此操作。',
  rate_limit_exceeded: '操作過於頻繁，請稍後再試。',
}

const auditActionLabels: Record<string, string> = {
  web_login: '網頁登入',
  web_logout: '網頁登出',
  web_refresh: '工作階段續期',
  organization_created: '建立組織',
  invite_created: '建立邀請',
  invite_accepted: '接受邀請',
  site_created: '建立場址',
  invoice_created: '建立帳單',
}

const auditTargetTypeLabels: Record<string, string> = {
  system: '系統',
  organization: '組織',
  invite: '邀請',
  site: '場址',
  invoice: '帳單',
  mission: '任務',
  session: '工作階段',
  user: '使用者',
  membership: '成員關係',
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
  return hasFilter ? '已篩選' : '全部'
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
