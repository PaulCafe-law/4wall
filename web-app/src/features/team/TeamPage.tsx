import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  ActionButton,
  DataList,
  EmptyState,
  Field,
  formatDateTime,
  Input,
  Metric,
  Modal,
  Panel,
  Select,
  ShellSection,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError, formatBoolean, formatRole, formatRoleOption } from '../../lib/presentation'
import type { InviteCreateResponse } from '../../lib/types'

const inviteSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件地址'),
  role: z.enum(['customer_admin', 'customer_viewer']),
})

type InviteFormValues = z.infer<typeof inviteSchema>
type RevokeInvitePayload = { inviteId: string }

function buildInviteUrl(inviteToken: string) {
  const inviteUrl = new URL('/invite', window.location.origin)
  inviteUrl.searchParams.set('token', inviteToken)
  return inviteUrl.toString()
}

export function TeamPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { choices, isLoading: choicesLoading } = useOrganizationChoices('read')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [latestInvite, setLatestInvite] = useState<InviteCreateResponse | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'unavailable' | 'failed'>('idle')

  const selectedId = selectedOrganizationId || choices[0]?.organizationId || ''
  const canInvite = selectedId ? auth.canWriteOrganization(selectedId) : false

  const detailQuery = useAuthedQuery({
    queryKey: ['organization', selectedId],
    queryFn: (token) => api.getOrganization(token, selectedId),
    enabled: Boolean(selectedId),
  })

  const createInvite = useAuthedMutation({
    mutationKey: ['team', 'invite', selectedId],
    mutationFn: ({ token, payload }: { token: string; payload: InviteFormValues }) =>
      api.createInvite(token, selectedId, payload),
    onSuccess: async (response) => {
      setLatestInvite(response)
      setCopyState('idle')
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
      setIsInviteModalOpen(false)
    },
  })

  const revokeInvite = useAuthedMutation({
    mutationKey: ['team', 'invite', selectedId, 'revoke'],
    mutationFn: ({ token, payload }: { token: string; payload: RevokeInvitePayload }) =>
      api.revokeInvite(token, payload.inviteId),
    onSuccess: async (_, variables) => {
      if (latestInvite?.invite.inviteId === variables.inviteId) {
        setLatestInvite(null)
        setCopyState('idle')
      }
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    reset,
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'customer_viewer',
    },
  })

  const roleSummary = useMemo(() => {
    const summary = new Map<string, number>()
    for (const member of detailQuery.data?.members ?? []) {
      const roleLabel = formatRole(member.role)
      summary.set(roleLabel, (summary.get(roleLabel) ?? 0) + 1)
    }
    return [...summary.entries()]
  }, [detailQuery.data])

  const latestInviteUrl = useMemo(() => {
    if (!latestInvite) {
      return ''
    }
    return buildInviteUrl(latestInvite.inviteToken)
  }, [latestInvite])

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createInvite.mutateAsync(values)
      reset()
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '建立邀請失敗，請稍後再試。') })
    }
  })

  async function handleCopyInviteLink() {
    if (!latestInviteUrl) {
      return
    }
    if (!navigator.clipboard?.writeText) {
      setCopyState('unavailable')
      return
    }
    try {
      await navigator.clipboard.writeText(latestInviteUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  if (choicesLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在載入團隊資料…</p>
      </Panel>
    )
  }

  if (!choices.length) {
    return (
      <EmptyState
        title="目前沒有可管理的團隊"
        body="請先加入至少一個組織，才能查看成員、邀請與角色設定。"
      />
    )
  }

  if (detailQuery.isError) {
    const detail = detailQuery.error instanceof ApiError ? detailQuery.error.detail : undefined
    return (
      <EmptyState
        title="無法載入團隊資料"
        body={formatApiError(detail, '目前無法讀取組織詳情，請稍後再試。')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="客戶工作區"
        title="團隊"
        subtitle="管理目前組織的成員、待接受邀請與協作權限。客戶管理者可直接發送或撤銷邀請。"
        action={
          canInvite ? (
            <Modal
              open={isInviteModalOpen}
              onOpenChange={setIsInviteModalOpen}
              title="邀請成員"
              description="建立新的邀請連結，讓受邀人完成帳號啟用並加入目前組織。"
              trigger={
                <ActionButton aria-label="invite-team-member" type="button">
                  邀請成員
                </ActionButton>
              }
            >
              <form className="grid gap-4" onSubmit={onSubmit}>
                <Field label="電子郵件" error={errors.email?.message}>
                  <Input aria-label="invite-email" autoComplete="email" {...register('email')} />
                </Field>
                <Field label="角色" error={errors.role?.message}>
                  <Select aria-label="invite-role" {...register('role')}>
                    <option value="customer_viewer">{formatRoleOption('customer_viewer')}</option>
                    <option value="customer_admin">{formatRoleOption('customer_admin')}</option>
                  </Select>
                </Field>
                {errors.root?.message ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errors.root.message}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton aria-label="submit-invite" disabled={createInvite.isPending} type="submit">
                    {createInvite.isPending ? '建立邀請中…' : '建立邀請'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <Panel>
        <Field label="目前組織">
          <Select value={selectedId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
            {choices.map((choice) => (
              <option key={choice.organizationId} value={choice.organizationId}>
                {choice.name}
              </option>
            ))}
          </Select>
        </Field>
      </Panel>

      {latestInvite ? (
        <Panel>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">最新邀請</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">已建立可分享的邀請連結</h2>
              <p className="mt-2 text-sm text-chrome-700">
                {latestInvite.invite.email} ・ {formatRole(latestInvite.invite.role)}
              </p>
            </div>
            <div className="flex gap-2">
              <ActionButton
                aria-label="copy-invite-link"
                disabled={!latestInviteUrl}
                type="button"
                variant="secondary"
                onClick={() => void handleCopyInviteLink()}
              >
                複製邀請連結
              </ActionButton>
              <ActionButton
                aria-label="dismiss-latest-invite"
                type="button"
                variant="ghost"
                onClick={() => {
                  setLatestInvite(null)
                  setCopyState('idle')
                }}
              >
                關閉
              </ActionButton>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <DataList
              rows={[
                { label: '受邀信箱', value: latestInvite.invite.email },
                { label: '角色', value: formatRole(latestInvite.invite.role) },
                { label: '到期時間', value: formatDateTime(latestInvite.invite.expiresAt) },
              ]}
            />
            <Field
              label="邀請連結"
              hint={
                copyState === 'copied'
                  ? '邀請連結已複製。'
                  : copyState === 'unavailable'
                    ? '目前瀏覽器不支援直接複製，請手動複製。'
                    : copyState === 'failed'
                      ? '複製失敗，請手動複製。'
                      : '把這個連結交給受邀成員完成啟用。'
              }
            >
              <Input aria-label="invite-link" readOnly value={latestInviteUrl} />
            </Field>
          </div>
        </Panel>
      ) : null}

      {detailQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入組織詳情…</p>
        </Panel>
      ) : null}

      {detailQuery.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="成員數" value={detailQuery.data.members.length} />
            <Metric label="待接受邀請" value={detailQuery.data.pendingInvites.length} />
            <Metric label="可發送邀請" value={formatBoolean(canInvite)} />
            <Metric label="角色種類" value={roleSummary.length || 0} hint="目前團隊中出現的角色數量" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
              <Panel>
                <h2 className="font-display text-2xl font-semibold text-chrome-950">{detailQuery.data.name}</h2>
                <p className="mt-2 text-sm text-chrome-700">
                  這裡集中顯示目前組織的團隊狀態，方便確認角色分工、帳號是否啟用，以及還有哪些邀請尚未完成。
                </p>
                <div className="mt-4">
                  <DataList
                    rows={[
                      { label: '組織代號', value: detailQuery.data.slug },
                      { label: '啟用狀態', value: formatBoolean(detailQuery.data.isActive) },
                      { label: '邀請權限', value: canInvite ? '可管理邀請' : '僅能檢視' },
                    ]}
                  />
                </div>
              </Panel>

              <Panel>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">角色分布</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {roleSummary.length === 0 ? (
                    <p className="text-sm text-chrome-700">目前沒有成員角色資料。</p>
                  ) : (
                    roleSummary.map(([role, count]) => (
                      <div key={role} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                        <p className="font-medium text-chrome-950">{role}</p>
                        <p className="mt-2 text-sm text-chrome-700">{count} 人</p>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">待接受邀請</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">目前待處理的邀請</h2>
              <p className="mt-2 text-sm text-chrome-700">從這裡確認邀請是否已送出、何時到期，以及是否需要撤銷後重新建立。</p>
              {revokeInvite.isError ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formatApiError(
                    revokeInvite.error instanceof ApiError ? revokeInvite.error.detail : undefined,
                    '撤銷邀請失敗，請稍後再試。',
                  )}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3">
                {detailQuery.data.pendingInvites.length === 0 ? (
                  <p className="text-sm text-chrome-700">目前沒有待接受邀請。</p>
                ) : (
                  detailQuery.data.pendingInvites.map((invite) => (
                    <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                      <p className="break-all font-medium text-chrome-950">{invite.email}</p>
                      <p className="mt-1 text-sm text-chrome-700">{formatRole(invite.role)}</p>
                      <p className="mt-1 text-sm text-chrome-600">到期：{formatDateTime(invite.expiresAt)}</p>
                      {canInvite ? (
                        <div className="mt-3">
                          <ActionButton
                            aria-label={`revoke-invite-${invite.inviteId}`}
                            disabled={revokeInvite.isPending}
                            type="button"
                            variant="secondary"
                            onClick={() => void revokeInvite.mutateAsync({ inviteId: invite.inviteId })}
                          >
                            {revokeInvite.isPending ? '處理中…' : '撤銷邀請'}
                          </ActionButton>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  )
}
