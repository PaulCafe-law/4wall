import type { SiteMapPlaceholderVariant } from './site-map-config'
import { SiteMapMarkerButton } from './SiteMapMarkerButton'
import type { SiteMapIncidentMarker } from './site-map-utils'

export function SiteMapTwoDViewer({
  markers,
  selectedIncidentId,
  siteLabel,
  planLabel,
  placeholderVariant,
  onSelectIncident,
}: {
  markers: SiteMapIncidentMarker[]
  selectedIncidentId: string | null
  siteLabel: string
  planLabel: string
  placeholderVariant: SiteMapPlaceholderVariant
  onSelectIncident: (incidentId: string) => void
}) {
  const isBri = placeholderVariant === 'bri'
  const isRentHouse = placeholderVariant === 'rent-house'

  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-100">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
      {isRentHouse ? <RentHousePlan /> : isBri ? <BriPlan /> : <DemoPlan />}
      <div className="absolute left-[10%] top-[8%] rounded-full bg-white/90 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-600">
        {planLabel}
      </div>
      <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-xs leading-5 text-chrome-700 shadow-panel">
        {siteLabel} 2D 參考圖。事件標記優先使用 floorplanX / floorplanY，缺少座標時會落在穩定的 fallback 位置。
      </div>
      {markers.map((marker) => (
        <SiteMapMarkerButton
          key={marker.incident.incidentId}
          marker={marker}
          mode="2d"
          selected={marker.incident.incidentId === selectedIncidentId}
          onSelect={onSelectIncident}
        />
      ))}
    </div>
  )
}

function DemoPlan() {
  return (
    <>
      <div className="absolute left-[8%] top-[12%] h-[68%] w-[58%] rounded-[1.25rem] border-2 border-chrome-300 bg-white/70" />
      <div className="absolute left-[20%] top-[12%] h-[68%] w-px bg-chrome-300" />
      <div className="absolute left-[38%] top-[12%] h-[68%] w-px bg-chrome-300" />
      <div className="absolute left-[8%] top-[35%] h-px w-[58%] bg-chrome-300" />
      <div className="absolute left-[8%] top-[57%] h-px w-[58%] bg-chrome-300" />
      <div className="absolute right-[9%] top-[18%] h-[42%] w-[19%] rounded-[1rem] border border-amber-300 bg-amber-100/70" />
      <div className="absolute bottom-[12%] right-[10%] h-[18%] w-[30%] rounded-[1rem] border border-moss-300 bg-moss-300/20" />
    </>
  )
}

function BriPlan() {
  return (
    <>
      <div className="absolute left-[8%] top-[16%] h-[64%] w-[72%] rounded-[1.25rem] border-2 border-chrome-300 bg-white/75" />
      <div className="absolute left-[15%] top-[22%] h-[52%] w-[46%] border border-chrome-300 bg-chrome-200/50" />
      <div className="absolute left-[36%] top-[26%] h-[31%] w-[18%] bg-chrome-900" />
      <div className="absolute left-[45%] top-[31%] h-[38%] w-[13%] bg-chrome-800" />
      <div className="absolute right-[18%] top-[20%] h-[54%] w-[2px] bg-chrome-800" />
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className="absolute right-[15%] h-[5.5%] w-[4%] border border-chrome-300 bg-white/90"
          style={{ top: `${20 + index * 4.2}%` }}
        />
      ))}
      <div className="absolute bottom-[20%] left-[27%] h-[7%] w-[16%] border border-chrome-300 bg-white/80" />
      <div className="absolute right-[18.5%] top-[48%] h-[7%] w-[3%] bg-amber-500/70" />
    </>
  )
}

function RentHousePlan() {
  return (
    <>
      <div className="absolute left-[18%] top-[15%] h-[67%] w-[56%] rounded-[1.25rem] border-2 border-chrome-300 bg-white/78" />
      <div className="absolute left-[23%] top-[20%] h-[25%] w-[20%] rounded-lg border border-chrome-300 bg-chrome-200/55" />
      <div className="absolute left-[48%] top-[20%] h-[25%] w-[20%] rounded-lg border border-chrome-300 bg-chrome-200/55" />
      <div className="absolute left-[23%] top-[52%] h-[23%] w-[45%] rounded-lg border border-chrome-300 bg-white/80" />
      <div className="absolute left-[44%] top-[15%] h-[67%] w-px bg-chrome-300" />
      <div className="absolute left-[18%] top-[48%] h-px w-[56%] bg-chrome-300" />
      <div className="absolute right-[20%] top-[38%] h-[14%] w-[9%] rounded-md border border-amber-300 bg-amber-100/80" />
      <div className="absolute bottom-[18%] left-[34%] h-[7%] w-[18%] rounded-md border border-moss-300 bg-moss-300/20" />
    </>
  )
}
