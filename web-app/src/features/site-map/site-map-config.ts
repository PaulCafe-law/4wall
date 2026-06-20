import type { Incident } from '../../lib/types'

export type SiteMapKey = 'demo' | 'bri' | 'rent-house'
export type SiteMapPlaceholderVariant = 'demo' | 'bri' | 'rent-house'
export type SiteMapAssetKind = 'glb' | 'sog'

export interface SiteMapConfig {
  key: SiteMapKey
  label: string
  description: string
  assetKind: SiteMapAssetKind
  modelUrl?: string
  manifestAssetKey?: string
  modelAssetPath: string
  planLabel: string
  placeholderVariant: SiteMapPlaceholderVariant
  internalOnly?: boolean
}

export const DEFAULT_SITE_MAP_KEY: SiteMapKey = 'demo'

export const SITE_MAP_CONFIGS: SiteMapConfig[] = [
  {
    key: 'demo',
    label: '示範場域',
    description: '預設 2D / 3D 佔位場域，用於事件定位流程測試。',
    assetKind: 'glb',
    modelUrl: '/models/site-model.glb',
    modelAssetPath: 'web-app/public/models/site-model.glb',
    planLabel: '2F site plan',
    placeholderVariant: 'demo',
  },
  {
    key: 'bri',
    label: '建研所',
    description: '既有 GLB 場域模型，作為租屋處 3DGS 流程的比較基準。',
    assetKind: 'glb',
    modelUrl: '/models/bri-site-model.glb',
    modelAssetPath: 'web-app/public/models/bri-site-model.glb',
    planLabel: '建研所 site plan',
    placeholderVariant: 'bri',
  },
  {
    key: 'rent-house',
    label: '租屋處',
    description: 'SuperSplat 裁切後的 3D Gaussian Splat SOG 場域，透過登入後短效 URL 載入。',
    assetKind: 'sog',
    manifestAssetKey: 'rent-house',
    modelAssetPath: 'private R2: site-map-assets/rent-house/v1/rent-house.v1.sog',
    planLabel: '租屋處 3DGS',
    placeholderVariant: 'rent-house',
    internalOnly: true,
  },
]

export function visibleSiteMapConfigs({ includeInternal }: { includeInternal: boolean }) {
  return SITE_MAP_CONFIGS.filter((config) => includeInternal || !config.internalOnly)
}

export function getSiteMapConfig(value: string | null | undefined, configs: SiteMapConfig[] = SITE_MAP_CONFIGS) {
  return configs.find((config) => config.key === value) ?? configs[0] ?? SITE_MAP_CONFIGS[0]
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
  if (values.includes('租屋處') || values.includes('rent-house') || values.includes('rent house')) return 'rent-house'
  return null
}

export function incidentSiteMapLink(incident: Incident) {
  const params = new URLSearchParams()
  const mapKey = siteMapKeyForIncident(incident)
  if (mapKey && mapKey !== DEFAULT_SITE_MAP_KEY) params.set('map', mapKey)
  params.set('incidentId', incident.incidentId)
  return `/site-map?${params.toString()}`
}
