import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const inviteSchema = z.object({
  inviteToken: z.string().min(1, 'Invite token is required'),
  displayName: z.string().min(1, 'Display name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export function InvitePage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      inviteToken: searchParams.get('token') ?? '',
      displayName: '',
      password: '',
    },
  })

  if (auth.status === 'authenticated') {
    return <Navigate to="/missions" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.acceptInvite(values)
      navigate('/missions', { replace: true })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : 'Unable to accept invite'
      setError('root', { message: detail })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">Invite acceptance</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-chrome-950">
            Activate your beta access
          </h1>
          <p className="mt-4 max-w-2xl text-base text-chrome-700">
            This app supports customers, internal ops, and platform admins in one console. Invite
            tokens are single-use and time-boxed, so complete setup in one session.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Role-bound</p>
              <p className="mt-2 text-sm text-chrome-700">
                Your invite decides whether you land in read-only or writable workspace modes.
              </p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Cookie session</p>
              <p className="mt-2 text-sm text-chrome-700">
                Refresh stays in an HttpOnly cookie. Access token remains in app memory only.
              </p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Audit ready</p>
              <p className="mt-2 text-sm text-chrome-700">
                Internal support access and billing mutations are visible in the audit trail.
              </p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <h2 className="font-display text-3xl font-semibold text-chrome-950">Accept invite</h2>
          <p className="mt-2 text-sm text-chrome-700">
            Paste the invite token you received, choose a display name, and set your password.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <Field label="Invite token" error={errors.inviteToken?.message}>
              <Input autoComplete="off" {...register('inviteToken')} />
            </Field>
            <Field label="Display name" error={errors.displayName?.message}>
              <Input autoComplete="name" {...register('displayName')} />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <Input type="password" autoComplete="new-password" {...register('password')} />
            </Field>
            {errors.root?.message ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errors.root.message}
              </div>
            ) : null}
            <ActionButton className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Activating…' : 'Activate Access'}
            </ActionButton>
          </form>
        </Panel>
      </div>
    </div>
  )
}
