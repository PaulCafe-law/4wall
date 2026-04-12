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

const inviteSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件地址'),
  role: z.enum(['customer_admin', 'customer_viewer']),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export function TeamPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { choices, isLoading: choicesLoading } = useOrganizationChoices('read')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [isOpen, setIsOpen] = useState(false)

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organization', selectedId] })
      setIsOpen(false)
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
      const key = formatRole(member.role)
      summary.set(key, (summary.get(key) ?? 0) + 1)
    }
    return [...summary.entries()]
  }, [detailQuery.data])

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createInvite.mutateAsync(values)
      reset()
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '建立邀請失敗，請稍後再試。') })
    }
  })

  if (choicesLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在整理團隊資料…</p>
      </Panel>
    )
  }

  if (!choices.length) {
    return (
      <EmptyState
        title="目前沒有可管理的團隊"
        body="你的帳號還沒有可查看的組織。請先接受邀請，或請平台營運協助建立組織。"
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="客戶工作區"
        title="團隊"
        subtitle="查看目前組織的成員角色與待接受邀請。若你有管理權限，也可以從這裡直接邀請新成員。"
        action={
          canInvite ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="邀請團隊成員"
              description="邀請會寄給指定的電子郵件地址。對方接受邀請後，就能登入這個平台。"
              trigger={<ActionButton>邀請成員</ActionButton>}
            >
              <form className="grid gap-4" onSubmit={onSubmit}>
                <Field label="電子郵件地址" error={errors.email?.message}>
                  <Input {...register('email')} />
                </Field>
                <Field label="角色" error={errors.role?.message}>
                  <Select {...register('role')}>
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
                  <ActionButton disabled={createInvite.isPending} type="submit">
                    {createInvite.isPending ? '正在建立邀請…' : '送出邀請'}
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

      {detailQuery.isLoading ? (
        <Panel>
          <p className="text-sm text-chrome-700">正在讀取團隊詳細資料…</p>
        </Panel>
      ) : null}

      {detailQuery.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="組織成員數" value={detailQuery.data.members.length} />
            <Metric label="待接受邀請" value={detailQuery.data.pendingInvites.length} />
            <Metric label="可邀請新成員" value={formatBoolean(canInvite)} />
            <Metric label="角色類型" value={roleSummary.length || 0} hint="目前組織內的角色分布。" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
              <Panel>
                <h2 className="font-display text-2xl font-semibold text-chrome-950">{detailQuery.data.name}</h2>
                <p className="mt-2 text-sm text-chrome-700">
                  這裡顯示團隊角色分布與待接受邀請。完整的人員檔案會在後續商品化版本補齊。
                </p>
                <div className="mt-4">
                  <DataList
                    rows={[
                      { label: '組織代稱', value: detailQuery.data.slug },
                      { label: '啟用狀態', value: formatBoolean(detailQuery.data.isActive) },
                      { label: '你的權限', value: canInvite ? '可管理團隊' : '僅可檢視' },
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
                        <p className="mt-2 text-sm text-chrome-700">{count} 位成員</p>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>

            <Panel>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">待接受邀請</p>
              <div className="mt-4 grid gap-3">
                {detailQuery.data.pendingInvites.length === 0 ? (
                  <p className="text-sm text-chrome-700">目前沒有待接受的邀請。</p>
                ) : (
                  detailQuery.data.pendingInvites.map((invite) => (
                    <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                      <p className="break-all font-medium text-chrome-950">{invite.email}</p>
                      <p className="mt-1 text-sm text-chrome-700">{formatRole(invite.role)}</p>
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
