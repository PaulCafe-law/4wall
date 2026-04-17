/* eslint-disable react-refresh/only-export-components */

import * as Dialog from '@radix-ui/react-dialog'
import { clsx } from 'clsx'
import type { PropsWithChildren, ReactNode } from 'react'

import { formatStatus } from '../lib/presentation'

export function ShellSection({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-chrome-200/80 pb-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-3xl font-semibold tracking-[-0.04em] text-chrome-950 md:text-4xl">
          {title}
        </h1>
        {subtitle ? <p className="max-w-3xl text-sm text-chrome-700 md:text-base">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 self-start 2xl:self-auto">{action}</div> : null}
    </div>
  )
}

export function Panel({
  className,
  children,
}: PropsWithChildren<{
  className?: string
}>) {
  return (
    <section
      className={clsx(
        'rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'ready' || status === 'paid' || status === 'published'
      ? 'bg-moss-300/40 text-moss-500'
      : status === 'failed' || status === 'overdue' || status === 'void'
        ? 'bg-red-100 text-red-700'
        : status === 'planning' || status === 'invoice_due' || status === 'issued'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-chrome-100 text-chrome-700'

  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em]',
        classes,
      )}
    >
      {formatStatus(status)}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <Panel className="border-dashed border-chrome-300 bg-chrome-50/80 text-center">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-chrome-500">空狀態</p>
        <h2 className="font-display text-2xl font-semibold text-chrome-950">{title}</h2>
        <p className="text-sm text-chrome-700 md:text-base">{body}</p>
        {action}
      </div>
    </Panel>
  )
}

export function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-chrome-200 bg-chrome-50/80 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-chrome-950">{value}</p>
      {hint ? <p className="mt-2 text-sm text-chrome-700">{hint}</p> : null}
    </div>
  )
}

export function ActionButton({
  children,
  className,
  variant = 'primary',
  ...props
}: PropsWithChildren<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost'
  }
>) {
  const variants = {
    primary: 'bg-chrome-950 text-white hover:bg-chrome-900',
    secondary: 'border border-chrome-300 bg-white text-chrome-950 hover:border-chrome-500',
    ghost: 'bg-transparent text-chrome-800 hover:bg-white/70',
  }

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: PropsWithChildren<{
  label: string
  hint?: string
  error?: string
}>) {
  return (
    <label className="flex flex-col gap-2 text-sm text-chrome-800">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-chrome-500">{hint}</span> : null}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm text-chrome-950 outline-none transition placeholder:text-chrome-400 focus:border-ember-500 focus:ring-2 focus:ring-ember-300/40',
        props.className,
      )}
    />
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'min-h-28 w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm text-chrome-950 outline-none transition placeholder:text-chrome-400 focus:border-ember-500 focus:ring-2 focus:ring-ember-300/40',
        props.className,
      )}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        'w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm text-chrome-950 outline-none transition focus:border-ember-500 focus:ring-2 focus:ring-ember-300/40',
        props.className,
      )}
    />
  )
}

export function DataList({
  rows,
}: {
  rows: Array<{
    label: string
    value: ReactNode
  }>
}) {
  return (
    <dl className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-2xl border border-chrome-200 bg-white/70 px-4 py-3"
        >
          <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">{row.label}</dt>
          <dd className="min-w-0 break-words text-sm text-chrome-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
}: PropsWithChildren<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  trigger?: ReactNode
}>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-chrome-950/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel outline-none">
          <div className="space-y-2 border-b border-chrome-200 pb-4">
            <Dialog.Title className="font-display text-2xl font-semibold text-chrome-950">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-chrome-700">
              {description}
            </Dialog.Description>
          </div>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatCurrency(currency: string, amount: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
