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
  ShellSection,
  Select,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'

const inviteSchema = z.object({
  email: z.email('Enter a valid email address'),
  role: z.enum(['customer_admin', 'customer_viewer']),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export function OrganizationsPage() {
  const queryClient = useQueryClient()
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>('')
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
      const detail = error instanceof ApiError ? error.detail : 'Unable to create invite'
      setError('root', { message: detail })
    }
  })

  if (organizationsQuery.isLoading) {
    return (
      <Panel>
        <p className="text-sm text-chrome-700">Loading organizations…</p>
      </Panel>
    )
  }

  if (!organizationsQuery.data?.length) {
    return (
      <EmptyState
        title="No organization yet"
        body="Create or import organizations before invite management and audit triage can proceed."
      />
    )
  }

  const selectedOrganization = organizationsQuery.data.find(
    (organization) => organization.organizationId === selectedId,
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Internal console"
        title="Organizations"
        subtitle="Inspect org membership, pending invites, and customer-side access without leaving the main app."
        action={
          <Modal
            open={isOpen}
            onOpenChange={setIsOpen}
            title="Issue invite"
            description="Invite customer admins or customer viewers into the selected organization."
            trigger={<ActionButton>New Invite</ActionButton>}
          >
            <form className="grid gap-4" onSubmit={onSubmit}>
              <Field label="Email" error={errors.email?.message}>
                <Input {...register('email')} />
              </Field>
              <Field label="Role" error={errors.role?.message}>
                <Select {...register('role')}>
                  <option value="customer_viewer">customer_viewer</option>
                  <option value="customer_admin">customer_admin</option>
                </Select>
              </Field>
              {errors.root?.message ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errors.root.message}
                </div>
              ) : null}
              <div className="flex justify-end">
                <ActionButton disabled={createInvite.isPending} type="submit">
                  {createInvite.isPending ? 'Issuing…' : 'Create Invite'}
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
                <p className="mt-1 text-sm text-chrome-600">{organization.slug}</p>
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
              Pending invites return the raw invite token so ops can distribute them manually during beta.
            </p>
          </Panel>

          {detailQuery.data ? (
            <>
              <Panel>
                <DataList
                  rows={[
                    { label: 'Slug', value: detailQuery.data.slug },
                    { label: 'Active', value: detailQuery.data.isActive ? 'Yes' : 'No' },
                    { label: 'Members', value: detailQuery.data.members.length },
                    { label: 'Pending', value: detailQuery.data.pendingInvites.length },
                  ]}
                />
              </Panel>

              <Panel>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Members</p>
                <div className="mt-4 grid gap-3">
                  {detailQuery.data.members.map((member) => (
                    <div key={member.membershipId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                      <p className="font-medium text-chrome-950">{member.role}</p>
                      <p className="mt-1 text-sm text-chrome-700">{member.isActive ? 'active' : 'disabled'}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Pending invites</p>
                <div className="mt-4 grid gap-3">
                  {detailQuery.data.pendingInvites.length === 0 ? (
                    <p className="text-sm text-chrome-700">No outstanding invite.</p>
                  ) : (
                    detailQuery.data.pendingInvites.map((invite) => (
                      <div key={invite.inviteId} className="rounded-2xl border border-chrome-200 bg-white/70 px-4 py-4">
                        <p className="font-medium text-chrome-950">{invite.email}</p>
                        <p className="mt-1 text-sm text-chrome-700">{invite.role}</p>
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
