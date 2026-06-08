import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { IndustrialDataEnginePage } from './IndustrialDataEnginePage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listIndustrialEngineJobs: vi.fn(),
  createIndustrialEngineJob: vi.fn(),
  listSites: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listIndustrialEngineJobs: apiMock.listIndustrialEngineJobs,
      createIndustrialEngineJob: apiMock.createIndustrialEngineJob,
      listSites: apiMock.listSites,
    },
  }
})

const job = {
  jobId: 'job-1',
  organizationId: 'org-1',
  siteId: null,
  status: 'succeeded',
  mode: 'text_to_world',
  currentStage: 'export_dataset',
  failureReason: null,
  request: {},
  result: {},
  stages: [
    {
      sequence: 1,
      name: 'validate_environment',
      status: 'succeeded',
      reason: null,
      output: {},
      startedAt: '2026-06-08T00:00:00Z',
      completedAt: '2026-06-08T00:00:01Z',
    },
    {
      sequence: 16,
      name: 'quality_judge_with_ollama_qwen_vlm',
      status: 'succeeded',
      reason: null,
      output: {},
      startedAt: '2026-06-08T00:10:00Z',
      completedAt: '2026-06-08T00:11:00Z',
    },
  ],
  inputs: [],
  exports: [
    {
      artifactName: 'dataset.jsonl',
      downloadUrl: '/v1/industrial-data-engine/jobs/job-1/exports/dataset.jsonl',
      contentType: 'application/x-ndjson',
      sizeBytes: 128,
    },
  ],
  createdAt: '2026-06-08T00:00:00Z',
  updatedAt: '2026-06-08T00:11:00Z',
  startedAt: '2026-06-08T00:00:00Z',
  completedAt: '2026-06-08T00:11:00Z',
} as const

describe('IndustrialDataEnginePage', () => {
  beforeEach(() => {
    apiMock.listIndustrialEngineJobs.mockReset()
    apiMock.createIndustrialEngineJob.mockReset()
    apiMock.listSites.mockReset()
    apiMock.listIndustrialEngineJobs.mockResolvedValue([job])
    apiMock.listSites.mockResolvedValue([{ siteId: 'site-1', organizationId: 'org-1', name: 'Factory A' }])
  })

  it('renders status, exports, Codex OAuth copy, and no API-key prompt', async () => {
    renderWithProviders(<IndustrialDataEnginePage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [{ membershipId: 'm-1', organizationId: 'org-1', role: 'customer_admin', isActive: true }],
        }),
      }),
    })

    expect(await screen.findByText('4WALL data jobs')).toBeInTheDocument()
    expect(await screen.findByText(/quality judge/i)).toBeInTheDocument()
    expect(await screen.findByText('dataset.jsonl')).toBeInTheDocument()
    expect(screen.getByText(/ChatGPT OAuth/)).toBeInTheDocument()
    expect(screen.queryByText(/OpenAI API key/i)).not.toBeInTheDocument()
  })

  it('creates a photo-to-world job with uploaded photos and structured fields', async () => {
    const user = userEvent.setup()
    const submitted: { current: FormData | null } = { current: null }
    apiMock.createIndustrialEngineJob.mockImplementation(async (_token: string, payload: FormData) => {
      submitted.current = payload
      return { ...job, jobId: 'job-2', mode: 'real_factory_photos_to_world' }
    })

    renderWithProviders(<IndustrialDataEnginePage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [{ membershipId: 'm-1', organizationId: 'org-1', role: 'customer_admin', isActive: true }],
        }),
      }),
    })

    await user.click(await screen.findByRole('button', { name: 'Real factory photos to world' }))
    const file = new File(['photo'], 'factory.png', { type: 'image/png' })
    fireEvent.change(await screen.findByLabelText(/Factory photos/), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }))

    await waitFor(() => expect(apiMock.createIndustrialEngineJob).toHaveBeenCalledTimes(1))
    const formData = submitted.current as FormData
    expect(formData.get('organizationId')).toBe('org-1')
    expect(formData.get('mode')).toBe('real_factory_photos_to_world')
    expect(JSON.parse(String(formData.get('incidentTypes')))).toContain('blocked aisle')
    expect(JSON.parse(String(formData.get('cameraModes')))).toContain('fixed_camera')
    expect(formData.getAll('photos')).toHaveLength(1)
  })
})
