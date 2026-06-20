import { useEffect, useState } from 'react'
import { Application, Entity } from '@playcanvas/react'
import { Camera, GSplat, Script } from '@playcanvas/react/components'
import { useSplat } from '@playcanvas/react/hooks'
import { FILLMODE_NONE, RESOLUTION_AUTO } from 'playcanvas'
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs'

type SogViewerState = 'waiting' | 'loading' | 'loaded' | 'error'

export function SiteMapSogViewer({
  assetUrl,
  siteLabel,
  modelAssetPath,
  manifestLoading,
  manifestError,
}: {
  assetUrl: string | null
  siteLabel: string
  modelAssetPath: string
  manifestLoading: boolean
  manifestError: boolean
}) {
  const [viewerState, setViewerState] = useState<SogViewerState>(assetUrl ? 'loading' : 'waiting')

  useEffect(() => {
    setViewerState(assetUrl ? 'loading' : 'waiting')
  }, [assetUrl])

  if (import.meta.env.MODE === 'test') {
    return (
      <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_36%_30%,rgba(111,143,132,0.32),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.10),transparent_45%)]" />
        <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white">
          SOG 場域測試模式
        </div>
        <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs leading-5 text-white/85">
          {siteLabel} 會在瀏覽器中以 PlayCanvas 載入 `{modelAssetPath}`。
        </div>
      </div>
    )
  }

  const statusLabel =
    viewerState === 'loaded'
      ? 'SOG 場域已載入'
      : viewerState === 'error' || manifestError
        ? 'SOG 場域無法載入'
        : manifestLoading || viewerState === 'loading'
          ? 'SOG 場域載入中'
          : '等待短效模型 URL'

  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-[1.5rem] border border-chrome-200 bg-chrome-950">
      {assetUrl ? (
        <Application
          className="absolute inset-0 h-full w-full"
          style={{ width: '100%', height: '100%' }}
          fillMode={FILLMODE_NONE}
          resolutionMode={RESOLUTION_AUTO}
          graphicsDeviceOptions={{ antialias: false }}
        >
          <Entity name="Camera" position={[0, 0.4, 3.4]}>
            <Camera fov={58} nearClip={0.01} farClip={1000} />
            <Script script={CameraControls} />
          </Entity>
          <RentHouseSogAsset assetUrl={assetUrl} onStateChange={setViewerState} />
        </Application>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_36%_30%,rgba(111,143,132,0.32),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.10),transparent_45%)]" />
      )}

      <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white shadow-panel backdrop-blur">
        {statusLabel}
      </div>
      {viewerState !== 'loaded' || manifestError ? (
        <div className="absolute bottom-4 left-4 max-w-md rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs leading-5 text-white/85 shadow-panel backdrop-blur">
          {manifestError
            ? '無法取得登入後短效模型 URL。請確認帳號權限、API 設定與 R2 asset key。'
            : `${siteLabel} 使用 private R2 SOG 資產，取得短效 URL 後才會開始載入。`}
        </div>
      ) : null}
    </div>
  )
}

function RentHouseSogAsset({
  assetUrl,
  onStateChange,
}: {
  assetUrl: string
  onStateChange: (state: SogViewerState) => void
}) {
  const { asset, loading, error } = useSplat(assetUrl)

  useEffect(() => {
    if (error) {
      onStateChange('error')
      return
    }
    if (loading || !asset) {
      onStateChange('loading')
      return
    }
    onStateChange('loaded')
  }, [asset, error, loading, onStateChange])

  if (!asset) return null

  return (
    <Entity name="Rent House SOG" rotation={[0, 0, 180]} position={[0, -0.7, 0]}>
      <GSplat asset={asset} />
    </Entity>
  )
}
