import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  if (auth.status === 'authenticated') {
    return <Navigate to="/missions" replace />
  }

  const expired = searchParams.get('expired') === '1' || auth.status === 'expired'

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.login(values)
      navigate('/missions', { replace: true })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : 'Unable to sign in'
      setError('root', { message: detail })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="flex flex-col justify-between overflow-hidden bg-chrome-950 text-white">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ember-300">Invite-only beta</p>
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em]">
              Desktop mission control for planning, support, and customer review.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-chrome-200">
              One console for sites, mission requests, artifacts, billing, and audit. The desktop app
              stays outside the flight-critical loop.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">Desktop first</p>
              <p className="mt-2 text-sm text-chrome-100">Full workspace at 1280px and above.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">Multi-role</p>
              <p className="mt-2 text-sm text-chrome-100">Internal ops and customer views in one app.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">Manual billing</p>
              <p className="mt-2 text-sm text-chrome-100">Invoice-first beta with audit visibility built in.</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">Session gate</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-chrome-950">Sign in</h2>
          <p className="mt-2 text-sm text-chrome-700">
            Use an invited account. For new users, accept the invite token first.
          </p>

          {expired ? (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your session expired. Sign in again to restore access.
            </div>
          ) : null}

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...register('password')} />
            </Field>
            {errors.root?.message ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errors.root.message}
              </div>
            ) : null}
            <ActionButton className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Signing in…' : 'Enter Console'}
            </ActionButton>
          </form>

          <div className="mt-6 border-t border-chrome-200 pt-4 text-sm text-chrome-700">
            Invite link in hand? <a className="text-ember-500 underline" href="/invite">Accept invite</a>
          </div>
        </Panel>
      </div>
    </div>
  )
}
