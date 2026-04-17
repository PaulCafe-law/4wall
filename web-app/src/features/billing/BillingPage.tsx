import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  ActionButton,
  DataList,
  EmptyState,
  Field,
  Input,
  Metric,
  Modal,
  Panel,
  ShellSection,
  StatusBadge,
  TextArea,
  formatCurrency,
  formatDate,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError, formatInvoiceStatusDescription } from '../../lib/presentation'

const invoiceSchema = z.object({
  organizationId: z.string().min(1, '請選擇組織。'),
  invoiceNumber: z.string().min(1, '請輸入帳單編號。'),
  currency: z.string().length(3, '幣別必須是 3 碼代碼。'),
  subtotal: z.coerce.number().min(0),
  tax: z.coerce.number().min(0),
  total: z.coerce.number().min(0),
  dueDate: z.string().min(1, '請輸入到期時間。'),
  paymentInstructions: z.string().min(1, '請輸入付款說明。'),
  notes: z.string().default(''),
})

type InvoiceFormInput = z.input<typeof invoiceSchema>
type InvoiceFormValues = z.output<typeof invoiceSchema>

function isDueSoon(value: string) {
  const dueDate = new Date(value)
  const now = new Date()
  const diffMs = dueDate.getTime() - now.getTime()
  return diffMs >= 0 && diffMs <= 1000 * 60 * 60 * 24 * 7
}

function billingFocusMessage({
  overdueCount,
  dueSoonCount,
  openCount,
  settledCount,
}: {
  overdueCount: number
  dueSoonCount: number
  openCount: number
  settledCount: number
}) {
  if (overdueCount > 0) {
    return `目前有 ${overdueCount} 張帳單已逾期，請優先追蹤付款與回覆。`
  }
  if (dueSoonCount > 0) {
    return `目前有 ${dueSoonCount} 張帳單即將到期，建議提前確認付款進度。`
  }
  if (openCount > 0) {
    return `目前仍有 ${openCount} 張已開立帳單待追蹤，請維持付款說明與收款紀錄一致。`
  }
  if (settledCount > 0) {
    return '近期帳務狀態穩定，已完成付款與作廢的帳單都可直接作為營運紀錄。'
  }
  return '目前尚未建立帳單。若要展示 beta 可營運的帳務流程，請先新增一張帳單。'
}

export function BillingPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const { choices } = useOrganizationChoices('read')
  const invoicesQuery = useAuthedQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: api.listInvoices,
    staleTime: 15_000,
  })

  const createInvoice = useAuthedMutation({
    mutationKey: ['billing', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: InvoiceFormValues }) =>
      api.createInvoice(token, {
        organizationId: payload.organizationId,
        invoiceNumber: payload.invoiceNumber,
        currency: payload.currency.toUpperCase(),
        subtotal: payload.subtotal,
        tax: payload.tax,
        total: payload.total,
        dueDate: new Date(payload.dueDate).toISOString(),
        paymentInstructions: payload.paymentInstructions,
        attachmentRefs: [],
        notes: payload.notes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] })
      setIsOpen(false)
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<InvoiceFormInput, undefined, InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      organizationId: choices[0]?.organizationId ?? '',
      invoiceNumber: '',
      currency: 'TWD',
      subtotal: 0,
      tax: 0,
      total: 0,
      dueDate: '',
      paymentInstructions: '銀行轉帳',
      notes: '',
    },
  })

  const invoices = invoicesQuery.data ?? []
  const overdueCount = invoices.filter((invoice) => invoice.status === 'overdue').length
  const dueSoonCount = invoices.filter((invoice) => invoice.status === 'invoice_due' || isDueSoon(invoice.dueDate)).length
  const openCount = invoices.filter((invoice) => ['issued', 'invoice_due', 'overdue'].includes(invoice.status)).length
  const settledCount = invoices.filter((invoice) => ['paid', 'void'].includes(invoice.status)).length

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createInvoice.mutateAsync(values)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '無法建立帳單，請稍後再試。') })
    }
  })

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="帳務"
        title="帳務"
        subtitle="查看帳單狀態、付款說明與到期提醒，確保 beta 期間的帳務流程維持可營運狀態。"
        action={
          auth.isInternal ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="建立帳單"
              description="為指定組織建立一張新帳單。"
              trigger={<ActionButton>建立帳單</ActionButton>}
            >
              <form className="grid gap-4" onSubmit={onSubmit}>
                <Field label="組織" error={errors.organizationId?.message}>
                  <select
                    className="w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm"
                    {...register('organizationId')}
                  >
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="帳單編號" error={errors.invoiceNumber?.message}>
                    <Input {...register('invoiceNumber')} />
                  </Field>
                  <Field label="幣別" error={errors.currency?.message}>
                    <Input {...register('currency')} />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="未稅金額" error={errors.subtotal?.message}>
                    <Input type="number" {...register('subtotal')} />
                  </Field>
                  <Field label="稅額" error={errors.tax?.message}>
                    <Input type="number" {...register('tax')} />
                  </Field>
                  <Field label="總額" error={errors.total?.message}>
                    <Input type="number" {...register('total')} />
                  </Field>
                </div>
                <Field label="到期時間" error={errors.dueDate?.message}>
                  <Input type="datetime-local" {...register('dueDate')} />
                </Field>
                <Field label="付款說明" error={errors.paymentInstructions?.message}>
                  <TextArea {...register('paymentInstructions')} />
                </Field>
                <Field label="備註" error={errors.notes?.message}>
                  <TextArea {...register('notes')} />
                </Field>
                {errors.root?.message ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errors.root.message}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton disabled={createInvoice.isPending} type="submit">
                    {createInvoice.isPending ? '建立中…' : '送出帳單'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="帳單總數" value={invoices.length} />
        <Metric label="待追蹤" value={openCount} hint="已開立且仍需持續追蹤的帳單。" />
        <Metric label="即將到期" value={dueSoonCount} hint="近期需要跟催付款的帳單。" />
        <Metric label="已結清 / 已作廢" value={settledCount} hint={`${overdueCount} 張逾期帳單。`} />
      </div>

      {overdueCount > 0 ? (
        <Panel className="border border-red-200 bg-red-50/70">
          <p className="font-medium text-chrome-950">目前有 {overdueCount} 張帳單已逾期</p>
          <p className="mt-2 text-sm text-chrome-700">請優先檢查付款狀態與客戶回覆，避免影響後續營運節奏。</p>
        </Panel>
      ) : null}

      {overdueCount === 0 && dueSoonCount > 0 ? (
        <Panel className="border border-amber-200 bg-amber-50/70">
          <p className="font-medium text-chrome-950">目前有 {dueSoonCount} 張帳單即將到期</p>
          <p className="mt-2 text-sm text-chrome-700">請提早確認付款進度，避免這些帳單變成逾期案件。</p>
        </Panel>
      ) : null}

      {!invoicesQuery.isLoading && invoices.length === 0 ? (
        <EmptyState title="目前還沒有帳單" body="如果要展示 beta 可營運的帳務流程，請先建立第一張帳單。" />
      ) : null}

      {invoicesQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入帳單資料…</p>
        </Panel>
      ) : null}

      <div className="grid gap-4">
        {invoices.length > 0 ? (
          <Panel>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">帳務重點</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">現在需要跟進什麼</h2>
            <p className="mt-2 text-sm text-chrome-700">
              {billingFocusMessage({ overdueCount, dueSoonCount, openCount, settledCount })}
            </p>
          </Panel>
        ) : null}

        {invoices.map((invoice) => (
          <Panel key={invoice.invoiceId}>
            <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="break-words font-display text-2xl font-semibold text-chrome-950">
                    {invoice.invoiceNumber}
                  </h2>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-2 text-sm text-chrome-700">{formatInvoiceStatusDescription(invoice.status)}</p>
              </div>
              <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-3 text-sm text-chrome-700">
                到期日：{formatDate(invoice.dueDate)}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <DataList
                rows={[
                  { label: '總額', value: formatCurrency(invoice.currency, invoice.total) },
                  { label: '付款說明', value: invoice.paymentInstructions },
                  { label: '付款註記', value: invoice.paymentNote || '尚未記錄' },
                  { label: '收據編號', value: invoice.receiptRef || '尚未記錄' },
                ]}
              />

              <div className="grid gap-3">
                {invoice.voidReason ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    作廢原因：{invoice.voidReason}
                  </div>
                ) : null}
                <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-3 text-sm text-chrome-700">
                  {invoice.notes || '目前沒有額外備註。'}
                </div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
