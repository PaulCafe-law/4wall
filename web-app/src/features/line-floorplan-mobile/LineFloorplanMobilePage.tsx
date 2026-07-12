import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const POLL_INTERVAL_MS = 10_000
const STATUS_COLORS: Record<string, string> = {
  red: '#BF4A3F',
  yellow: '#C4851C',
  green: '#2F6857',
  gray: '#7A8697',
}

interface RectPayload {
  x: number
  y: number
  width: number
  height: number
}

interface PointPayload {
  x: number
  y: number
}

interface GaugePayload {
  gaugeId: string
  label: string
  value: number | null
  unit: string
  confidence: number
  status: string
  minutesAgo: number | null
  trend: string
  stale: boolean
}

interface MachinePayload {
  id: string
  label: string
  rect: RectPayload
  point: PointPayload
  status: string
  gauges: GaugePayload[]
  lineEnabled?: boolean
}

interface IncidentPayload {
  id: string
  title: string
  severity: string
  status: string
  machineId: string | null
  machineLabel: string | null
  point: PointPayload | null
}

interface CameraPayload {
  nameContains: string
  label: string
  point: PointPayload
  machineId: string | null
  status: string
  matchedCount: number
}

interface FloorplanStatePayload {
  siteSlug: string
  siteName: string
  serverTime: string
  canvas: { width: number; height: number }
  zones: Array<{ id: string; label: string; rect: RectPayload }>
  machines: MachinePayload[]
  cameras: CameraPayload[]
  incidents: IncidentPayload[]
}

interface MachineDetailPayload {
  machineId: string
  label: string
  siteName: string
  gauges: GaugePayload[]
  todayIncidentCount: number
  thumbnailUrl: string | null
  thumbnailFallbackText: string | null
  lineEnabled: boolean
  hmiScreen: HmiScreenPayload | null
}

interface HmiFieldPayload {
  label: string
  value: string
  confidence: number
}

interface HmiSectionPayload {
  label: string
  fields: HmiFieldPayload[]
}

interface HmiScreenPayload {
  machineLabel: string
  modeLabel: string
  capturedAt: string
  sections: HmiSectionPayload[]
  rawLines: string[]
}

interface ViewState {
  x: number
  y: number
  scale: number
}

interface PointerPoint {
  x: number
  y: number
}

interface GestureState {
  center: PointerPoint
  distance: number
}

export function LineFloorplanMobilePage() {
  const { siteSlug = '' } = useParams()
  const location = useLocation()
  const search = useMemo(() => new URLSearchParams(location.search), [location.search])
  const token = search.get('token') ?? ''
  const focus = search.get('focus') ?? ''
  const [state, setState] = useState<FloorplanStatePayload | null>(null)
  const [machineDetail, setMachineDetail] = useState<MachineDetailPayload | null>(null)
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [errorMode, setErrorMode] = useState<'missing-token' | 'expired' | null>(token ? null : 'missing-token')
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 })
  const stateRef = useRef<FloorplanStatePayload | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, PointerPoint>())
  const gestureRef = useRef<GestureState | null>(null)

  const clampView = useCallback((next: ViewState, canvas = state?.canvas): ViewState => {
    if (!canvas) {
      return next
    }
    const scale = Math.min(3, Math.max(1, next.scale))
    const width = canvas.width / scale
    const height = canvas.height / scale
    return {
      scale,
      x: Math.min(canvas.width - width, Math.max(0, next.x)),
      y: Math.min(canvas.height - height, Math.max(0, next.y)),
    }
  }, [state?.canvas])

  const centerOnPoint = useCallback((point: PointPayload, nextScale = 1.8) => {
    setView((current) => {
      const canvas = state?.canvas
      if (!canvas) {
        return current
      }
      const scale = Math.max(current.scale, nextScale)
      return clampView(
        {
          scale,
          x: point.x - canvas.width / scale / 2,
          y: point.y - canvas.height / scale / 2,
        },
        canvas,
      )
    })
  }, [clampView, state?.canvas])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const loadState = useCallback(async (silent = false) => {
    if (!token || !siteSlug) {
      setErrorMode('missing-token')
      return
    }
    try {
      if (!silent) {
        setIsReconnecting(false)
      }
      const payload = await fetchJson<FloorplanStatePayload>(
        `/v1/line/floorplan/${encodeURIComponent(siteSlug)}/state?token=${encodeURIComponent(token)}`,
      )
      setState(payload)
      setErrorMode(null)
      setIsReconnecting(false)
    } catch (error) {
      if (isAuthFailure(error)) {
        setErrorMode('expired')
        return
      }
      if (stateRef.current) {
        setIsReconnecting(true)
      } else {
        setErrorMode('expired')
      }
    }
  }, [siteSlug, token])

  const loadMachine = useCallback(async (machineId: string, focusAfterLoad = false) => {
    if (!token || !siteSlug) {
      setErrorMode('missing-token')
      return
    }
    setSelectedMachineId(machineId)
    setMachineDetail(null)
    const machine = state?.machines.find((item) => item.id === machineId)
    if (machine?.lineEnabled === false) {
      if (focusAfterLoad) {
        centerOnPoint(machine.point)
      }
      return
    }
    try {
      const payload = await fetchJson<MachineDetailPayload>(
        `/v1/line/floorplan/${encodeURIComponent(siteSlug)}/machine/${encodeURIComponent(machineId)}?token=${encodeURIComponent(token)}`,
      )
      setMachineDetail(payload)
      if (focusAfterLoad) {
        if (machine) {
          centerOnPoint(machine.point)
        }
      }
    } catch (error) {
      if (isAuthFailure(error)) {
        setErrorMode('expired')
      }
    }
  }, [centerOnPoint, siteSlug, state?.machines, token])

  useEffect(() => {
    void loadState()
    const interval = window.setInterval(() => {
      void loadState(true)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadState])

  useEffect(() => {
    if (!state || !focus) {
      return
    }
    if (focus.startsWith('machine:')) {
      const machineId = focus.slice('machine:'.length)
      const machine = state.machines.find((item) => item.id === machineId)
      if (machine) {
        centerOnPoint(machine.point)
        void loadMachine(machine.id)
      }
      return
    }
    if (focus.startsWith('incident:')) {
      const incidentId = focus.slice('incident:'.length)
      const incident = state.incidents.find((item) => item.id === incidentId)
      if (incident?.point) {
        centerOnPoint(incident.point)
      }
      if (incident?.machineId) {
        void loadMachine(incident.machineId)
      }
    }
  }, [centerOnPoint, focus, loadMachine, state])

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!state || !pointersRef.current.has(event.pointerId)) {
      return
    }
    const previous = pointersRef.current.get(event.pointerId)!
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const pointers = Array.from(pointersRef.current.values())
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    if (pointers.length === 1) {
      const dx = ((previous.x - event.clientX) / rect.width) * (state.canvas.width / view.scale)
      const dy = ((previous.y - event.clientY) / rect.height) * (state.canvas.height / view.scale)
      setView((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }))
      return
    }
    if (pointers.length >= 2) {
      const gesture = buildGesture(pointers[0], pointers[1])
      const previousGesture = gestureRef.current
      gestureRef.current = gesture
      if (!previousGesture) {
        return
      }
      const nextScale = view.scale * (gesture.distance / previousGesture.distance)
      const dx = ((previousGesture.center.x - gesture.center.x) / rect.width) * (state.canvas.width / view.scale)
      const dy = ((previousGesture.center.y - gesture.center.y) / rect.height) * (state.canvas.height / view.scale)
      setView((current) => clampView({ scale: nextScale, x: current.x + dx, y: current.y + dy }))
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId)
    gestureRef.current = null
  }

  if (errorMode) {
    return <TokenPrompt />
  }

  if (!state) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#F4EFE7] px-6 text-[#171B1F]">
        <p className="text-sm">載入廠區圖</p>
      </main>
    )
  }

  const selectedMachine = selectedMachineId
    ? state.machines.find((machine) => machine.id === selectedMachineId)
    : null
  const focusedIncidentId = focus.startsWith('incident:') ? focus.slice('incident:'.length) : null
  const viewBox = `${view.x} ${view.y} ${state.canvas.width / view.scale} ${state.canvas.height / view.scale}`

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#F4EFE7] text-[#171B1F]">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-[#171B1F]/15 bg-[#F4EFE7]/92 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase text-[#465262]">LINE LIVE VIEW</p>
            <h1 className="text-xl font-semibold leading-tight">{state.siteName}</h1>
          </div>
          <div className="text-right text-[11px] text-[#465262]">
            <p>讀值為現場實況</p>
            <p>{formatTime(state.serverTime)}</p>
          </div>
        </div>
      </header>

      <section className="relative h-[100dvh] pt-[74px]">
        <svg
          ref={svgRef}
          aria-label={`${state.siteName} 即時平面圖`}
          className="h-full w-full select-none bg-[#F4EFE7]"
          data-testid="floorplan-svg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
          viewBox={viewBox}
        >
          <rect x="0" y="0" width={state.canvas.width} height={state.canvas.height} fill="#F4EFE7" />
          {state.zones.map((zone) => (
            <g key={zone.id}>
              <rect
                x={zone.rect.x}
                y={zone.rect.y}
                width={zone.rect.width}
                height={zone.rect.height}
                fill="#E8D6B7"
                fillOpacity="0.45"
                stroke="#171B1F"
                strokeOpacity="0.35"
                strokeWidth="2"
              />
              <text x={zone.rect.x + 14} y={zone.rect.y + 28} fill="#171B1F" fontSize="20" fontWeight="700">
                {zone.label}
              </text>
            </g>
          ))}
          {state.machines.map((machine) => (
            <g
              key={machine.id}
              data-status={machine.status}
              data-testid={`machine-${machine.id}`}
              onClick={() => void loadMachine(machine.id, true)}
            >
              <rect
                x={machine.rect.x}
                y={machine.rect.y}
                width={machine.rect.width}
                height={machine.rect.height}
                rx="8"
                fill={machine.id === selectedMachineId ? '#FFF7E6' : '#FFFFFF'}
                stroke={machine.id === selectedMachineId ? '#171B1F' : statusColor(machine.status)}
                strokeWidth={machine.id === selectedMachineId ? 5 : 4}
              />
              <text x={machine.rect.x + 12} y={machine.rect.y + 30} fill="#171B1F" fontSize="18" fontWeight="700">
                {machine.label}
              </text>
              <circle
                cx={machine.rect.x + machine.rect.width - 18}
                cy={machine.rect.y + 18}
                r="9"
                fill={statusColor(machine.status)}
              />
            </g>
          ))}
          {state.cameras.map((camera) => (
            <g key={camera.nameContains}>
              <circle cx={camera.point.x} cy={camera.point.y} r="13" fill="#171B1F" />
              <circle cx={camera.point.x} cy={camera.point.y} r="8" fill={statusColor(camera.status)} />
              <text x={camera.point.x + 16} y={camera.point.y + 5} fill="#171B1F" fontSize="14" fontWeight="700">
                {camera.label}
              </text>
            </g>
          ))}
          {state.incidents.map((incident) => {
            if (!incident.point) {
              return null
            }
            const focused = incident.id === focusedIncidentId
            return (
              <g key={incident.id} data-testid={`incident-${incident.id}`}>
                <circle
                  cx={incident.point.x}
                  cy={incident.point.y}
                  r={focused ? 18 : 13}
                  fill="#BF4A3F"
                  fillOpacity={focused ? 0.9 : 0.75}
                  stroke="#171B1F"
                  strokeWidth={focused ? 4 : 2}
                />
                <text x={incident.point.x + 18} y={incident.point.y - 14} fill="#BF4A3F" fontSize="14" fontWeight="700">
                  {incident.title}
                </text>
              </g>
            )
          })}
        </svg>

        {isReconnecting ? (
          <div className="absolute left-4 right-4 top-24 z-30 rounded-md border border-[#C4851C]/40 bg-[#FFF7E6] px-3 py-2 text-sm text-[#6A4510] shadow-sm">
            重新連線中
          </div>
        ) : null}
      </section>

      {selectedMachine ? (
        <MachineSheet
          detail={machineDetail}
          machine={selectedMachine}
          onClose={() => {
            setSelectedMachineId(null)
            setMachineDetail(null)
          }}
        />
      ) : null}
    </main>
  )
}

function MachineSheet({
  detail,
  machine,
  onClose,
}: {
  detail: MachineDetailPayload | null
  machine: MachinePayload
  onClose: () => void
}) {
  const machineLabel = detail?.label ?? machine.label
  const unavailable = machine.lineEnabled === false || detail?.lineEnabled === false
  return (
    <aside className="fixed bottom-0 left-0 right-0 z-40 max-h-[58dvh] overflow-y-auto rounded-t-lg border-t border-[#171B1F]/15 bg-white px-4 pb-5 pt-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase text-[#7A8697]">{machine.id}</p>
          <h2 className="text-lg font-semibold text-[#171B1F]">{machineLabel}</h2>
          <p className="text-sm text-[#465262]">今日異常 {detail?.todayIncidentCount ?? 0} 件</p>
        </div>
        <button
          aria-label="關閉"
          className="grid h-9 w-9 place-items-center rounded-md border border-[#D8DEE6] text-xl leading-none"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      {unavailable ? (
        <div className="rounded-md border border-[#DED5C8] bg-[#F4EFE7] px-4 py-4 text-sm font-semibold text-[#171B1F]" role="status">
          {machineLabel} 尚未開通。
        </div>
      ) : (
        <>
          {detail?.thumbnailUrl ? (
            <img
              alt={`${detail.label} 最新截圖`}
              className="mb-4 aspect-video w-full rounded-md object-cover"
              referrerPolicy="no-referrer"
              src={detail.thumbnailUrl}
            />
          ) : (
            <div className="mb-4 grid aspect-video w-full place-items-center rounded-md bg-[#EBEFF4] text-sm text-[#465262]">
              {detail?.thumbnailFallbackText ?? '載入縮圖'}
            </div>
          )}
          {detail === null ? (
            <div className="rounded-md border border-[#DED5C8] px-4 py-4 text-sm text-[#465262]" role="status">
              載入機台資訊…
            </div>
          ) : detail.hmiScreen ? (
            <HmiScreenPanel screen={detail.hmiScreen} />
          ) : (
            <div className="rounded-md border border-[#C4851C]/40 bg-[#FFF7E6] px-4 py-4 text-sm text-[#6A4510]" role="status">
              {machineLabel} 目前沒有 3 分鐘內可確認的螢幕資訊。
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function HmiScreenPanel({ screen }: { screen: HmiScreenPayload }) {
  return (
    <section className="rounded-md border border-[#DED5C8] bg-[#F4EFE7] px-4 py-4" aria-label={`${screen.machineLabel} 螢幕資訊`}>
      <div className="flex items-start justify-between gap-3 border-b border-[#DED5C8] pb-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-[#7A8697]">HMI SCREEN</p>
          <h3 className="mt-1 text-base font-semibold text-[#171B1F]">{screen.modeLabel}</h3>
        </div>
        <time className="font-mono text-[11px] text-[#465262]" dateTime={screen.capturedAt}>
          拍攝 {formatTime(screen.capturedAt)}
        </time>
      </div>

      {screen.sections.length > 0 ? (
        <div className="mt-3 space-y-3">
          {screen.sections.map((section) => (
            <section key={section.label}>
              <h4 className="mb-1.5 text-sm font-semibold text-[#171B1F]">{section.label}</h4>
              <dl className="divide-y divide-[#DED5C8] border-y border-[#DED5C8]">
                {section.fields.map((field) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2" key={`${field.label}:${field.value}`}>
                    <dt className="min-w-0 text-sm text-[#465262]">{field.label}</dt>
                    <dd className="text-right">
                      <span className="font-mono text-sm font-semibold text-[#171B1F]">{field.value}</span>
                      <span className="ml-2 font-mono text-[10px] text-[#7A8697]">
                        {Math.round(field.confidence * 100)}%
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : null}

      {screen.rawLines.length > 0 ? (
        <div className="mt-3 border-t border-[#DED5C8] pt-3">
          <h4 className="mb-2 text-xs font-semibold text-[#465262]">畫面辨識文字</h4>
          <ul className="space-y-1 font-mono text-xs text-[#171B1F]">
            {screen.rawLines.map((line, index) => (
              <li key={`${index}:${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function TokenPrompt() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#F4EFE7] px-6 text-center text-[#171B1F]">
      <div>
        <p className="text-lg font-semibold">請回 LINE 重新開啟</p>
        <p className="mt-2 text-sm text-[#465262]">此連結已過期或缺少授權。</p>
      </div>
    </main>
  )
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'omit' })
  if (!response.ok) {
    throw new PublicApiError(response.status)
  }
  return (await response.json()) as T
}

class PublicApiError extends Error {
  status: number

  constructor(status: number) {
    super(`public_api_${status}`)
    this.status = status
  }
}

function isAuthFailure(error: unknown) {
  return error instanceof PublicApiError && error.status === 403
}

function statusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.gray
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function buildGesture(first: PointerPoint, second: PointerPoint): GestureState {
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(first.x - second.x, first.y - second.y),
  }
}
