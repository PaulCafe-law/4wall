import { screen } from '@testing-library/react'
import { vi } from 'vitest'

import { BillingPage } from './BillingPage'
import { createAuthValue, createSession, renderWithProviders } from '../../test/utils'

describe('BillingPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps invoice creation hidden for customer roles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    renderWithProviders(<BillingPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: [],
          memberships: [
            {
              membershipId: 'm-1',
              organizationId: 'org-1',
              role: 'customer_admin',
              isActive: true,
            },
          ],
        }),
        isInternal: false,
      }),
    })

    expect(await screen.findByText('目前還沒有帳單')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立帳單' })).not.toBeInTheDocument()
  })

  it('shows billing status clarity for internal users', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/v1/billing/invoices')) {
        return new Response(
          JSON.stringify([
            {
              invoiceId: 'inv-1',
              organizationId: 'org-1',
              invoiceNumber: 'INV-001',
              currency: 'TWD',
              subtotal: 1000,
              tax: 50,
              total: 1050,
              dueDate: '2026-04-17T00:00:00Z',
              status: 'overdue',
              paymentInstructions: 'Bank transfer',
              attachmentRefs: [],
              notes: '請先與客戶確認本週的付款安排。',
              paymentNote: '已提醒客戶提供匯款資訊。',
              receiptRef: 'RCT-001',
              voidReason: '',
              createdAt: '2026-04-10T00:00:00Z',
              updatedAt: '2026-04-10T00:00:00Z',
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      if (url.includes('/v1/organizations')) {
        return new Response(
          JSON.stringify([
            {
              organizationId: 'org-1',
              name: 'Org One',
              slug: 'org-one',
              memberCount: 1,
              siteCount: 1,
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      return new Response('not found', { status: 404 })
    })

    renderWithProviders(<BillingPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
          memberships: [],
        }),
        isInternal: true,
      }),
    })

    expect(await screen.findByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('這筆帳單已逾期，請優先確認付款安排與收款回覆。')).toBeInTheDocument()
    expect(screen.getByText('已提醒客戶提供匯款資訊。')).toBeInTheDocument()
    expect(screen.getByText('RCT-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '建立帳單' })).toBeInTheDocument()
  })

  it('shows a due-soon reminder before invoices become overdue', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/v1/billing/invoices')) {
        return new Response(
          JSON.stringify([
            {
              invoiceId: 'inv-2',
              organizationId: 'org-1',
              invoiceNumber: 'INV-002',
              currency: 'TWD',
              subtotal: 2000,
              tax: 100,
              total: 2100,
              dueDate: '2099-04-20T00:00:00Z',
              status: 'invoice_due',
              paymentInstructions: 'Bank transfer',
              attachmentRefs: [],
              notes: '',
              paymentNote: '',
              receiptRef: '',
              voidReason: '',
              createdAt: '2099-04-10T00:00:00Z',
              updatedAt: '2099-04-10T00:00:00Z',
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      if (url.includes('/v1/organizations')) {
        return new Response(
          JSON.stringify([
            {
              organizationId: 'org-1',
              name: 'Org One',
              slug: 'org-one',
              memberCount: 1,
              siteCount: 1,
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      return new Response('not found', { status: 404 })
    })

    renderWithProviders(<BillingPage />, {
      auth: createAuthValue({
        session: createSession({
          globalRoles: ['ops'],
          memberships: [],
        }),
        isInternal: true,
      }),
    })

    expect(await screen.findByText('目前有 1 筆帳單即將到期')).toBeInTheDocument()
    expect(screen.getByText('建議先提醒付款安排，避免帳單直接轉成逾期狀態。')).toBeInTheDocument()
    expect(screen.getByText('有 1 筆帳單在一週內到期，適合先提醒付款安排，避免直接滑入逾期。')).toBeInTheDocument()
  })
})
