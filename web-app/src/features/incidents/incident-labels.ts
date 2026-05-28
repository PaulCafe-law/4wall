import type { Incident, IncidentSeverity, IncidentSource, IncidentStatus } from '../../lib/types'

export const INCIDENT_STATUS_OPTIONS: Array<{ value: IncidentStatus; label: string }> = [
  { value: 'pending_review', label: '待確認' },
  { value: 'confirmed', label: '已確認' },
  { value: 'in_progress', label: '處理中' },
  { value: 'resolved', label: '已結案' },
  { value: 'false_positive', label: '誤判' },
]

export const INCIDENT_SEVERITY_OPTIONS: Array<{ value: IncidentSeverity; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '緊急' },
]

export const INCIDENT_SOURCE_OPTIONS: Array<{ value: IncidentSource; label: string }> = [
  { value: 'ai_detection', label: 'AI 偵測' },
  { value: 'manual', label: '人工建立' },
  { value: 'pocket_lens', label: 'Pocket Lens' },
  { value: 'camera', label: '固定攝影機' },
  { value: 'drone', label: '無人機' },
  { value: 'vehicle', label: '車載巡檢' },
]

export function formatIncidentStatus(value: string) {
  return INCIDENT_STATUS_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function formatIncidentSeverity(value: string) {
  return INCIDENT_SEVERITY_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function formatIncidentSource(value: string) {
  return INCIDENT_SOURCE_OPTIONS.find((item) => item.value === value)?.label ?? value
}

export function incidentLocationLabel(incident: Incident) {
  const location = incident.location
  return (
    location.description ||
    [location.siteName, location.areaName, location.floor, location.equipmentName]
      .filter(Boolean)
      .join(' / ') ||
    '未指定位置'
  )
}

export function incidentStatusBadgeClass(status: IncidentStatus) {
  if (status === 'resolved') return 'bg-moss-300/40 text-moss-500'
  if (status === 'false_positive') return 'bg-chrome-100 text-chrome-700'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700'
  if (status === 'confirmed') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-700'
}

export function incidentSeverityBadgeClass(severity: IncidentSeverity) {
  if (severity === 'critical') return 'bg-red-100 text-red-700'
  if (severity === 'high') return 'bg-amber-100 text-amber-800'
  if (severity === 'medium') return 'bg-blue-100 text-blue-700'
  return 'bg-chrome-100 text-chrome-700'
}

export function nextStatusActions(status: IncidentStatus): Array<{ label: string; status?: IncidentStatus; reopen?: boolean }> {
  if (status === 'pending_review') {
    return [
      { label: '確認異常', status: 'confirmed' },
      { label: '標記誤判', status: 'false_positive' },
    ]
  }
  if (status === 'confirmed') return [{ label: '開始處理', status: 'in_progress' }]
  if (status === 'in_progress') return [{ label: '標記完成', status: 'resolved' }]
  return [{ label: '重新開啟', reopen: true }]
}
