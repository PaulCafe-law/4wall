import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatApiError } from '../../lib/presentation'

const inviteSchema = z.object({
  inviteToken: z.string().min(1, '請輸入邀請代碼'),
  displayName: z.string().min(1, '請輸入顯示名稱'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
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
    return <Navigate to="/" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.acceptInvite(values)
      navigate('/', { replace: true })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '接受邀請失敗，請稍後再試。') })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">邀請制開通</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-chrome-950">
            使用邀請連結開通你的帳號
          </h1>
          <p className="mt-4 max-w-2xl text-base text-chrome-700">
            完成這一步後，你就能登入平台查看場址、任務成果、帳務與團隊資訊。若你是內部角色，也會自動帶入對應的支援權限。
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">角色綁定</p>
              <p className="mt-2 text-sm text-chrome-700">邀請裡會包含角色與組織範圍，接受後就會套用到你的帳號。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">安全登入</p>
              <p className="mt-2 text-sm text-chrome-700">完成接受邀請後，系統會建立瀏覽器工作階段，供後續登入與續期使用。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">後續可登入</p>
              <p className="mt-2 text-sm text-chrome-700">之後可直接回到登入頁使用你設定的電子郵件與密碼登入。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <h2 className="font-display text-3xl font-semibold text-chrome-950">接受邀請</h2>
          <p className="mt-2 text-sm text-chrome-700">貼上邀請代碼，填寫你的顯示名稱與密碼後即可完成開通。</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <Field label="邀請代碼" error={errors.inviteToken?.message}>
              <Input autoComplete="off" {...register('inviteToken')} />
            </Field>
            <Field label="顯示名稱" error={errors.displayName?.message}>
              <Input autoComplete="name" {...register('displayName')} />
            </Field>
            <Field label="密碼" error={errors.password?.message}>
              <Input type="password" autoComplete="new-password" {...register('password')} />
            </Field>
            {errors.root?.message ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errors.root.message}
              </div>
            ) : null}
            <ActionButton className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? '開通中…' : '完成開通'}
            </ActionButton>
          </form>
        </Panel>
      </div>
    </div>
  )
}
