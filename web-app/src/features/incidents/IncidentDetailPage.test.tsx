import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import { IncidentDetailPage } from './IncidentDetailPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getIncident: vi.fn(),
  updateIncidentStatus: vi.fn(),
  assignIncident: vi.fn(),
  addIncidentComment: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getIncident: apiMock.getIncident,
      updateIncidentStatus: apiMock.updateIncidentStatus,
      assignIncident: apiMock.assignIncident,
      addIncidentComment: apiMock.addIncidentComment,
    },
  }
})

const baseIncident = {
  incidentId: 'incident-1',
  organizationId: 'org-1',
  siteId: null,
  title: '工地 2F 東側材料堆放阻塞通道',
  description: '通道寬度不足，需現場確認。',
  status: 'pending_review',
  severity: 'high',
  source: 'manual',
  location: {
    siteId: null,
    siteName: '工地 B',
    areaName: '2F 東側',
    floor: '2F',
    equipmentId: null,
    equipmentName: null,
    description: null,
    worldX: null,
    worldY: null,
    worldZ: null,
    cameraId: null,
    modelObjectId: null,
  },
  evidence: [],
  comments: [],
  history: [
    {
      historyId: 'history-1',
      action: 'incident.created',
      fromValue: null,
      toValue: 'pending_review',
      actorName: 'Test User',
      createdAt: '2026-05-28T06:00:00Z',
    },
  ],
  lineNotifications: [],
  assigneeName: null,
  reporterName: '現場人員',
  aiSummary: null,
  aiConfidence: null,
  createdAt: '2026-05-28T06:00:00Z',
  updatedAt: '2026-05-28T06:00:00Z',
  resolvedAt: null,
} as const

describe('IncidentDetailPage', () => {
  beforeEach(() => {
    apiMock.getIncident.mockReset()
    apiMock.updateIncidentStatus.mockReset()
    apiMock.assignIncident.mockReset()
    apiMock.addIncidentComment.mockReset()
  })

  it('renders detail and calls workflow mutations', async () => {
    apiMock.getIncident.mockResolvedValue(baseIncident)
    apiMock.updateIncidentStatus.mockResolvedValue({ ...baseIncident, status: 'confirmed' })
    apiMock.assignIncident.mockResolvedValue({ ...baseIncident, assigneeName: 'fieldpilot' })
    apiMock.addIncidentComment.mockResolvedValue({
      ...baseIncident,
      comments: [
        {
          commentId: 'comment-1',
          authorName: 'Test User',
          content: '已派人確認。',
          createdAt: '2026-05-28T06:05:00Z',
        },
      ],
    })

    renderWithProviders(
      <Routes>
        <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
      </Routes>,
      {
      route: '/incidents/incident-1',
      auth: createAuthValue({
        session: createSession({
          memberships: [{ membershipId: 'm-1', organizationId: 'org-1', role: 'customer_admin', isActive: true }],
        }),
      }),
    })

    expect(await screen.findByText('工地 2F 東側材料堆放阻塞通道')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '確認異常' }))
    await waitFor(() => expect(apiMock.updateIncidentStatus).toHaveBeenCalledWith('test-token', 'incident-1', 'confirmed'))

    await userEvent.type(screen.getByLabelText('指派負責人'), 'fieldpilot')
    await userEvent.click(screen.getByRole('button', { name: '指派' }))
    await waitFor(() => expect(apiMock.assignIncident).toHaveBeenCalledWith('test-token', 'incident-1', 'fieldpilot'))

    await userEvent.type(screen.getByLabelText('新增備註'), '已派人確認。')
    await userEvent.click(screen.getByRole('button', { name: '新增備註' }))
    await waitFor(() => expect(apiMock.addIncidentComment).toHaveBeenCalledWith('test-token', 'incident-1', '已派人確認。'))
  })
})
