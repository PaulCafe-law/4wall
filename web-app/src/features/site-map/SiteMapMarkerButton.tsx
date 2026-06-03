import { clsx } from 'clsx'

import type { SiteMapIncidentMarker } from './site-map-utils'
import {
  formatSiteMapSeverity,
  formatSiteMapStatus,
  siteMapSeverityBadgeClass,
  siteMapIncidentTitle,
} from './site-map-utils'

export function SiteMapMarkerButton({
  marker,
  mode,
  selected,
  screenPosition,
  onSelect,
}: {
  marker: SiteMapIncidentMarker
  mode: '2d' | '3d'
  selected: boolean
  screenPosition?: { left: number; top: number; visible: boolean }
  onSelect: (incidentId: string) => void
}) {
  const left = screenPosition?.left ?? (mode === '2d' ? marker.x2d : marker.x3d)
  const top = screenPosition?.top ?? (mode === '2d' ? marker.y2d : marker.y3d)
  const title = siteMapIncidentTitle(marker.incident)

  return (
    <button
      type="button"
      aria-label={`${title}：${formatSiteMapStatus(marker.incident.status)}`}
      className={clsx(
        'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border px-3 py-2 text-left shadow-panel transition focus:outline-none focus:ring-2 focus:ring-ember-300/70',
        selected
          ? 'border-chrome-950 bg-chrome-950 text-white'
          : 'border-white/80 bg-white/95 text-chrome-950 hover:border-chrome-300',
        screenPosition && !screenPosition.visible ? 'pointer-events-none opacity-0' : null,
      )}
      style={{ left: `${left}%`, top: `${top}%` }}
      onClick={() => onSelect(marker.incident.incidentId)}
    >
      <span
        className={clsx(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          marker.incident.severity === 'critical'
            ? 'bg-red-500'
            : marker.incident.severity === 'high'
              ? 'bg-amber-500'
              : marker.incident.severity === 'medium'
                ? 'bg-blue-500'
                : 'bg-moss-500',
        )}
      />
      <span className="min-w-0">
        <span className="block max-w-[13rem] truncate text-xs font-semibold">{title}</span>
        <span
          className={clsx(
            'mt-1 inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
            selected ? 'bg-white/15 text-white' : siteMapSeverityBadgeClass(marker.incident.severity),
          )}
        >
          {formatSiteMapSeverity(marker.incident.severity)}
        </span>
      </span>
    </button>
  )
}
