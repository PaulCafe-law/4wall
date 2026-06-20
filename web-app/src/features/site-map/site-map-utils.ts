import type { Incident, IncidentSeverity, IncidentStatus } from '../../lib/types'

export type SiteMapViewMode = '3d' | '2d'

export interface SiteMapIncidentMarker {
  incident: Incident
  x2d: number
  y2d: number
  x3d: number
  y3d: number
  worldX: number
  worldY: number
  worldZ: number
  usedFallback2d: boolean
  usedFallback3d: boolean
}

export const SITE_MAP_STATUS_OPTIONS: Array<{ value: IncidentStatus; label: string }> = [
  { value: 'pending_review', label: '待複核' },
  { value: 'confirmed', label: '已確認' },
  { value: 'in_progress', label: '處理中' },
  { value: 'resolved', label: '已解決' },
  { value: 'false_positive', label: '誤判' },
]

export const SITE_MAP_SEVERITY_OPTIONS: Array<{ value: IncidentSeverity; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '嚴重' },
]

const severityRank: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function formatSiteMapDisplayText(value: string | null | undefined, fallback: string) {
  const text = value?.trim()
  if (!text || hasMojibake(text)) return fallback
  return text
}

function hasMojibake(value: string) {
  return /[�]|嚗|蝷|撱|雿|鈭|銝|摰|敺|甇|獢|隤|蝣|璅/.test(value)
}

export function formatSiteMapStatus(status: IncidentStatus) {
  return SITE_MAP_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status
}

export function formatSiteMapSeverity(severity: IncidentSeverity) {
  return SITE_MAP_SEVERITY_OPTIONS.find((item) => item.value === severity)?.label ?? severity
}

export function siteMapStatusBadgeClass(status: IncidentStatus) {
  if (status === 'resolved') return 'bg-moss-300/40 text-moss-500'
  if (status === 'false_positive') return 'bg-chrome-100 text-chrome-700'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700'
  if (status === 'confirmed') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-700'
}

export function siteMapSeverityBadgeClass(severity: IncidentSeverity) {
  if (severity === 'critical') return 'bg-red-100 text-red-700'
  if (severity === 'high') return 'bg-amber-100 text-amber-800'
  if (severity === 'medium') return 'bg-blue-100 text-blue-700'
  return 'bg-chrome-100 text-chrome-700'
}

export function incidentLocationText(incident: Incident) {
  const location = incident.location
  const rawLocation =
    location.description ||
    [location.siteName, location.areaName, location.floor, location.equipmentName].filter(Boolean).join(' / ') ||
    '未指定位置'
  return formatSiteMapDisplayText(rawLocation, '未指定位置')
}

export function siteMapIncidentTitle(incident: Incident) {
  const location = incidentLocationText(incident)
  const fallback = location === '未指定位置' ? '未命名異常事件' : `${location} 異常事件`
  return formatSiteMapDisplayText(incident.title, fallback)
}

export function siteMapIncidentDescription(incident: Incident) {
  return formatSiteMapDisplayText(
    incident.description || incident.aiSummary,
    '尚未提供事件描述。請進入事件詳情補充現場資訊、處理狀態與證據。',
  )
}

export function siteMapAssigneeText(incident: Incident) {
  return formatSiteMapDisplayText(incident.assigneeName, '尚未指派')
}

export function siteMapAnchorText(incident: Incident) {
  return formatSiteMapDisplayText(
    incident.location.anchorId || incident.location.modelObjectId || incident.location.revitElementId,
    '尚未綁定',
  )
}

export function sortSiteMapIncidents(incidents: Incident[]) {
  return [...incidents].sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity]
    if (severityDelta !== 0) return severityDelta
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

export function createSiteMapMarkers(incidents: Incident[]): SiteMapIncidentMarker[] {
  const sorted = sortSiteMapIncidents(incidents)
  const worldBounds = getWorldBounds(sorted)

  return sorted.map((incident, index) => {
    const fallback = fallbackPoint(index)
    const floorplanX = normalizePlanCoordinate(incident.location.floorplanX)
    const floorplanY = normalizePlanCoordinate(incident.location.floorplanY)
    const hasWorld =
      typeof incident.location.worldX === 'number' &&
      typeof incident.location.worldY === 'number' &&
      typeof incident.location.worldZ === 'number'

    const projected = hasWorld
      ? projectWorldPoint(
          incident.location.worldX ?? 0,
          incident.location.worldZ ?? 0,
          worldBounds,
        )
      : fallback

    return {
      incident,
      x2d: floorplanX ?? projected.x,
      y2d: floorplanY ?? projected.y,
      x3d: projected.x,
      y3d: projected.y,
      worldX: incident.location.worldX ?? fallback.worldX,
      worldY: incident.location.worldY ?? fallback.worldY,
      worldZ: incident.location.worldZ ?? fallback.worldZ,
      usedFallback2d: floorplanX === null || floorplanY === null,
      usedFallback3d: !hasWorld,
    }
  })
}

function fallbackPoint(index: number) {
  const column = index % 4
  const row = Math.floor(index / 4)
  return {
    x: clampPercent(18 + column * 21),
    y: clampPercent(24 + row * 18),
    worldX: -18 + column * 12,
    worldY: 2,
    worldZ: -12 + row * 10,
  }
}

function normalizePlanCoordinate(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  if (value >= 0 && value <= 1) return clampPercent(value * 100)
  return clampPercent(value)
}

function clampPercent(value: number) {
  return Math.max(6, Math.min(94, value))
}

function getWorldBounds(incidents: Incident[]) {
  const worldPoints = incidents
    .filter((incident) => typeof incident.location.worldX === 'number' && typeof incident.location.worldZ === 'number')
    .map((incident) => ({
      x: incident.location.worldX ?? 0,
      z: incident.location.worldZ ?? 0,
    }))

  if (worldPoints.length === 0) {
    return { minX: -24, maxX: 24, minZ: -16, maxZ: 24 }
  }

  const xs = worldPoints.map((point) => point.x)
  const zs = worldPoints.map((point) => point.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  return {
    minX: minX === maxX ? minX - 12 : minX,
    maxX: minX === maxX ? maxX + 12 : maxX,
    minZ: minZ === maxZ ? minZ - 12 : minZ,
    maxZ: minZ === maxZ ? maxZ + 12 : maxZ,
  }
}

function projectWorldPoint(
  x: number,
  z: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  const normalizedX = (x - bounds.minX) / (bounds.maxX - bounds.minX)
  const normalizedZ = (z - bounds.minZ) / (bounds.maxZ - bounds.minZ)
  return {
    x: clampPercent(16 + normalizedX * 68),
    y: clampPercent(22 + normalizedZ * 56),
  }
}
