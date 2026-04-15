import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
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
import type { InviteCreateResponse, OrganizationMember } from '../../lib/types'

const inviteSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件。'),
  role: z.enum(['customer_admin', 'customer_viewer']),
})

type InviteFormValues = z.infer<typeof inviteSchema>

type MemberDraft = {
  role: 'customer_admin' | 'customer_viewer'
  isActive: boolean
}

type PendingInviteAction = 'revoke' | 'resend'

type InviteState = {
  label: string
  tone: 'critical' | 'warning' | 'neutral'
  description: string
}

function buildInviteUrl(inviteToken: string) {
  const inviteUrl = new URL('/invite', window.location.origin)
  inviteUrl.searchParams.set('token', inviteToken)
  return inviteUrl.toString()
}

function formatTeamError(detail: string | undefined, fallback: string) {
  if (detail === 'organization_requires_customer_admin') {
    return '每個組織至少要保留一位啟用中的客戶管理者。'
  }
  return formatApiError(detail, fallback)
}

function memberDraftFromRecord(member: OrganizationMember): MemberDraft {
  return {
    role: member.role,
    isActive: member.isActive,
  }
}

function hasMemberDraftChanges(member: OrganizationMember, draft: MemberDraft) {
  return member.role !== draft.role || member.isActive !== draft.isActive
}

function describeInviteState(expiresAt: string): InviteState {
  const now = Date.now()
  const expiresAtMs = new Date(expiresAt).getTime()
  const remainingMs = expiresAtMs - now
  if (remainingMs <= 0) {
    return {
      label: '已過期',
      tone: 'critical',
      description: '這筆邀請已過期，若仍需要加入，請重新寄送新的邀請連結。',
    }
  }
  if (remainingMs <= 24 * 60 * 60 * 1000) {
    return {
      label: '即將到期',
      tone: 'warning',
      description: '這筆邀請會在 24 小時內失效，建議確認對方是否已完成開通。',
    }
  }
  return {
    label: '等待接受',
    tone: 'neutral',
    description: '對方尚未完成開通，可直接複製最新邀請連結或重新寄送。',
  }
}

function inviteStateClass(tone: InviteState['tone']) {
  if (tone === 'critical') {
    return 'rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700'
  }
  if (tone === 'warning') {
    return 'rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800'
  }
  return 'rounded-full border border-chrome-200 bg-chrome-50 px-3 py-1 text-xs text-chrome-700'
}

export function TeamPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { choices, isLoading: choicesLoading } = useOrganizationChoices('read')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [latestInvite, setLatestInvite] = useState<InviteCreateResponse | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'unavailable' | 'failed'>('idle')
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [organizationNameDraft, setOrganizationNameDraft] = useState<string | null>(null)
  const [organizationError, setOrganizationError] = useState<string | null>(null)
  const [organizationNotice, setOrganizationNotice] = useState<string | null>(null)
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({})
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({})
  const [pendingMembershipId, setPendingMembershipId] = useState<string | null>(null)
  const [pendingInviteAction, setPendingInviteAction] = useState<{
    inviteId: string
    action: PendingInviteAction
  } | null>(null)

  const selectedId = selectedOrganizationId || choices[0]?.organizationId || ''
  const canManageOrganization = selectedId ? auth.canWriteOrganization(selectedId) : false

  const detailQuery = useAuthedQuery({
    queryKey: ['organization', selectedId],
    queryFn: (token) => api.getOrganization(token, selectedId),
    enabled: Boolean(selectedId),
  })

  const organizationName = organizationNameDraft ?? detailQuery.data?.name ?? ''

  const createInvite = useAuthedMutation({
    mutationKey: ['team', 'invite', selectedId],
    mutationFn: ({ token, payload }: { token: string; payload: InviteFormValues }) =>
      api.createInvite(token, selectedId, payload),
    onSuccess: async (response) => {
      setLatestInvite(response)
      setCopyState('idle')
      setInviteNotice('邀請已建立，請分享最新邀請連結。')
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
      setIsInviteModalOpen(false)
    },
  })

  const revokeInvite = useAuthedMutation({
    mutationKey: ['team', 'invite', selectedId, 'revoke'],
    mutationFn: ({ token, payload }: { token: string; payload: { inviteId: string } }) =>
      api.revokeInvite(token, payload.inviteId),
    onSuccess: async (_, variables) => {
      if (latestInvite?.invite.inviteId === variables.inviteId) {
        setLatestInvite(null)
        setCopyState('idle')
      }
      setInviteNotice('邀請已撤銷。')
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
    },
    onSettled: () => {
      setPendingInviteAction(null)
    },
  })

  const resendInvite = useAuthedMutation({
    mutationKey: ['team', 'invite', selectedId, 'resend'],
    mutationFn: ({ token, payload }: { token: string; payload: { inviteId: string } }) =>
      api.resendInvite(token, payload.inviteId),
    onSuccess: async (response) => {
      setLatestInvite(response)
      setCopyState('idle')
      setInviteNotice('已重新寄送邀請，請改用新的邀請連結。')
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
    },
    onSettled: () => {
      setPendingInviteAction(null)
    },
  })

  const updateOrganization = useAuthedMutation({
    mutationKey: ['organization', selectedId, 'update'],
    mutationFn: ({ token, payload }: { token: string; payload: { name: string } }) =>
      api.updateOrganization(token, selectedId, payload),
    onSuccess: async () => {
      setOrganizationNameDraft(null)
      setOrganizationError(null)
      setOrganizationNotice('組織設定已更新。')
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
      await queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
  })

  const updateMembership = useAuthedMutation({
    mutationKey: ['organization', selectedId, 'members', 'update'],
    mutationFn: ({
      token,
      payload,
    }: {
      token: string
      payload: { membershipId: string; role: 'customer_admin' | 'customer_viewer'; isActive: boolean }
    }) =>
      api.updateMembership(token, selectedId, payload.membershipId, {
        role: payload.role,
        isActive: payload.isActive,
      }),
    onSuccess: async (_, variables) => {
      setMemberErrors((current) => {
        const next = { ...current }
        delete next[variables.membershipId]
        return next
      })
      setMemberDrafts((current) => {
        const next = { ...current }
        delete next[variables.membershipId]
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
    },
    onSettled: () => {
      setPendingMembershipId(null)
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
      const label = formatRole(member.role)
      summary.set(label, (summary.get(label) ?? 0) + 1)
    }
    return [...summary.entries()]
  }, [detailQuery.data])

  const latestInviteUrl = useMemo(() => {
    if (!latestInvite) {
      return ''
    }
    return buildInviteUrl(latestInvite.inviteToken)
  }, [latestInvite])

  const activeMemberCount = detailQuery.data?.members.filter((member) => member.isActive).length ?? 0
  const activeAdminCount =
    detailQuery.data?.members.filter((member) => member.role === 'customer_admin' && member.isActive).length ?? 0
  const inviteActionErrorDetail =
    revokeInvite.error instanceof ApiError
      ? revokeInvite.error.detail
      : resendInvite.error instanceof ApiError
        ? resendInvite.error.detail
        : undefined

  const onSubmitInvite = handleSubmit(async (values) => {
    try {
      await createInvite.mutateAsync(values)
      reset()
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatTeamError(detail, '建立邀請失敗，請稍後再試。') })
    }
  })

  function resetSelectionState() {
    setOrganizationNameDraft(null)
    setOrganizationError(null)
    setOrganizationNotice(null)
    setInviteNotice(null)
    setMemberDrafts({})
    setMemberErrors({})
    setPendingMembershipId(null)
    setPendingInviteAction(null)
    setLatestInvite(null)
    setCopyState('idle')
  }

  function handleOrganizationChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedOrganizationId(event.target.value)
    resetSelectionState()
  }

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

  async function handleOrganizationSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detailQuery.data) {
      return
    }

    const nextName = organizationName.trim()
    if (!nextName) {
      setOrganizationError('請輸入組織名稱。')
      return
    }

    if (nextName === detailQuery.data.name) {
      setOrganizationError(null)
      setOrganizationNotice('組織名稱沒有變更。')
      return
    }

    try {
      await updateOrganization.mutateAsync({ name: nextName })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setOrganizationError(formatTeamError(detail, '更新組織設定失敗，請稍後再試。'))
      setOrganizationNotice(null)
    }
  }

  function updateMemberDraft(membershipId: string, patch: Partial<MemberDraft>) {
    setMemberDrafts((current) => ({
      ...current,
      [membershipId]: {
        ...(current[membershipId] ?? { role: 'customer_viewer', isActive: true }),
        ...patch,
      },
    }))
    setMemberErrors((current) => {
      if (!current[membershipId]) {
        return current
      }
      const next = { ...current }
      delete next[membershipId]
      return next
    })
  }

  async function handleMemberSave(member: OrganizationMember) {
    const draft = memberDrafts[member.membershipId] ?? memberDraftFromRecord(member)
    if (!hasMemberDraftChanges(member, draft)) {
      return
    }

    setPendingMembershipId(member.membershipId)
    try {
      await updateMembership.mutateAsync({
        membershipId: member.membershipId,
        role: draft.role,
        isActive: draft.isActive,
      })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setMemberErrors((current) => ({
        ...current,
        [member.membershipId]: formatTeamError(detail, '更新成員設定失敗，請稍後再試。'),
      }))
    }
  }

  if (choicesLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在載入組織與成員資料。</p>
      </Panel>
    )
  }

  if (!choices.length) {
    return (
      <EmptyState
        title="目前沒有可查看的組織"
        body="請先加入組織，或請內部團隊協助建立與指派你的帳號權限。"
      />
    )
  }

  if (detailQuery.isError) {
    const detail = detailQuery.error instanceof ApiError ? detailQuery.error.detail : undefined
    return (
      <EmptyState
        title="無法載入團隊資料"
        body={formatTeamError(detail, '目前無法取得組織與成員資料，請稍後再試。')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Team And Access"
        title="團隊"
        subtitle="管理組織名稱、成員角色、啟用狀態與待接受邀請。客戶管理者可建立與重新寄送邀請，客戶檢視者則維持只讀。"
        action={
          canManageOrganization ? (
            <Modal
              open={isInviteModalOpen}
              onOpenChange={setIsInviteModalOpen}
              title="新增團隊邀請"
              description="建立新的邀請連結後，可直接分享給待加入成員。對方完成開通後，會依指定角色加入目前組織。"
              trigger={
                <ActionButton aria-label="invite-team-member" type="button">
                  邀請成員
                </ActionButton>
              }
            >
              <form className="grid gap-4" onSubmit={onSubmitInvite}>
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
                    {createInvite.isPending ? '建立中' : '建立邀請'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <Panel>
        <Field label="目前組織">
          <Select value={selectedId} onChange={handleOrganizationChange}>
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
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Latest Invite</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">最新邀請連結</h2>
              <p className="mt-2 text-sm text-chrome-700">
                {latestInvite.invite.email} · {formatRole(latestInvite.invite.role)}
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
                { label: '電子郵件', value: latestInvite.invite.email },
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
                    ? '目前環境不支援自動複製，請手動複製下方連結。'
                    : copyState === 'failed'
                      ? '複製失敗，請手動複製下方連結。'
                      : '請分享這個連結給待加入成員。'
              }
            >
              <Input aria-label="invite-link" readOnly value={latestInviteUrl} />
            </Field>
          </div>
        </Panel>
      ) : null}

      {inviteNotice ? (
        <Panel>
          <div className="rounded-2xl border border-moss-300 bg-moss-50 px-4 py-3 text-sm text-moss-700">
            {inviteNotice}
          </div>
        </Panel>
      ) : null}

      {detailQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在載入組織與團隊詳情。</p>
        </Panel>
      ) : null}

      {detailQuery.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="成員總數" value={detailQuery.data.members.length} />
            <Metric label="啟用中成員" value={activeMemberCount} />
            <Metric label="啟用中管理者" value={activeAdminCount} />
            <Metric
              label="待接受邀請"
              value={detailQuery.data.pendingInvites.length}
              hint={canManageOrganization ? '可重新寄送或撤銷邀請。' : '僅可查看目前邀請狀態。'}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Panel>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                      Organization Settings
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">
                      {detailQuery.data.name}
                    </h2>
                    <p className="mt-2 text-sm text-chrome-700">
                      維護組織名稱與基本設定，這些資訊會出現在任務、帳單與團隊流程中。
                    </p>
                  </div>
                </div>

                <form className="mt-4 grid gap-4" onSubmit={(event) => void handleOrganizationSave(event)}>
                  <Field
                    label="組織名稱"
                    hint={canManageOrganization ? '更新後會同步反映在所有客戶向頁面。' : '你目前只有檢視權限。'}
                    error={organizationError ?? undefined}
                  >
                    <Input
                      aria-label="organization-name"
                      disabled={!canManageOrganization}
                      value={organizationName}
                      onChange={(event) => {
                        setOrganizationNameDraft(event.target.value)
                        setOrganizationError(null)
                        setOrganizationNotice(null)
                      }}
                    />
                  </Field>
                  {organizationNotice ? (
                    <div className="rounded-2xl border border-moss-300 bg-moss-50 px-4 py-3 text-sm text-moss-700">
                      {organizationNotice}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <ActionButton
                      aria-label="save-organization"
                      disabled={!canManageOrganization || updateOrganization.isPending}
                      type="submit"
                    >
                      {updateOrganization.isPending ? '儲存中' : '儲存組織設定'}
                    </ActionButton>
                  </div>
                </form>

                <div className="mt-4">
                  <DataList
                    rows={[
                      { label: 'Slug', value: detailQuery.data.slug },
                      { label: '啟用中', value: formatBoolean(detailQuery.data.isActive) },
                      { label: '可編輯', value: formatBoolean(canManageOrganization) },
                    ]}
                  />
                </div>
              </Panel>

              <Panel>
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                    Members And Roles
                  </p>
                  <h2 className="font-display text-2xl font-semibold text-chrome-950">成員與角色</h2>
                  <p className="text-sm text-chrome-700">
                    客戶管理者可調整成員角色與啟用狀態；客戶檢視者僅能查看目前的分工與狀態。
                  </p>
                </div>

                <div className="mt-4 grid gap-4">
                  {detailQuery.data.members.map((member) => {
                    const draft = memberDrafts[member.membershipId] ?? memberDraftFromRecord(member)
                    const changed = hasMemberDraftChanges(member, draft)
                    const isSaving = pendingMembershipId === member.membershipId && updateMembership.isPending

                    return (
                      <div
                        key={member.membershipId}
                        className="rounded-[1.5rem] border border-chrome-200 bg-white/70 p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-chrome-950">{member.displayName}</p>
                            <p className="break-all text-sm text-chrome-700">{member.email}</p>
                          </div>
                          <div className="shrink-0 rounded-full border border-chrome-200 px-3 py-1 text-xs text-chrome-700">
                            {member.isActive ? '啟用中' : '已停用'}
                          </div>
                        </div>

                        {canManageOrganization ? (
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <Field label="角色">
                              <Select
                                aria-label={`member-role-${member.membershipId}`}
                                value={draft.role}
                                onChange={(event) =>
                                  updateMemberDraft(member.membershipId, {
                                    role: event.target.value as MemberDraft['role'],
                                  })
                                }
                              >
                                <option value="customer_viewer">{formatRoleOption('customer_viewer')}</option>
                                <option value="customer_admin">{formatRoleOption('customer_admin')}</option>
                              </Select>
                            </Field>
                            <Field label="狀態">
                              <Select
                                aria-label={`member-status-${member.membershipId}`}
                                value={draft.isActive ? 'active' : 'inactive'}
                                onChange={(event) =>
                                  updateMemberDraft(member.membershipId, {
                                    isActive: event.target.value === 'active',
                                  })
                                }
                              >
                                <option value="active">啟用中</option>
                                <option value="inactive">已停用</option>
                              </Select>
                            </Field>
                          </div>
                        ) : (
                          <div className="mt-4">
                            <DataList
                              rows={[
                                { label: '角色', value: formatRole(member.role) },
                                { label: '狀態', value: member.isActive ? '啟用中' : '已停用' },
                              ]}
                            />
                          </div>
                        )}

                        {memberErrors[member.membershipId] ? (
                          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {memberErrors[member.membershipId]}
                          </div>
                        ) : null}

                        {canManageOrganization ? (
                          <div className="mt-4 flex justify-end">
                            <ActionButton
                              aria-label={`save-member-${member.membershipId}`}
                              disabled={!changed || isSaving}
                              type="button"
                              variant={changed ? 'primary' : 'secondary'}
                              onClick={() => void handleMemberSave(member)}
                            >
                              {isSaving ? '儲存中' : '儲存成員設定'}
                            </ActionButton>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {roleSummary.map(([role, count]) => (
                    <div key={role} className="rounded-2xl border border-chrome-200 bg-chrome-50/80 px-4 py-4">
                      <p className="font-medium text-chrome-950">{role}</p>
                      <p className="mt-2 text-sm text-chrome-700">{count} 位</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Pending Invites</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-chrome-950">待接受邀請</h2>
              <p className="mt-2 text-sm text-chrome-700">
                這裡會集中顯示尚未完成開通的邀請。管理者可重新寄送新的邀請連結，或撤銷不再需要的邀請。
              </p>
              {inviteActionErrorDetail ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formatTeamError(inviteActionErrorDetail, '團隊邀請操作失敗，請稍後再試。')}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3">
                {detailQuery.data.pendingInvites.length === 0 ? (
                  <p className="text-sm text-chrome-700">目前沒有待接受的邀請。</p>
                ) : (
                  detailQuery.data.pendingInvites.map((invite) => {
                    const inviteState = describeInviteState(invite.expiresAt)
                    const isRevokePending =
                      pendingInviteAction?.inviteId === invite.inviteId &&
                      pendingInviteAction.action === 'revoke' &&
                      revokeInvite.isPending
                    const isResendPending =
                      pendingInviteAction?.inviteId === invite.inviteId &&
                      pendingInviteAction.action === 'resend' &&
                      resendInvite.isPending

                    return (
                      <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="break-all font-medium text-chrome-950">{invite.email}</p>
                            <p className="mt-1 text-sm text-chrome-700">{formatRole(invite.role)}</p>
                          </div>
                          <div className={inviteStateClass(inviteState.tone)}>{inviteState.label}</div>
                        </div>
                        <div className="mt-3">
                          <DataList
                            rows={[
                              { label: '最近寄送', value: formatDateTime(invite.createdAt) },
                              { label: '到期時間', value: formatDateTime(invite.expiresAt) },
                              { label: '狀態說明', value: inviteState.description },
                            ]}
                          />
                        </div>
                        {canManageOrganization ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <ActionButton
                              aria-label={`resend-invite-${invite.inviteId}`}
                              disabled={isResendPending || isRevokePending}
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setPendingInviteAction({ inviteId: invite.inviteId, action: 'resend' })
                                void resendInvite.mutateAsync({ inviteId: invite.inviteId })
                              }}
                            >
                              {isResendPending ? '重新寄送中' : '重新寄送'}
                            </ActionButton>
                            <ActionButton
                              aria-label={`revoke-invite-${invite.inviteId}`}
                              disabled={isRevokePending || isResendPending}
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setPendingInviteAction({ inviteId: invite.inviteId, action: 'revoke' })
                                void revokeInvite.mutateAsync({ inviteId: invite.inviteId })
                              }}
                            >
                              {isRevokePending ? '撤銷中' : '撤銷邀請'}
                            </ActionButton>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  )
}
