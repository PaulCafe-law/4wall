import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, Field, Input, Panel } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const signupSchema = z.object({
  displayName: z.string().min(1, '請輸入你的姓名'),
  email: z.string().email('請輸入有效的電子郵件地址'),
  organizationName: z.string().min(1, '請輸入組織名稱'),
  organizationSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, '組織網址代號只能使用小寫英數與連字號')
    .optional()
    .or(z.literal('')),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
})

type SignupFormValues = z.infer<typeof signupSchema>

function formatSignupError(detail?: string) {
  if (detail === 'user_email_exists') {
    return '這個電子郵件地址已經註冊。'
  }
  if (detail === 'organization_slug_exists') {
    return '這個組織網址代號已經被使用。'
  }
  if (detail === 'invalid_slug') {
    return '組織網址代號格式不正確。'
  }
  if (detail === 'rate_limit_exceeded') {
    return '註冊嘗試次數過多，請稍後再試。'
  }
  return '建立組織失敗，請確認資料後再試一次。'
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
            <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-ember-500">Self-Serve Signup</p>
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-[-0.05em] text-chrome-950">
              建立你的組織，直接開始管理任務與成果交付
            </h1>
            <p className="mt-4 max-w-2xl text-base text-chrome-700">
              這個流程會一次建立管理者帳號、組織與第一個工作區。完成後你可以立刻登入總覽、建立場址並提交任務請求。
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">第一位管理者</p>
              <p className="mt-2 text-sm text-chrome-700">你會成為組織的第一位 customer admin。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">組織網址代號</p>
              <p className="mt-2 text-sm text-chrome-700">可自行指定，未填時系統會依組織名稱自動產生。</p>
            </div>
            <div className="rounded-2xl border border-chrome-200 bg-chrome-50/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">後續邀請</p>
              <p className="mt-2 text-sm text-chrome-700">建立完成後，你可以在團隊頁再邀請其他成員加入。</p>
            </div>
          </div>
        </Panel>

        <Panel className="self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">Create Account</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-chrome-950">建立新組織</h2>
          <p className="mt-2 text-sm text-chrome-700">填寫管理者與組織資訊，完成後會直接登入。</p>

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
            <Field label="你的姓名" error={errors.displayName?.message}>
              <Input autoComplete="name" {...register('displayName')} />
            </Field>
            <Field label="電子郵件" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="組織名稱" error={errors.organizationName?.message}>
              <Input autoComplete="organization" {...register('organizationName')} />
            </Field>
            <Field
              label="組織網址代號"
              hint="只接受小寫英數與連字號，例如 acme-builders。留白時會自動依組織名稱產生。"
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
                返回登入
              </Link>
            </p>
            <p>
              你是被邀請加入團隊？
              <Link className="ml-1 text-ember-500 underline" to="/invite">
                改用邀請連結開通
              </Link>
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
