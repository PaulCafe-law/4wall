import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatApiError } from '../../lib/presentation'

const loginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件地址'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
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
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '登入失敗，請稍後再試。') })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="flex flex-col justify-between overflow-hidden bg-chrome-950 text-white">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ember-300">僅限受邀測試</p>
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em]">
              桌面任務規劃、營運與客戶檢視主控台。
            </h1>
            <p className="mt-4 max-w-2xl text-base text-chrome-200">
              一個主控台整合場址、任務請求、產物、帳務與稽核。桌面應用維持在飛行關鍵迴路之外。
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">桌面優先</p>
              <p className="mt-2 text-sm text-chrome-100">1280px 以上提供完整工作區體驗。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">多角色</p>
              <p className="mt-2 text-sm text-chrome-100">同一套應用整合內部營運與客戶視角。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">人工帳務</p>
              <p className="mt-2 text-sm text-chrome-100">測試版以帳單流程為主，並內建稽核可視性。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">工作階段入口</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-chrome-950">登入</h2>
          <p className="mt-2 text-sm text-chrome-700">
            請使用受邀帳號登入。新使用者請先啟用邀請。
          </p>

          {expired ? (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              你的工作階段已過期，請重新登入以恢復權限。
            </div>
          ) : null}

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
            <Field label="電子郵件" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="密碼" error={errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...register('password')} />
            </Field>
            {errors.root?.message ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errors.root.message}
              </div>
            ) : null}
            <ActionButton className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? '登入中…' : '進入主控台'}
            </ActionButton>
          </form>

          <div className="mt-6 border-t border-chrome-200 pt-4 text-sm text-chrome-700">
            手上已有邀請連結？ <a className="text-ember-500 underline" href="/invite">啟用邀請</a>
          </div>
        </Panel>
      </div>
    </div>
  )
}
