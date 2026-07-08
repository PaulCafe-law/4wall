import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { AttributionWorkbenchPage } from './AttributionWorkbenchPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  listDecisionPoints: vi.fn(),
  getDecisionPointStats: vi.fn(),
  listOrganizations: vi.fn(),
  attributeDecisionPoint: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      listDecisionPoints: apiMock.listDecisionPoints,
      getDecisionPointStats: apiMock.getDecisionPointStats,
      listOrganizations: apiMock.listOrganizations,
      attributeDecisionPoint: apiMock.attributeDecisionPoint,
    },
  }
})

const decisionPoint = {
  decisionPointId: 'dp-1',
  organizationId: 'org-1',
  domain: 'dispatch',
  eventType: 'dispatch',
  source: 'line',
  subjectRef: 'HC600',
  occurredAt: '2026-07-07T01:30:00Z',
  plan: {},
  prediction: {
    engine: 'rules_v0',
    candidates: [
      { name: '陳大明', score: 0.82, rationale: '排班在場、技能等級 3' },
      { name: '林小華', score: 0.6, rationale: '排班在場、技能等級 2' },
    ],
  },
  predictedAt: '2026-07-07T01:30:05Z',
  actual: { assignee: '林小華' },
  actualRecordedAt: '2026-07-07T02:00:00Z',
  consistent: false,
  attribution: 'none',
  attributionNote: null,
  attributedBy: null,
  attributedAt: null,
  status: 'resolved',
  createdAt: '2026-07-07T01:30:00Z',
} as const

const stats = {
  windowDays: 14,
  totalPoints: 12,
  judgedPoints: 8,
  consistentPoints: 6,
  consistencyRate: 0.75,
  attributedPoints: 3,
  mismatchedUnattributed: 2,
} as const

describe('AttributionWorkbenchPage', () => {
  beforeEach(() => {
    apiMock.listDecisionPoints.mockReset()
    apiMock.getDecisionPointStats.mockReset()
    apiMock.listOrganizations.mockReset()
    apiMock.attributeDecisionPoint.mockReset()

    apiMock.listOrganizations.mockResolvedValue([{ organizationId: 'org-1', name: 'Fourth Wall Demo' }])
    apiMock.listDecisionPoints.mockResolvedValue({ decisionPoints: [decisionPoint] })
    apiMock.getDecisionPointStats.mockResolvedValue(stats)
  })

  it('renders decision point queue and ledger stats', async () => {
    renderWithProviders(<AttributionWorkbenchPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    expect(await screen.findByText('歸因工作台')).toBeInTheDocument()
    expect(await screen.findByText('HC600')).toBeInTheDocument()
    expect(await screen.findByText('陳大明')).toBeInTheDocument()
    expect(await screen.findByText(/實際：林小華/)).toBeInTheDocument()
    expect(await screen.findByText('⚠️')).toBeInTheDocument()

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(await screen.findByText('2')).toBeInTheDocument()

    await waitFor(() => {
      expect(apiMock.listDecisionPoints).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          organizationId: 'org-1',
          mismatchOnly: true,
          unattributedOnly: true,
        }),
      )
    })
    expect(apiMock.getDecisionPointStats).toHaveBeenCalledWith('test-token', {
      organizationId: 'org-1',
      days: 14,
    })
  })

  it('attributes a decision point with one click', async () => {
    apiMock.attributeDecisionPoint.mockResolvedValue({
      ...decisionPoint,
      attribution: 'schedule_gap',
      attributedBy: 'Test User',
      attributedAt: '2026-07-08T03:00:00Z',
    })

    renderWithProviders(<AttributionWorkbenchPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['platform_admin'],
        }),
      }),
    })

    await userEvent.click(await screen.findByRole('button', { name: '排班缺口' }))

    await waitFor(() => {
      expect(apiMock.attributeDecisionPoint).toHaveBeenCalledWith('test-token', 'dp-1', {
        attribution: 'schedule_gap',
        note: null,
      })
    })
  })
})
