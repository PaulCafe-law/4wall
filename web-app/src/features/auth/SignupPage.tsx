import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const signupSchema = z.object({
  displayName: z.string().min(1, '請輸入顯示名稱。'),
  email: z.string().email('請輸入有效的電子郵件地址。'),
  organizationName: z.string().min(1, '請輸入組織名稱。'),
  organizationSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, '組織代稱只能包含小寫英數字與連字號。')
    .optional()
    .or(z.literal('')),
  password: z.string().min(8, '密碼至少需要 8 個字元。'),
})

type SignupFormValues = z.infer<typeof signupSchema>

function formatSignupError(detail?: string) {
  if (detail === 'user_email_exists') {
    return '這個電子郵件地址已經註冊過。'
  }
  if (detail === 'organization_slug_exists') {
    return '這個組織代稱已被使用。'
  }
  if (detail === 'invalid_slug') {
    return '組織代稱格式不正確。'
  }
  if (detail === 'rate_limit_exceeded') {
    return '建立帳號嘗試次數過多，請稍後再試。'
  }
  return '建立組織失敗，請確認資訊後再試一次。'
}

export function SignupPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      displayName: '',
      email: '',
      organizationName: '',
      organizationSlug: '',
      password: '',
    },
  })

  if (auth.status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.signup({
        displayName: values.displayName.trim(),
        email: values.email.trim().toLowerCase(),
        organizationName: values.organizationName.trim(),
        organizationSlug: values.organizationSlug?.trim() || undefined,
        password: values.password,
      })
      navigate('/', { replace: true })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatSignupError(detail) })
    }
  })

  return (
    <div className="min-h-screen bg-grain px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[minmax(0,1fr)_28rem]">
        <Panel className="flex flex-col justify-between overflow-hidden bg-white/80">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ember-500">自助註冊</p>
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em] text-chrome-950">
              建立組織後，直接開始使用巡檢工作區
            </h1>
            <p className="mt-4 max-w-2xl text-base text-chrome-700">
              新組織建立完成後，系統會直接把你設為客戶管理員。之後你可以持續邀請其他成員加入，一起查看任務、報表與交付狀態。
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">建立組織</p>
              <p className="mt-2 text-sm text-chrome-700">完成註冊後，系統會自動建立新的組織空間。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">組織代稱</p>
              <p className="mt-2 text-sm text-chrome-700">可選填方便辨識的代稱，例如 `acme-builders`。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">後續邀請</p>
              <p className="mt-2 text-sm text-chrome-700">建立完成後，可再邀請檢視者或其他管理員加入。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">建立帳號</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-chrome-950">建立新組織</h2>
          <p className="mt-2 text-sm text-chrome-700">填寫以下資料後，即可開始使用網站。</p>

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
            <Field label="顯示名稱" error={errors.displayName?.message}>
              <Input autoComplete="name" {...register('displayName')} />
            </Field>
            <Field label="電子郵件" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="組織名稱" error={errors.organizationName?.message}>
              <Input autoComplete="organization" {...register('organizationName')} />
            </Field>
            <Field
              label="組織代稱"
              hint="選填，建議使用容易辨識的短名稱。若不填，系統會自動從組織名稱產生。"
              error={errors.organizationSlug?.message}
            >
              <Input autoComplete="off" placeholder="acme-builders" {...register('organizationSlug')} />
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
              {isSubmitting ? '建立中…' : '建立組織並登入'}
            </ActionButton>
          </form>

          <div className="mt-6 space-y-3 border-t border-chrome-200 pt-4 text-sm text-chrome-700">
            <p>
              已經有帳號？
              <Link className="ml-1 text-ember-500 underline" to="/login">
                直接登入
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
