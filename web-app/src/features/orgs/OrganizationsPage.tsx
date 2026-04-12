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
  Modal,
  Panel,
  Select,
  ShellSection,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError, formatBoolean, formatRole, formatRoleOption } from '../../lib/presentation'

const inviteSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件地址'),
  role: z.enum(['customer_admin', 'customer_viewer']),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export function OrganizationsPage() {
  const queryClient = useQueryClient()
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const organizationsQuery = useAuthedQuery({
    queryKey: ['organizations'],
    queryFn: api.listOrganizations,
    staleTime: 15_000,
  })

  const selectedId = selectedOrganizationId || organizationsQuery.data?.[0]?.organizationId || ''
  const detailQuery = useAuthedQuery({
    queryKey: ['organization', selectedId],
    queryFn: (token) => api.getOrganization(token, selectedId),
    enabled: Boolean(selectedId),
  })

  const createInvite = useAuthedMutation({
    mutationKey: ['organizations', 'invite'],
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
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'customer_viewer',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createInvite.mutateAsync(values)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '建立邀請失敗，請稍後再試。') })
    }
  })

  if (organizationsQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">正在整理組織資料…</p>
      </Panel>
    )
  }

  if (!organizationsQuery.data?.length) {
    return (
      <EmptyState
        title="目前還沒有組織"
        body="先建立第一個客戶組織，之後才能分派成員、場址與任務。"
      />
    )
  }

  const selectedOrganization = organizationsQuery.data.find(
    (organization) => organization.organizationId === selectedId,
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="內部支援"
        title="組織"
        subtitle="查看所有客戶組織的狀態、成員數與待接受邀請，並在需要時協助發送新的邀請。"
        action={
          <Modal
            open={isOpen}
            onOpenChange={setIsOpen}
            title="建立邀請"
            description="邀請會附帶角色資訊，並綁定到目前選取的組織。"
            trigger={<ActionButton>建立邀請</ActionButton>}
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
        }
      />

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel>
          <div className="space-y-3">
            {organizationsQuery.data.map((organization) => (
              <button
                key={organization.organizationId}
                className={
                  organization.organizationId === selectedId
                    ? 'w-full rounded-2xl border border-ember-300 bg-white px-4 py-4 text-left'
                    : 'w-full rounded-2xl border border-chrome-200 bg-chrome-50/70 px-4 py-4 text-left transition hover:border-chrome-400'
                }
                onClick={() => setSelectedOrganizationId(organization.organizationId)}
                type="button"
              >
                <p className="font-medium text-chrome-950">{organization.name}</p>
                <p className="mt-1 break-all text-sm text-chrome-600">{organization.slug}</p>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <h2 className="font-display text-3xl font-semibold text-chrome-950">
              {selectedOrganization?.name}
            </h2>
            <p className="mt-2 text-sm text-chrome-700">
              查看組織的啟用狀態、成員與待接受邀請，並在需要時協助客戶完成成員開通。
            </p>
          </Panel>

          {detailQuery.data ? (
            <>
              <Panel>
                <DataList
                  rows={[
                    { label: '組織代稱', value: detailQuery.data.slug },
                    { label: '啟用狀態', value: formatBoolean(detailQuery.data.isActive) },
                    { label: '成員數', value: detailQuery.data.members.length },
                    { label: '待接受邀請', value: detailQuery.data.pendingInvites.length },
                  ]}
                />
              </Panel>

              <Panel>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">成員角色</p>
                <div className="mt-4 grid gap-3">
                  {detailQuery.data.members.map((member, index) => (
                    <div key={member.membershipId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                      <p className="font-medium text-chrome-950">成員紀錄 {index + 1}</p>
                      <p className="mt-1 text-sm text-chrome-700">{formatRole(member.role)}</p>
                      <p className="mt-1 text-sm text-chrome-700">{member.isActive ? '已啟用' : '未啟用'}</p>
                    </div>
                  ))}
                </div>
              </Panel>

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
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
