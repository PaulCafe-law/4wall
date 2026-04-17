import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const loginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件地址。'),
  password: z.string().min(8, '密碼至少需要 8 個字元。'),
})

type LoginFormValues = z.infer<typeof loginSchema>

function formatLoginError(detail?: string) {
  if (detail === 'invalid_credentials') {
    return '帳號或密碼不正確。'
  }
  if (detail === 'rate_limit_exceeded') {
    return '登入嘗試次數過多，請稍後再試。'
  }
  return '登入失敗，請確認帳號資訊後再試一次。'
}

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
    return <Navigate to="/" replace />
  }

  const expired = searchParams.get('expired') === '1' || auth.status === 'expired'

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.login(values)
      navigate('/', { replace: true })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatLoginError(detail) })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="flex flex-col justify-between overflow-hidden bg-chrome-950 text-white">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ember-300">客戶入口</p>
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em]">
              管理場域、任務、成果交付與團隊存取
            </h1>
            <p className="mt-4 max-w-2xl text-base text-chrome-200">
              這個工作區整合任務追蹤、巡檢報表、控制平面與帳務資訊。客戶管理者可直接建立組織，受邀成員則可透過邀請連結完成開通。
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">場域與任務</p>
              <p className="mt-2 text-sm text-chrome-100">集中管理場域資料、任務需求與目前進度。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">成果交付</p>
              <p className="mt-2 text-sm text-chrome-100">下載最新巡檢成果、查看交付狀態與失敗原因。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ember-300">團隊存取</p>
              <p className="mt-2 text-sm text-chrome-100">管理成員、邀請連結與組織角色分工。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">帳號存取</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-chrome-950">登入</h2>
          <p className="mt-2 text-sm text-chrome-700">輸入你的帳號密碼以進入工作區。</p>

          {expired ? (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              你的工作階段已過期，請重新登入。
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
              {isSubmitting ? '登入中…' : '登入工作區'}
            </ActionButton>
          </form>

          <div className="mt-6 space-y-3 border-t border-chrome-200 pt-4 text-sm text-chrome-700">
            <p>
              還沒有組織帳號？
              <Link className="ml-1 text-ember-500 underline" to="/signup">
                建立新組織
              </Link>
            </p>
            <p>
              已經收到邀請？
              <Link className="ml-1 text-ember-500 underline" to="/invite">
                使用邀請連結開通
              </Link>
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
