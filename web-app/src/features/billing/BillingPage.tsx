import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  ActionButton,
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
import { formatAccessMode, formatApiError } from '../../lib/presentation'

const invoiceSchema = z.object({
  organizationId: z.string().min(1, '請選擇組織'),
  invoiceNumber: z.string().min(1, '帳單編號不可為空'),
  currency: z.string().length(3, '幣別必須是 3 碼代號'),
  subtotal: z.coerce.number().min(0),
  tax: z.coerce.number().min(0),
  total: z.coerce.number().min(0),
  dueDate: z.string().min(1, '到期日不可為空'),
  paymentInstructions: z.string().min(1, '付款說明不可為空'),
  notes: z.string().default(''),
})

type InvoiceFormInput = z.input<typeof invoiceSchema>
type InvoiceFormValues = z.output<typeof invoiceSchema>

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
      paymentInstructions: 'Bank transfer',
      notes: '',
    },
  })

  const invoices = invoicesQuery.data ?? []
  const overdueCount = invoices.filter((invoice) => invoice.status === 'overdue').length

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
        title="帳單"
        subtitle="測試版以人工開立帳單與匯款流程為主，託管式結帳不列入本輪上線門檻。"
        action={
          auth.isInternal ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="建立帳單"
              description="內部使用者可以建立帳單，附上到期日、備註與匯款說明。"
              trigger={<ActionButton>新增帳單</ActionButton>}
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
                <Field label="到期日" error={errors.dueDate?.message}>
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
                    {createInvoice.isPending ? '開立中…' : '開立帳單'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="可見帳單" value={invoices.length} />
        <Metric label="逾期" value={overdueCount} hint="用來標記測試版中的帳單逾期狀態。" />
        <Metric label="存取模式" value={formatAccessMode(auth.isInternal)} />
      </div>

      {invoicesQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入帳單…</p>
        </Panel>
      ) : null}

      {!invoicesQuery.isLoading && invoices.length === 0 ? (
        <EmptyState
          title="尚無帳單"
          body="當營運人員開立帳單或更新付款狀態後，資料會顯示在這裡。"
        />
      ) : null}

      <div className="grid gap-4">
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
                <p className="mt-2 text-sm text-chrome-700">
                  到期日 {formatDate(invoice.dueDate)} · {formatCurrency(invoice.currency, invoice.total)}
                </p>
                <p className="mt-3 text-sm text-chrome-700">{invoice.paymentInstructions}</p>
              </div>
              <div className="max-w-full break-words rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-3 text-sm text-chrome-700 md:max-w-sm">
                {invoice.notes || '尚無帳務備註'}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
