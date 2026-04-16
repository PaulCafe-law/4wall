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
  platform_admin: 'Platform admin',
  ops: 'Operations',
  customer_admin: 'Customer admin',
  customer_viewer: 'Customer viewer',
}

const statusLabels: Record<string, string> = {
  ready: 'Ready',
  published: 'Published',
  planning: 'Planning',
  failed: 'Failed',
  draft: 'Draft',
  issued: 'Issued',
  invoice_due: 'Due soon',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Voided',
  open: 'Open',
  claimed: 'Claimed',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  fresh: 'Fresh',
  stale: 'Stale',
  missing: 'Missing',
  live: 'Live',
  unavailable: 'Unavailable',
  scheduled: 'Scheduled',
  paused: 'Paused',
  cancelled: 'Cancelled',
  completed: 'Completed',
  queued: 'Queued',
  generating: 'Generating',
  not_started: 'Not started',
  assigned: 'Assigned',
  sent: 'Sent',
  accepted: 'Accepted',
  dismissed: 'Dismissed',
  confirmed: 'Confirmed',
  reviewed: 'Reviewed',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  missing_refresh_cookie: 'No refresh cookie is present.',
  web_refresh_token_revoked: 'Refresh token has been revoked.',
  user_inactive: 'This user account is inactive.',
  forbidden_role: 'Your role does not have access to this action.',
  organization_slug_exists: 'Organization slug already exists.',
  organization_not_found: 'Organization not found.',
  membership_not_found: 'Membership not found.',
  invite_not_found: 'Invite not found.',
  invite_not_resendable: 'This invite cannot be resent.',
  invite_revoked: 'This invite has been revoked.',
  invite_used: 'This invite has already been used.',
  invite_expired: 'This invite has expired.',
  site_not_found: 'Site not found.',
  invoice_not_found: 'Invoice not found.',
  invalid_slug: 'Organization slug contains invalid characters.',
  origin_not_allowed: 'This browser origin is not allowed.',
  rate_limit_exceeded: 'Too many attempts. Try again in a moment.',
  flight_not_found: 'Flight not found.',
  support_item_not_found: 'Support item not found.',
}

const auditActionLabels: Record<string, string> = {
  web_login: 'Web login',
  web_logout: 'Web logout',
  web_refresh: 'Session refresh',
  organization_created: 'Organization created',
  organization_updated: 'Organization updated',
  invite_created: 'Invite created',
  invite_resent: 'Invite resent',
  invite_accepted: 'Invite accepted',
  invite_revoked: 'Invite revoked',
  site_created: 'Site created',
  site_updated: 'Site updated',
  invoice_created: 'Invoice created',
  invoice_updated: 'Invoice updated',
  membership_updated: 'Membership updated',
  'organization.detail.read_access': 'Organization detail viewed',
  'flight.control_intent_requested': 'Control intent requested',
  'flight.control_intent_acknowledged': 'Control intent acknowledged',
  'flight.live_ops.read_access': 'Live Ops viewed',
  'flight.control_intent.read_access': 'Control intents viewed',
  'flight.control_intent.write_access': 'Control intent created',
  'support.queue.claimed': 'Support item claimed',
  'support.queue.acknowledged': 'Support item acknowledged',
  'support.queue.resolved': 'Support item resolved',
  'support.queue.released': 'Support item released',
  'inspection.analysis_reprocessed': 'Analysis reprocessed',
  'inspection.report_generated': 'Inspection report generated',
  'inspection.report_failed': 'Inspection report failed',
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
  support_item: 'Support item',
}

const controlModeLabels: Record<ControlMode, string> = {
  monitor_only: 'Monitor only',
  remote_control_requested: 'Remote control requested',
  remote_control_active: 'Remote control active',
  released: 'Released',
}

const controlActionLabels: Record<ControlIntentAction, string> = {
  request_remote_control: 'Request remote control',
  release_remote_control: 'Release remote control',
  pause_mission: 'Pause mission',
  resume_mission: 'Resume mission',
  hold: 'Hold',
  return_to_home: 'Return to home',
}

const supportSeverityLabels: Record<SupportSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

const supportCategoryLabels: Record<SupportCategory, string> = {
  mission_failed: 'Mission failed',
  battery_low: 'Low battery',
  telemetry_stale: 'Telemetry stale',
  bridge_alert: 'Bridge alert',
}

const supportWorkflowLabels: Record<SupportWorkflowState, string> = {
  open: 'Open',
  claimed: 'Claimed',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
}

const alertLabels: Record<string, string> = {
  low_battery: 'Low battery',
  telemetry_stale: 'Telemetry stale',
  video_unavailable: 'Video unavailable',
  bridge_alert: 'Bridge alert',
}

const flightStateLabels: Record<string, string> = {
  HOLD: 'Hold',
  TRANSIT: 'Transit',
  RETURNING_HOME: 'Returning home',
  LANDED: 'Landed',
  UNKNOWN: 'Unknown',
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
  return value ? 'Yes' : 'No'
}

export function formatAccessMode(isInternal: boolean): string {
  return isInternal ? 'Internal access' : 'Customer access'
}

export function formatSearchMode(hasFilter: boolean): string {
  return hasFilter ? 'Filtered' : 'All records'
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

export function formatInvoiceStatusDescription(status: InvoiceStatus): string {
  if (status === 'paid') {
    return 'Invoice has been settled and confirmed.'
  }
  if (status === 'overdue') {
    return 'Invoice is overdue and needs follow-up.'
  }
  if (status === 'invoice_due') {
    return 'Invoice is due soon and should be tracked.'
  }
  if (status === 'issued') {
    return 'Invoice has been issued to the customer.'
  }
  if (status === 'void') {
    return 'Invoice has been voided and should not be paid.'
  }
  return 'Invoice is still being prepared or reviewed.'
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
