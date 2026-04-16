import { screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { OverviewPage } from './OverviewPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

const apiMock = vi.hoisted(() => ({
  getOverview: vi.fn(),
}))

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getOverview: apiMock.getOverview,
    },
  }
})

describe('OverviewPage', () => {
  beforeEach(() => {
    apiMock.getOverview.mockReset()
  })

  it('renders customer actions, reporting summary, invoices, and invites from the aggregate contract', async () => {
    apiMock.getOverview.mockResolvedValue({
      siteCount: 2,
      missionCount: 3,
      planningMissionCount: 1,
      scheduledMissionCount: 0,
      runningMissionCount: 0,
      readyMissionCount: 1,
      failedMissionCount: 1,
      publishedMissionCount: 1,
      invoiceDueCount: 1,
      overdueInvoiceCount: 1,
      pendingInviteCount: 1,
      recentMissions: [
        {
          missionId: 'mission-001',
          organizationId: 'org-001',
          siteId: 'site-001',
          missionName: 'Tower A Delivery',
          status: 'failed',
          bundleVersion: 'bundle-v1',
          deliveryStatus: 'failed',
          publishedAt: null,
          failureReason: 'Route provider timed out for this site.',
          reportStatus: 'failed',
          reportGeneratedAt: null,
          eventCount: 0,
          createdAt: '2026-04-14T10:00:00Z',
        },
      ],
      recentDeliveries: [
        {
          missionId: 'mission-002',
          organizationId: 'org-001',
          siteId: 'site-001',
          missionName: 'Tower A Published',
          status: 'ready',
          bundleVersion: 'bundle-v2',
          deliveryStatus: 'published',
          publishedAt: '2026-04-14T11:00:00Z',
          failureReason: null,
          reportStatus: 'ready',
          reportGeneratedAt: '2026-04-14T11:05:00Z',
          eventCount: 2,
          createdAt: '2026-04-14T09:00:00Z',
        },
      ],
      recentInvoices: [
        {
          invoiceId: 'invoice-001',
          organizationId: 'org-001',
          invoiceNumber: 'INV-001',
          currency: 'TWD',
          subtotal: 10000,
          tax: 500,
          total: 10500,
          dueDate: '2026-04-12T00:00:00Z',
          status: 'overdue',
          paymentInstructions: 'Bank transfer',
          attachmentRefs: [],
          notes: '',
          paymentNote: 'Please settle this invoice this week.',
          receiptRef: '',
          voidReason: '',
          createdAt: '2026-04-01T10:00:00Z',
          updatedAt: '2026-04-01T10:00:00Z',
        },
      ],
      pendingInvites: [
        {
          inviteId: 'invite-001',
          organizationId: 'org-001',
          organizationName: 'Acme Build',
          email: 'viewer@acme.test',
          role: 'customer_viewer',
          createdAt: '2026-04-15T10:00:00Z',
          expiresAt: '2026-04-20T10:00:00Z',
        },
      ],
      latestReportSummary: {
        reportId: 'report-001',
        missionId: 'mission-002',
        status: 'ready',
        generatedAt: '2026-04-14T11:05:00Z',
        summary: '2 inspection events were generated for Tower A Published.',
        eventCount: 2,
        downloadArtifact: {
          artifactName: 'inspection_report.html',
          downloadUrl: '/v1/missions/mission-002/artifacts/inspection_report.html',
          contentType: 'text/html',
          checksumSha256: 'abc123',
          publishedAt: '2026-04-14T11:05:00Z',
        },
      },
      latestEventSummary: {
        eventId: 'event-001',
        missionId: 'mission-002',
        category: 'material_discoloration',
        severity: 'warning',
        summary: 'Surface discoloration detected on the east facade.',
        detectedAt: '2026-04-14T11:04:00Z',
      },
      supportSummary: null,
    })

    renderWithProviders(<OverviewPage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [
            {
              membershipId: 'membership-001',
              organizationId: 'org-001',
              role: 'customer_admin',
              isActive: true,
            },
          ],
        }),
        isInternal: false,
      }),
    })

    expect(await screen.findByText('Tower A Delivery')).toBeInTheDocument()
    expect(screen.getByText('What needs attention now')).toBeInTheDocument()
    expect(screen.getByText('viewer@acme.test')).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('Latest report')).toBeInTheDocument()
    expect(screen.getByText('Latest anomaly event')).toBeInTheDocument()
    expect(screen.getByText('2 inspection events were generated for Tower A Published.')).toBeInTheDocument()
    expect(screen.getByText('Surface discoloration detected on the east facade.')).toBeInTheDocument()
    expect(document.querySelector('a[href="/missions/mission-001"]')).toBeTruthy()
    expect(document.querySelector('a[href="/billing"]')).toBeTruthy()
    expect(document.querySelector('a[href="/team"]')).toBeTruthy()
  })

  it('shows internal support summary when the overview contract includes support counts', async () => {
    apiMock.getOverview.mockResolvedValue({
      siteCount: 1,
      missionCount: 1,
      planningMissionCount: 0,
      scheduledMissionCount: 1,
      runningMissionCount: 0,
      readyMissionCount: 0,
      failedMissionCount: 1,
      publishedMissionCount: 0,
      invoiceDueCount: 0,
      overdueInvoiceCount: 1,
      pendingInviteCount: 0,
      recentMissions: [],
      recentDeliveries: [],
      recentInvoices: [],
      pendingInvites: [],
      latestReportSummary: null,
      latestEventSummary: null,
      supportSummary: {
        openCount: 4,
        criticalCount: 2,
        warningCount: 2,
      },
    })

    renderWithProviders(<OverviewPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
        }),
        isInternal: true,
      }),
    })

    await waitFor(() => {
      expect(screen.getAllByText('Open Support').length).toBeGreaterThan(0)
      expect(screen.getByText('Open Live Ops')).toBeInTheDocument()
      expect(screen.getByText('Track demo readiness, support load, and the latest reporting output without dropping into flight control.')).toBeInTheDocument()
    })
  })

  it('shows setup guidance when the workspace has sites but no missions yet', async () => {
    apiMock.getOverview.mockResolvedValue({
      siteCount: 1,
      missionCount: 0,
      planningMissionCount: 0,
      scheduledMissionCount: 0,
      runningMissionCount: 0,
      readyMissionCount: 0,
      failedMissionCount: 0,
      publishedMissionCount: 0,
      invoiceDueCount: 0,
      overdueInvoiceCount: 0,
      pendingInviteCount: 0,
      recentMissions: [],
      recentDeliveries: [],
      recentInvoices: [],
      pendingInvites: [],
      latestReportSummary: null,
      latestEventSummary: null,
      supportSummary: null,
    })

    renderWithProviders(<OverviewPage />, {
      auth: createAuthValue({
        session: createSession({
          memberships: [
            {
              membershipId: 'membership-001',
              organizationId: 'org-001',
              role: 'customer_admin',
              isActive: true,
            },
          ],
        }),
        isInternal: false,
      }),
    })

    expect(await screen.findByText('No missions exist yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Create the first mission to connect planning, dispatch, event generation, evidence, and reporting in one record.',
      ),
    ).toBeInTheDocument()
    expect(document.querySelector('a[href="/missions/new"]')).toBeTruthy()
  })
})
