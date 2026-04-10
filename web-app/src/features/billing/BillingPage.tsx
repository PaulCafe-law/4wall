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

const invoiceSchema = z.object({
  organizationId: z.string().min(1, 'Organization is required'),
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  currency: z.string().length(3, 'Currency must be a 3-letter code'),
  subtotal: z.coerce.number().min(0),
  tax: z.coerce.number().min(0),
  total: z.coerce.number().min(0),
  dueDate: z.string().min(1, 'Due date is required'),
  paymentInstructions: z.string().min(1, 'Payment instructions are required'),
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
      const detail = error instanceof ApiError ? error.detail : 'Unable to create invoice'
      setError('root', { message: detail })
    }
  })

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Billing"
        title="Invoices"
        subtitle="Manual invoice and remittance flow is first-class in beta. Hosted checkout stays out of the launch gate."
        action={
          auth.isInternal ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="Create invoice"
              description="Internal users can issue invoices with due date, notes, and remittance instructions."
              trigger={<ActionButton>New Invoice</ActionButton>}
            >
              <form className="grid gap-4" onSubmit={onSubmit}>
                <Field label="Organization" error={errors.organizationId?.message}>
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
                  <Field label="Invoice number" error={errors.invoiceNumber?.message}>
                    <Input {...register('invoiceNumber')} />
                  </Field>
                  <Field label="Currency" error={errors.currency?.message}>
                    <Input {...register('currency')} />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Subtotal" error={errors.subtotal?.message}>
                    <Input type="number" {...register('subtotal')} />
                  </Field>
                  <Field label="Tax" error={errors.tax?.message}>
                    <Input type="number" {...register('tax')} />
                  </Field>
                  <Field label="Total" error={errors.total?.message}>
                    <Input type="number" {...register('total')} />
                  </Field>
                </div>
                <Field label="Due date" error={errors.dueDate?.message}>
                  <Input type="datetime-local" {...register('dueDate')} />
                </Field>
                <Field label="Payment instructions" error={errors.paymentInstructions?.message}>
                  <TextArea {...register('paymentInstructions')} />
                </Field>
                <Field label="Notes" error={errors.notes?.message}>
                  <TextArea {...register('notes')} />
                </Field>
                {errors.root?.message ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errors.root.message}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton disabled={createInvoice.isPending} type="submit">
                    {createInvoice.isPending ? 'Issuing…' : 'Issue Invoice'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Visible invoices" value={invoices.length} />
        <Metric label="Overdue" value={overdueCount} hint="Use this to surface invoice overdue state in beta." />
        <Metric label="Access mode" value={auth.isInternal ? 'internal' : 'customer'} />
      </div>

      {invoicesQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">Loading invoices…</p>
        </Panel>
      ) : null}

      {!invoicesQuery.isLoading && invoices.length === 0 ? (
        <EmptyState
          title="No invoice yet"
          body="Invoices appear here once ops issues a remittance request or marks payment status."
        />
      ) : null}

      <div className="grid gap-4">
        {invoices.map((invoice) => (
          <Panel key={invoice.invoiceId}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-2xl font-semibold text-chrome-950">
                    {invoice.invoiceNumber}
                  </h2>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="mt-2 text-sm text-chrome-700">
                  Due {formatDate(invoice.dueDate)} • {formatCurrency(invoice.currency, invoice.total)}
                </p>
                <p className="mt-3 text-sm text-chrome-700">{invoice.paymentInstructions}</p>
              </div>
              <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-3 text-sm text-chrome-700">
                {invoice.notes || 'No billing notes'}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
