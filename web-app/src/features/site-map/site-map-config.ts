import type { Incident } from '../../lib/types'

export type SiteMapKey = 'demo' | 'bri'
export type SiteMapPlaceholderVariant = 'demo' | 'bri'

export interface SiteMapConfig {
  key: SiteMapKey
  label: string
  description: string
  modelUrl: string
  modelAssetPath: string
  planLabel: string
  placeholderVariant: SiteMapPlaceholderVariant
}

export const DEFAULT_SITE_MAP_KEY: SiteMapKey = 'demo'

export const SITE_MAP_CONFIGS: SiteMapConfig[] = [
  {
    key: 'demo',
    label: '示範場域',
    description: '現有異常事件示範場域',
    modelUrl: '/models/site-model.glb',
    modelAssetPath: 'web-app/public/models/site-model.glb',
    planLabel: '2F site plan',
    placeholderVariant: 'demo',
  },
  {
    key: 'bri',
    label: '建研所',
    description: '建研所 Revit / Datasmith 來源的 web 模型槽位',
    modelUrl: '/models/bri-site-model.glb',
    modelAssetPath: 'web-app/public/models/bri-site-model.glb',
    planLabel: '建研所 site plan',
    placeholderVariant: 'bri',
  },
]

export function getSiteMapConfig(value: string | null | undefined) {
  return SITE_MAP_CONFIGS.find((config) => config.key === value) ?? SITE_MAP_CONFIGS[0]
}

export function siteMapKeyForIncident(incident: Incident): SiteMapKey | null {
  const values = [
    incident.siteId,
    incident.location.siteId,
    incident.location.siteName,
    incident.location.description,
    incident.location.anchorId,
    incident.location.modelObjectId,
    incident.location.revitElementId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (values.includes('建研所') || values.includes('bri')) return 'bri'
  return null
}

export function incidentSiteMapLink(incident: Incident) {
  const params = new URLSearchParams()
  const mapKey = siteMapKeyForIncident(incident)
  if (mapKey && mapKey !== DEFAULT_SITE_MAP_KEY) params.set('map', mapKey)
  params.set('incidentId', incident.incidentId)
  return `/site-map?${params.toString()}`
}
