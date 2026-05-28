import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { IncidentCenterPage } from './IncidentCenterPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listIncidents: vi.fn(),
  getIncidentSummary: vi.fn(),
  listOrganizations: vi.fn(),
  createIncident: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listIncidents: apiMock.listIncidents,
      getIncidentSummary: apiMock.getIncidentSummary,
      listOrganizations: apiMock.listOrganizations,
      createIncident: apiMock.createIncident,
    },
  }
})

const incident = {
  incidentId: 'incident-1',
  organizationId: 'org-1',
  siteId: null,
  title: 'A 區空壓機壓力表疑似異常',
  description: '壓力表數值超出日常巡檢區間。',
  status: 'pending_review',
  severity: 'critical',
  source: 'ai_detection',
  location: {
    siteId: null,
    siteName: '工廠 A',
    areaName: 'A 區',
    floor: null,
    equipmentId: null,
    equipmentName: '空壓機',
    description: null,
    worldX: null,
    worldY: null,
    worldZ: null,
    cameraId: null,
    modelObjectId: null,
  },
  evidence: [],
  comments: [],
  history: [],
  lineNotifications: [
    {
      notificationId: 'line-1',
      incidentId: 'incident-1',
      action: 'incident_created',
      targetId: 'group-1',
      message: 'LINE message',
      status: 'sent',
      errorMessage: null,
      createdAt: '2026-05-28T06:00:00Z',
      sentAt: '2026-05-28T06:00:01Z',
    },
  ],
  assigneeName: null,
  reporterName: 'AI',
  aiSummary: 'AI 判斷壓力表異常。',
  aiConfidence: 0.91,
  createdAt: '2026-05-28T06:00:00Z',
  updatedAt: '2026-05-28T06:00:00Z',
  resolvedAt: null,
} as const

describe('IncidentCenterPage', () => {
  beforeEach(() => {
    apiMock.listIncidents.mockReset()
    apiMock.getIncidentSummary.mockReset()
    apiMock.listOrganizations.mockReset()
    apiMock.createIncident.mockReset()
  })

  it('renders incident list, metrics, and LINE summary preview', async () => {
    apiMock.listOrganizations.mockResolvedValue([{ organizationId: 'org-1', name: 'Fourth Wall Demo' }])
    apiMock.listIncidents.mockResolvedValue([incident])
    apiMock.getIncidentSummary.mockResolvedValue({
      date: '2026-05-28',
      newIncidentCount: 1,
      statusCounts: { pending_review: 1 },
      severityCounts: { critical: 1 },
      criticalHighIncidents: [incident],
      resolvedIncidents: [],
      unhandledIncidents: [incident],
      lineSummaryMessage: '【第四面牆｜每日異常摘要】\n今日新增：1 件',
    })

    renderWithProviders(<IncidentCenterPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    expect(await screen.findByText('異常事件中心')).toBeInTheDocument()
    expect((await screen.findAllByText('A 區空壓機壓力表疑似異常')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/每日異常摘要/)).toBeInTheDocument()
    expect(await screen.findByText(/sent \/ incident_created/)).toBeInTheDocument()
  })
})
