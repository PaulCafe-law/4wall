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
  StatusBadge,
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
]

export function IndustrialDataEnginePage() {
  const queryClient = useQueryClient()
  const { choices } = useOrganizationChoices('write')
  const [organizationId, setOrganizationId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [mode, setMode] = useState<IndustrialEngineMode>('text_to_world')
  const [factoryAreaType, setFactoryAreaType] = useState('cnc_and_injection_molding_area')
  const [incidentTypes, setIncidentTypes] = useState('blocked aisle, PPE missing, abnormal gauge')
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
      setError('Select an organization with write access.')
      return
    }
    if (mode === 'real_factory_photos_to_world' && photos.length === 0) {
      setError('Upload at least one real factory photo for photo-to-world mode.')
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
      setError(detail)
    }
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Industrial Data Engine"
        title="4WALL data jobs"
        subtitle="Create durable factory-scene generation jobs, monitor the 19-stage pipeline, and download completed dataset artifacts."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Jobs" value={jobs.length} hint="Durable generation runs in this workspace." />
        <Metric label="Active" value={runningCount} hint="Queued or running in the worker." />
        <Metric label="Failed" value={failedCount} hint="Provider failures fail fast and keep stage evidence." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)]">
        <div className="space-y-6">
          <Panel>
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Organization">
                  <Select value={selectedOrganizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Site">
                  <Select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                    <option value="">No site selected</option>
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
                  <span className="font-medium">Mode</span>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-chrome-200 bg-chrome-50/80 p-1">
                    <button
                      className={modeButtonClass(mode === 'text_to_world')}
                      type="button"
                      onClick={() => setMode('text_to_world')}
                    >
                      Text to world
                    </button>
                    <button
                      className={modeButtonClass(mode === 'real_factory_photos_to_world')}
                      type="button"
                      onClick={() => setMode('real_factory_photos_to_world')}
                    >
                      Real factory photos to world
                    </button>
                  </div>
                </div>
                <Field label="Factory area type">
                  <Input value={factoryAreaType} onChange={(event) => setFactoryAreaType(event.target.value)} />
                </Field>
              </div>

              <Field label="Incident types" hint="Comma-separated values are serialized as JSON.">
                <Input value={incidentTypes} onChange={(event) => setIncidentTypes(event.target.value)} />
              </Field>

              <div className="flex flex-col gap-2 text-sm text-chrome-800">
                <span className="font-medium">Camera modes</span>
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
                      <span>{formatLabel(option)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Field label={`Quality threshold: ${qualityThreshold.toFixed(2)}`}>
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

              <Field label="Factory photos" hint="Required for real factory photos mode; optional otherwise.">
                <input
                  className="w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
                />
              </Field>

              <Field label="Notes">
                <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>

              <Panel className="rounded-2xl bg-chrome-50/80 p-4 shadow-none">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                  Codex development login
                </p>
                <p className="mt-2 text-sm leading-relaxed text-chrome-700">
                  Codex uses ChatGPT OAuth through `codex login` or Continue with ChatGPT. Runtime quality checks use Ollama Qwen-VL.
                </p>
              </Panel>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end">
                <ActionButton disabled={createJob.isPending || choices.length === 0} type="submit">
                  {createJob.isPending ? 'Creating job...' : 'Create job'}
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
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Recent jobs</p>
                <p className="mt-1 text-sm text-chrome-700">Worker-backed pipeline runs.</p>
              </div>
              {jobsQuery.isFetching ? <span className="text-xs text-chrome-500">Refreshing</span> : null}
            </div>
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <div key={job.jobId} className="rounded-2xl border border-chrome-200 bg-white/75 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs text-chrome-500">{job.jobId}</p>
                      <p className="mt-1 text-sm font-medium text-chrome-950">{formatLabel(job.mode)}</p>
                      <p className="mt-1 text-xs text-chrome-600">{formatDateTime(job.createdAt)}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                </div>
              ))}
            </div>
            {!jobsQuery.isLoading && jobs.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No data jobs" body="Create a job to start the Industrial Data Engine pipeline." />
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
      setDownloadError('Missing session token.')
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
      setDownloadError(error instanceof ApiError ? error.detail : 'artifact_download_failed')
    }
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Latest job</p>
          <h2 className="mt-2 break-all font-display text-2xl font-semibold text-chrome-950">{job.jobId}</h2>
          <p className="mt-2 text-sm text-chrome-700">Current stage: {job.currentStage ? formatLabel(job.currentStage) : 'Waiting'}</p>
        </div>
        <StatusBadge status={job.status} />
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
              <p className="break-words text-sm font-medium text-chrome-950">{formatLabel(stage.name)}</p>
              {stage.reason ? <p className="mt-1 break-words text-xs text-red-700">{stage.reason}</p> : null}
            </div>
            <StatusBadge status={stage.status} />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Exports</p>
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
          {job.exports.length === 0 ? <span className="text-sm text-chrome-600">No exports yet</span> : null}
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

function modeButtonClass(active: boolean): string {
  return active
    ? 'rounded-xl bg-chrome-950 px-3 py-2 text-sm font-medium text-white'
    : 'rounded-xl px-3 py-2 text-sm font-medium text-chrome-700 transition hover:bg-white'
}
