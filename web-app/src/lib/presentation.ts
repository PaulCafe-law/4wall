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
  platform_admin: 'Platform Admin',
  ops: 'Operations',
  customer_admin: 'Customer Admin',
  customer_viewer: 'Customer Viewer',
}

const statusLabels: Record<string, string> = {
  ready: 'Ready',
  planning: 'Planning',
  failed: 'Failed',
  draft: 'Draft',
  issued: 'Issued',
  invoice_due: 'Invoice Due',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  requested: 'Requested',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
}

const apiErrorLabels: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  missing_refresh_cookie: 'Missing refresh session. Please sign in again.',
  web_refresh_token_revoked: 'Session expired. Please sign in again.',
  user_inactive: 'This account is inactive.',
  forbidden_role: 'This account does not have permission for that action.',
  organization_slug_exists: 'That organization slug is already in use.',
  organization_not_found: 'Organization not found.',
  membership_not_found: 'Membership not found.',
  invite_not_found: 'Invite not found.',
  invite_revoked: 'This invite has been revoked.',
  invite_used: 'This invite has already been used.',
  invite_expired: 'This invite has expired.',
  site_not_found: 'Site not found.',
  invoice_not_found: 'Invoice not found.',
  invalid_slug: 'The slug format is invalid.',
  origin_not_allowed: 'This origin is not allowed.',
  rate_limit_exceeded: 'Too many requests. Please try again later.',
  flight_not_found: 'Flight not found.',
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
  monitor_only: 'Monitor Only',
  remote_control_requested: 'Remote Control Requested',
  remote_control_active: 'Remote Control Active',
  released: 'Released',
}

const controlActionLabels: Record<ControlIntentAction, string> = {
  request_remote_control: 'Request Remote Control',
  release_remote_control: 'Release Remote Control',
  pause_mission: 'Pause Mission',
  resume_mission: 'Resume Mission',
  hold: 'Hold',
  return_to_home: 'Return to Home',
}

const supportSeverityLabels: Record<SupportSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

const supportCategoryLabels: Record<SupportCategory, string> = {
  mission_failed: 'Mission Failed',
  battery_low: 'Low Battery',
  telemetry_stale: 'Telemetry Stale',
  bridge_alert: 'Bridge Alert',
  report_generation_failed: 'Report Generation Failed',
  dispatch_blocked: 'Dispatch Blocked',
}

const supportWorkflowLabels: Record<SupportWorkflowState, string> = {
  open: 'Open',
  claimed: 'Claimed',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
}

const alertLabels: Record<string, string> = {
  low_battery: 'Low Battery',
  telemetry_stale: 'Telemetry Stale',
  video_unavailable: 'Video Unavailable',
  bridge_alert: 'Bridge Alert',
}

const flightStateLabels: Record<string, string> = {
  HOLD: 'Hold',
  TRANSIT: 'Transit',
  RETURNING_HOME: 'Returning Home',
  LANDED: 'Landed',
  UNKNOWN: 'Unknown',
}

const operatingProfileLabels: Record<OperatingProfile, string> = {
  outdoor_gps_patrol: 'Outdoor Patrol',
  indoor_no_gps: 'Indoor Manual',
}

const uploadStateLabels: Record<string, string> = {
  uploaded: 'Uploaded',
  pending_upload: 'Pending Upload',
  bundle_missing: 'Bundle Missing',
  bundle_unverified: 'Bundle Unverified',
}

const executionStateLabels: Record<string, string> = {
  idle: 'Idle',
  precheck: 'Precheck',
  mission_ready: 'Mission Ready',
  takeoff: 'Takeoff',
  hover_ready: 'Hover Ready',
  transit: 'Transit',
  hold: 'Hold',
  manual_override: 'Manual Override',
  rth: 'Return to Home',
  landing: 'Landing',
  completed: 'Completed',
  aborted: 'Aborted',
}

const landingPhaseLabels: Record<string, string> = {
  auto_landing: 'Auto Landing',
  confirmation_required: 'Confirmation Required',
  rc_only_fallback: 'RC-Only Fallback',
  landed: 'Landed',
}

const executionModeLabels: Record<ExecutionMode, string> = {
  patrol_route: 'Patrol Route',
  manual_pilot: 'Manual Pilot',
}

const cameraStreamStateLabels: Record<string, string> = {
  unavailable: 'Unavailable',
  ready: 'Ready',
  streaming: 'Streaming',
  error: 'Error',
}

const recordingStateLabels: Record<string, string> = {
  idle: 'Idle',
  recording: 'Recording',
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
  return isInternal ? 'Internal' : 'Customer'
}

export function formatSearchMode(hasFilter: boolean): string {
  return hasFilter ? 'Filtered' : 'All Records'
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
    return 'Unknown'
  }
  return operatingProfileLabels[profile as OperatingProfile] ?? profile
}

export function formatUploadState(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }
  return uploadStateLabels[value] ?? value
}

export function formatExecutionState(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }
  return executionStateLabels[value] ?? value
}

export function formatLandingPhase(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }
  return landingPhaseLabels[value] ?? value
}

export function formatExecutionMode(value: ExecutionMode | string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }
  return executionModeLabels[value as ExecutionMode] ?? value
}

export function formatCameraStreamState(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }
  return cameraStreamStateLabels[value] ?? value
}

export function formatRecordingState(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }
  return recordingStateLabels[value] ?? value
}
