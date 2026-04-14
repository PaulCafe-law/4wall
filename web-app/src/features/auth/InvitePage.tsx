import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const inviteSchema = z.object({
  inviteToken: z.string().min(1, '請輸入邀請代碼'),
  displayName: z.string().min(1, '請輸入顯示名稱'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
})

type InviteFormValues = z.infer<typeof inviteSchema>

function formatInviteError(detail?: string) {
  if (detail === 'invite_not_found') {
    return '找不到這個邀請，請確認連結或代碼是否正確。'
  }
  if (detail === 'invite_revoked') {
    return '這份邀請已被撤銷。'
  }
  if (detail === 'invite_used') {
    return '這份邀請已經使用過。'
  }
  if (detail === 'invite_expired') {
    return '這份邀請已經過期。'
  }
  if (detail === 'rate_limit_exceeded') {
    return '嘗試次數過多，請稍後再試。'
  }
  return '開通失敗，請確認邀請資訊後再試一次。'
}

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
      setError('root', { message: formatInviteError(detail) })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">Invite Access</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-chrome-950">
            使用邀請連結加入既有組織
          </h1>
          <p className="mt-4 max-w-2xl text-base text-chrome-700">
            如果你是由平台內部人員或客戶管理者邀請加入團隊，請貼上邀請代碼、設定密碼並完成開通。
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">團隊加入</p>
              <p className="mt-2 text-sm text-chrome-700">加入既有組織後，你會直接取得對應角色與存取權限。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">安全登入</p>
              <p className="mt-2 text-sm text-chrome-700">完成開通後會建立工作階段，之後可直接回到任務與成果頁面。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">需要新組織？</p>
              <p className="mt-2 text-sm text-chrome-700">如果你是第一次使用並且還沒有組織，請改用自助註冊建立新帳號。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <h2 className="font-display text-3xl font-semibold text-chrome-950">開通帳號</h2>
          <p className="mt-2 text-sm text-chrome-700">輸入邀請代碼、顯示名稱與新密碼。</p>

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
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

          <div className="mt-6 space-y-3 border-t border-chrome-200 pt-4 text-sm text-chrome-700">
            <p>
              你是組織管理者，還沒有帳號？
              <Link className="ml-1 text-ember-500 underline" to="/signup">
                建立新組織
              </Link>
            </p>
            <p>
              已經有帳號？
              <Link className="ml-1 text-ember-500 underline" to="/login">
                返回登入
              </Link>
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
