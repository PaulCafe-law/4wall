import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'

import {
  ActionButton,
  EmptyState,
  Field,
  Input,
  Metric,
  Panel,
  Select,
  ShellSection,
  TextArea,
  formatDateTime,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import type { IndustrialEngineJob, IndustrialEngineMode } from '../../lib/types'

const cameraModeOptions = [
  'fixed_camera',
  'amr_camera',
  'drone_camera',
  'phone_camera',
  'robot_dog_camera',
] as const

const modeLabels: Record<IndustrialEngineMode, string> = {
  text_to_world: '文字生成場景',
  real_factory_photos_to_world: '真實照片生成場景',
}

const cameraModeLabels: Record<(typeof cameraModeOptions)[number], string> = {
  fixed_camera: '固定式監視器',
  amr_camera: 'AMR 巡檢車視角',
  drone_camera: '室內無人機視角',
  phone_camera: '手機手持視角',
  robot_dog_camera: '四足機器人視角',
}

const stageLabels: Record<string, string> = {
  validate_environment: '檢查執行環境',
  generate_factory_scene_description_with_codex_oauth: 'Codex OAuth 產生工廠場景描述',
  generate_reference_image_prompt_with_codex_oauth: 'Codex OAuth 產生參考影像提示',
  generate_factory_scene_description_with_gemini: '產生工廠場景描述',
  generate_reference_image_prompt_with_gemini: '產生參考影像提示',
  create_world_with_world_labs_marble: '建立 World Labs 3D 場景',
  prepare_metric_world_asset: '準備可量測的 3D 場景資產',
  generate_initial_camera_poses: '產生初始相機視角',
  render_rgb_depth_with_gsplat: '渲染 RGB 與深度圖',
  run_boxer_annotation: '執行 Boxer 標註',
  distance_aware_refinement: '依距離修正標註結果',
  plan_extra_observation_views: '規劃補充觀測視角',
  render_extra_observations: '渲染補充觀測資料',
  rerun_boxer_and_fuse: '重新標註並融合結果',
  generate_industrial_incidents_with_codex_oauth: 'Codex OAuth 產生工業異常事件',
  generate_inspection_tasks_with_codex_oauth: 'Codex OAuth 產生巡檢任務',
  generate_industrial_incidents_with_gemini: '產生工業異常事件',
  generate_inspection_tasks_with_gemini: '產生巡檢任務',
  render_dataset_samples: '建立資料集樣本',
  quality_judge_with_ollama_qwen_vlm: '使用 Ollama Qwen-VL 檢查品質',
  generate_evidence_cards_with_codex_oauth: 'Codex OAuth 產生證據卡',
  generate_site_state_json_with_codex_oauth: 'Codex OAuth 產生場域狀態資料',
  generate_evidence_cards_with_gemini: '產生證據卡',
  generate_site_state_json_with_gemini: '產生場域狀態資料',
  export_dataset: '匯出資料集',
}

const statusLabels: Record<string, string> = {
  pending: '等待中',
  queued: '排隊中',
  running: '執行中',
  succeeded: '已完成',
  failed: '失敗',
  skipped: '已略過',
}

const errorLabels: Record<string, string> = {
  industrial_engine_job_create_failed: '建立資料引擎任務失敗，請稍後再試。',
  photos_required_for_real_factory_mode: '照片生成場景模式至少需要上傳一張工廠照片。',
  empty_photo_upload: '上傳的照片是空檔，請重新選擇檔案。',
  invalid_industrial_engine_mode: '任務模式不正確，請重新選擇。',
  organization_not_found: '找不到指定組織。',
  site_not_found: '找不到指定場域。',
  site_not_in_organization: '這個場域不屬於目前選擇的組織。',
  artifact_download_failed: '下載成果失敗，請稍後再試。',
  industrial_engine_export_not_found: '找不到指定的輸出成果。',
  industrial_engine_export_missing: '輸出成果尚未產生或已不存在。',
  export_key_out_of_scope: '此成果不屬於目前任務，已阻擋下載。',
}

export function IndustrialDataEnginePage() {
  const queryClient = useQueryClient()
  const { choices } = useOrganizationChoices('write')
  const [organizationId, setOrganizationId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [mode, setMode] = useState<IndustrialEngineMode>('text_to_world')
  const [factoryAreaType, setFactoryAreaType] = useState('CNC 與射出成型區')
  const [incidentTypes, setIncidentTypes] = useState('通道阻塞, 未配戴防護具, 儀表讀值異常')
  const [cameraModes, setCameraModes] = useState<string[]>(['fixed_camera', 'phone_camera', 'amr_camera'])
  const [notes, setNotes] = useState('')
  const [qualityThreshold, setQualityThreshold] = useState(0.7)
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  const jobsQuery = useAuthedQuery({
    queryKey: ['industrial-data-engine', 'jobs'],
    queryFn: api.listIndustrialEngineJobs,
    staleTime: 8_000,
  })

  const sitesQuery = useAuthedQuery({
    queryKey: ['industrial-data-engine', 'sites'],
    queryFn: api.listSites,
    staleTime: 30_000,
  })

  const createJob = useAuthedMutation<IndustrialEngineJob, FormData>({
    mutationKey: ['industrial-data-engine', 'create'],
    mutationFn: ({ token, payload }) => api.createIndustrialEngineJob(token, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['industrial-data-engine', 'jobs'] })
      setError(null)
    },
  })

  const selectedOrganizationId = organizationId || choices[0]?.organizationId || ''
  const siteOptions = useMemo(
    () => (sitesQuery.data ?? []).filter((site) => site.organizationId === selectedOrganizationId),
    [selectedOrganizationId, sitesQuery.data],
  )
  const jobs = jobsQuery.data ?? []
  const latestJob = jobs[0] ?? null
  const runningCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
  const failedCount = jobs.filter((job) => job.status === 'failed').length

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrganizationId) {
      setError('請選擇一個你可以建立任務的組織。')
      return
    }
    if (mode === 'real_factory_photos_to_world' && photos.length === 0) {
      setError('照片生成場景模式至少需要上傳一張工廠照片。')
      return
    }

    const payload = new FormData()
    payload.append('organizationId', selectedOrganizationId)
    if (siteId) {
      payload.append('siteId', siteId)
    }
    payload.append('mode', mode)
    payload.append('factoryAreaType', factoryAreaType)
    payload.append('incidentTypes', JSON.stringify(toList(incidentTypes)))
    payload.append('cameraModes', JSON.stringify(cameraModes))
    payload.append('notes', notes)
    payload.append('qualityThreshold', String(qualityThreshold))
    photos.forEach((photo) => payload.append('photos', photo))

    try {
      await createJob.mutateAsync(payload)
      setPhotos([])
      setError(null)
    } catch (requestError) {
      const detail = requestError instanceof ApiError ? requestError.detail : 'industrial_engine_job_create_failed'
      setError(formatError(detail))
    }
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="工業資料引擎"
        title="4WALL 資料生成任務"
        subtitle="建立可追蹤的工廠場景生成任務，查看 19 階段處理進度，並下載完成後的資料集成果。"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="任務總數" value={jobs.length} hint="此工作區建立過的資料生成任務。" />
        <Metric label="執行中" value={runningCount} hint="正在排隊或由 worker 處理中的任務。" />
        <Metric label="失敗" value={failedCount} hint="正式 provider 發生問題時會立即停止，並保留失敗階段紀錄。" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)]">
        <div className="space-y-6">
          <Panel>
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="組織">
                  <Select value={selectedOrganizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="場域">
                  <Select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                    <option value="">不指定場域</option>
                    {siteOptions.map((site) => (
                      <option key={site.siteId} value={site.siteId}>
                        {site.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2 text-sm text-chrome-800">
                  <span className="font-medium">任務模式</span>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-chrome-200 bg-chrome-50/80 p-1">
                    <button
                      className={modeButtonClass(mode === 'text_to_world')}
                      type="button"
                      onClick={() => setMode('text_to_world')}
                    >
                      {modeLabels.text_to_world}
                    </button>
                    <button
                      className={modeButtonClass(mode === 'real_factory_photos_to_world')}
                      type="button"
                      onClick={() => setMode('real_factory_photos_to_world')}
                    >
                      {modeLabels.real_factory_photos_to_world}
                    </button>
                  </div>
                </div>
                <Field label="工廠區域類型">
                  <Input value={factoryAreaType} onChange={(event) => setFactoryAreaType(event.target.value)} />
                </Field>
              </div>

              <Field label="異常事件類型" hint="可用逗號分隔多個項目，送出時會自動轉成 JSON。">
                <Input value={incidentTypes} onChange={(event) => setIncidentTypes(event.target.value)} />
              </Field>

              <div className="flex flex-col gap-2 text-sm text-chrome-800">
                <span className="font-medium">相機視角</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {cameraModeOptions.map((option) => (
                    <label key={option} className="flex items-center gap-2 rounded-xl border border-chrome-200 bg-white/70 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={cameraModes.includes(option)}
                        onChange={(event) => {
                          setCameraModes((current) =>
                            event.target.checked
                              ? [...current, option]
                              : current.filter((item) => item !== option),
                          )
                        }}
                      />
                      <span>{formatIndustrialLabel(option)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Field label={`品質門檻：${qualityThreshold.toFixed(2)}`}>
                <input
                  className="w-full accent-ember-500"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={qualityThreshold}
                  onChange={(event) => setQualityThreshold(Number(event.target.value))}
                />
              </Field>

              <Field label="工廠照片" hint="選擇「真實照片生成場景」時必填；文字生成場景可不附照片。">
                <input
                  className="w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
                />
              </Field>

              <Field label="補充說明">
                <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>

              <Panel className="rounded-2xl bg-chrome-50/80 p-4 shadow-none">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                  Codex 開發登入狀態
                </p>
                <p className="mt-2 text-sm leading-relaxed text-chrome-700">
                  Codex 只用於開發、檢查與部署，透過 ChatGPT OAuth 登入。正式任務的品質檢查由 Ollama Qwen-VL 執行。
                </p>
              </Panel>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end">
                <ActionButton disabled={createJob.isPending || choices.length === 0} type="submit">
                  {createJob.isPending ? '建立任務中...' : '建立任務'}
                </ActionButton>
              </div>
            </form>
          </Panel>
        </div>

        <div className="space-y-6">
          {latestJob ? <JobDetail job={latestJob} /> : null}

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">近期任務</p>
                <p className="mt-1 text-sm text-chrome-700">由 worker 執行的長時間資料生成流程。</p>
              </div>
              {jobsQuery.isFetching ? <span className="text-xs text-chrome-500">更新中</span> : null}
            </div>
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <div key={job.jobId} className="rounded-2xl border border-chrome-200 bg-white/75 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs text-chrome-500">{job.jobId}</p>
                      <p className="mt-1 text-sm font-medium text-chrome-950">{formatIndustrialLabel(job.mode)}</p>
                      <p className="mt-1 text-xs text-chrome-600">{formatDateTime(job.createdAt)}</p>
                    </div>
                    <IndustrialStatusBadge status={job.status} />
                  </div>
                </div>
              ))}
            </div>
            {!jobsQuery.isLoading && jobs.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="尚無資料生成任務" body="建立第一個任務後，worker 就會開始執行工業資料引擎流程。" />
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function JobDetail({ job }: { job: IndustrialEngineJob }) {
  const auth = useAuth()
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const downloadArtifact = async (artifactName: string, downloadUrl: string) => {
    if (!auth.session?.accessToken) {
      setDownloadError('登入狀態已失效，請重新登入後再下載。')
      return
    }
    try {
      const blob = await api.fetchArtifactBlob(auth.session.accessToken, downloadUrl)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = artifactName
      anchor.click()
      URL.revokeObjectURL(objectUrl)
      setDownloadError(null)
    } catch (error) {
      setDownloadError(formatError(error instanceof ApiError ? error.detail : 'artifact_download_failed'))
    }
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最新任務</p>
          <h2 className="mt-2 break-all font-display text-2xl font-semibold text-chrome-950">{job.jobId}</h2>
          <p className="mt-2 text-sm text-chrome-700">
            目前階段：{job.currentStage ? formatIndustrialLabel(job.currentStage) : '等待 worker 接手'}
          </p>
        </div>
        <IndustrialStatusBadge status={job.status} />
      </div>

      {job.failureReason ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {job.failureReason}
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {job.stages.map((stage) => (
          <div key={stage.name} className="grid gap-3 rounded-2xl border border-chrome-200 bg-white/75 px-4 py-3 md:grid-cols-[2.5rem_minmax(0,1fr)_8rem] md:items-center">
            <span className="font-mono text-xs text-chrome-500">{stage.sequence}</span>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-chrome-950">{formatIndustrialLabel(stage.name)}</p>
              {stage.reason ? <p className="mt-1 break-words text-xs text-red-700">{stage.reason}</p> : null}
            </div>
            <IndustrialStatusBadge status={stage.status} />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">成果下載</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {job.exports.map((artifact) => (
            <button
              key={artifact.artifactName}
              className="inline-flex rounded-full border border-chrome-300 bg-white px-3 py-2 text-sm text-chrome-900 transition hover:border-ember-500"
              type="button"
              onClick={() => void downloadArtifact(artifact.artifactName, artifact.downloadUrl)}
            >
              {artifact.artifactName}
            </button>
          ))}
          {job.exports.length === 0 ? <span className="text-sm text-chrome-600">尚未產生成果</span> : null}
        </div>
        {downloadError ? <p className="mt-3 text-sm text-red-700">{downloadError}</p> : null}
      </div>
    </Panel>
  )
}

function toList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatIndustrialLabel(value: string): string {
  return (
    stageLabels[value] ??
    modeLabels[value as IndustrialEngineMode] ??
    cameraModeLabels[value as (typeof cameraModeOptions)[number]] ??
    formatLabel(value)
  )
}

function formatError(value: string): string {
  return errorLabels[value] ?? value
}

function IndustrialStatusBadge({ status }: { status: string }) {
  const classes =
    status === 'succeeded'
      ? 'bg-moss-300/40 text-moss-500'
      : status === 'failed'
        ? 'bg-red-100 text-red-700'
        : status === 'running' || status === 'queued'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-chrome-100 text-chrome-700'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] ${classes}`}>
      {statusLabels[status] ?? formatLabel(status)}
    </span>
  )
}

function modeButtonClass(active: boolean): string {
  return active
    ? 'rounded-xl bg-chrome-950 px-3 py-2 text-sm font-medium text-white'
    : 'rounded-xl px-3 py-2 text-sm font-medium text-chrome-700 transition hover:bg-white'
}
