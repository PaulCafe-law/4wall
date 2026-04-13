import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatApiError } from '../../lib/presentation'

const inviteSchema = z.object({
  inviteToken: z.string().min(1, '邀請代碼不可為空'),
  displayName: z.string().min(1, '顯示名稱不可為空'),
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
      setError('root', { message: formatApiError(detail, '無法啟用邀請，請稍後再試。') })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">邀請啟用</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-chrome-950">
            啟用你的測試權限
          </h1>
          <p className="mt-4 max-w-2xl text-base text-chrome-700">
            這套應用同時支援客戶、內部營運與平台管理員。邀請代碼僅能使用一次且有時效，請在同一次操作中完成設定。
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">角色綁定</p>
              <p className="mt-2 text-sm text-chrome-700">邀請內容會決定你進入的是唯讀工作區還是可寫入工作區。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Cookie 工作階段</p>
              <p className="mt-2 text-sm text-chrome-700">刷新權杖保留在 HttpOnly cookie 中，存取權杖只存在於應用記憶體。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">可追溯稽核</p>
              <p className="mt-2 text-sm text-chrome-700">內部支援存取與帳務異動都能在稽核記錄中追蹤。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <h2 className="font-display text-3xl font-semibold text-chrome-950">啟用邀請</h2>
          <p className="mt-2 text-sm text-chrome-700">貼上收到的邀請代碼，填寫顯示名稱，並設定登入密碼。</p>

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
              {isSubmitting ? '啟用中…' : '啟用帳號'}
            </ActionButton>
          </form>
        </Panel>
      </div>
    </div>
  )
}
