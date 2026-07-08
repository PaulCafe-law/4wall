import type {
  DecisionPoint,
  DecisionPointAttributionReason,
  DecisionPointEventType,
} from '../../lib/api'

export const DECISION_EVENT_TYPE_OPTIONS: Array<{ value: DecisionPointEventType; label: string }> = [
  { value: 'dispatch', label: '派工' },
  { value: 'plan_vs_actual', label: '對帳' },
  { value: 'anomaly_response', label: '異常應對' },
  { value: 'maintenance', label: '保養' },
]

export const ATTRIBUTION_REASON_OPTIONS: Array<{ value: DecisionPointAttributionReason; label: string }> = [
  { value: 'rule_wrong', label: '規則錯' },
  { value: 'data_missing', label: '資料缺' },
  { value: 'schedule_gap', label: '排班缺口' },
  { value: 'skill_matrix_stale', label: '技能表過時' },
  { value: 'implicit_rule', label: '隱性規則' },
  { value: 'foreman_preference', label: '領班偏好' },
  { value: 'site_exception', label: '現場例外' },
  { value: 'other', label: '其他' },
]

export function formatDecisionEventType(value: string) {
  return DECISION_EVENT_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function formatAttributionReason(value: string) {
  return ATTRIBUTION_REASON_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function formatDecisionStatus(value: string) {
  if (value === 'awaiting_actual') return '等待實際'
  if (value === 'resolved') return '已回填'
  return value
}

export function decisionEventTypeBadgeClass(eventType: DecisionPointEventType) {
  if (eventType === 'dispatch') return 'bg-blue-100 text-blue-700'
  if (eventType === 'plan_vs_actual') return 'bg-amber-100 text-amber-800'
  if (eventType === 'anomaly_response') return 'bg-red-100 text-red-700'
  return 'bg-chrome-100 text-chrome-700'
}

export function isDecisionPointAttributed(point: DecisionPoint) {
  return point.attribution !== '' && point.attribution !== 'none'
}

export function consistentMark(consistent: boolean | null) {
  if (consistent === true) return '✅'
  if (consistent === false) return '⚠️'
  return '—'
}

export function decisionActualLabel(point: DecisionPoint) {
  const actual = point.actual ?? {}
  const assignee = actual['assignee']
  if (typeof assignee === 'string' && assignee.trim()) return assignee
  const total = actual['actualTotal']
  if (typeof total === 'number') return `${total} PCS`
  return '尚未回報'
}
