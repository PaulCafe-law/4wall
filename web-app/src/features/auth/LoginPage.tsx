import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, type InputHTMLAttributes, type PropsWithChildren, type Ref } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatApiError } from '../../lib/presentation'

// The login surface uses the warehouse system's visual language so that
// www.4wall.io → platform.4wall.io reads as one product. Shared `components/ui`
// styles stay untouched for the rest of the platform.
// See docs/platform-login-warehouse-restyle.md.

const loginSchema = z.object({
  email: z.string().trim().min(3, '請輸入帳號或電子郵件'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const LOGIN_FONT_LINK_ID = 'platform-login-fonts'
const LOGIN_FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Noto+Sans+TC:wght@400;500;700&display=swap'

// Appended once, non-blocking, so other platform pages never wait on web fonts.
function useLoginFonts() {
  useEffect(() => {
    if (document.getElementById(LOGIN_FONT_LINK_ID)) return
    const link = document.createElement('link')
    link.id = LOGIN_FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = LOGIN_FONT_STYLESHEET
    document.head.append(link)
  }, [])
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
  useLoginFonts()

  const lineLink = searchParams.get('lineLink') === '1'
  const authenticatedDestination = lineLink ? '/line/link' : '/overview'

  if (auth.status === 'authenticated') {
    return <Navigate to={authenticatedDestination} replace />
  }

  const expired = searchParams.get('expired') === '1' || auth.status === 'expired'

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.login(values)
      navigate(authenticatedDestination, { replace: true })
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '登入失敗，請稍後再試。') })
    }
  })

  return (
    <LoginFrame>
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_25rem] md:grid-rows-[auto_1fr] md:gap-x-16 md:gap-y-12 md:py-20">
        <section className="md:col-start-1 md:row-start-1 md:pt-6">
          <p className="text-[13px] font-semibold tracking-[0.04em] text-warehouse-teal">倉庫模擬與規劃平台</p>
          <h1 className="mt-4 text-[32px] font-bold leading-[1.2] tracking-[-0.02em] sm:text-[44px] sm:leading-[1.15]">
            倉庫的模擬與規劃，
            <br />
            在同一個工作區完成。
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-warehouse-muted">
            這裡是 4WALL AI 的平台入口，供受邀的團隊與合作夥伴登入使用。
          </p>
        </section>

        <section className="self-start rounded-xl border border-warehouse-line bg-white p-6 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_16px_40px_rgba(17,17,17,0.06)] sm:p-8 md:col-start-2 md:row-span-2 md:row-start-1">
          <h2 className="text-2xl font-bold tracking-[-0.02em]">登入</h2>
          <p className="mt-2 text-sm leading-relaxed text-warehouse-muted">
            請使用受邀帳號登入。新使用者請先啟用邀請。
          </p>

          {expired ? (
            <div className="mt-5 rounded-[9px] border border-warehouse-warn/30 bg-warehouse-warn-soft px-4 py-3 text-sm text-warehouse-warn">
              你的工作階段已過期，請重新登入以恢復權限。
            </div>
          ) : null}

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
            <LoginField
              label="帳號或電子郵件"
              error={errors.email?.message}
              type="text"
              autoComplete="username"
              {...register('email')}
            />
            <LoginField
              label="密碼"
              error={errors.password?.message}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.root?.message ? (
              <div className="rounded-[9px] bg-warehouse-danger-soft px-4 py-3 text-sm text-warehouse-danger" role="alert">
                {errors.root.message}
              </div>
            ) : null}
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-[9px] bg-warehouse-teal px-4 text-[15px] font-semibold text-white transition-colors hover:bg-warehouse-teal-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warehouse-teal disabled:cursor-wait disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? '登入中…' : '進入主控台'}
            </button>
          </form>

          <div className="mt-6 border-t border-warehouse-line pt-4 text-sm text-warehouse-muted">
            手上已有邀請連結？{' '}
            <a
              className="font-medium text-warehouse-teal underline underline-offset-2 hover:text-warehouse-teal-strong"
              href="/invite"
            >
              啟用邀請
            </a>
          </div>
        </section>

        <dl className="grid gap-px overflow-hidden rounded-xl border border-warehouse-line bg-warehouse-line sm:grid-cols-3 md:col-start-1 md:row-start-2 md:self-start">
          <LoginFact term="邀請制">帳號由 4WALL 團隊開通，收到邀請連結後即可啟用。</LoginFact>
          <LoginFact term="桌面瀏覽器">建議使用 1280px 以上的桌面瀏覽器開啟工作區。</LoginFact>
          <LoginFact term="需要協助">
            登入或帳號問題，請來信：
            <a
              className="block text-warehouse-ink underline underline-offset-2 hover:text-warehouse-teal"
              href="mailto:admin@4wall.io"
            >
              admin@4wall.io
            </a>
          </LoginFact>
        </dl>
      </main>
    </LoginFrame>
  )
}

/** Shown at the platform root while the session is restored, in the login's look. */
export function LoginRestoring() {
  useLoginFonts()

  return (
    <LoginFrame>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-xl border border-warehouse-line bg-white px-8 py-10 text-center" role="status">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-warehouse-line border-t-warehouse-teal motion-reduce:animate-none" />
          <h1 className="mt-5 text-xl font-bold tracking-[-0.02em]">正在恢復登入狀態</h1>
          <p className="mt-2 text-sm text-warehouse-muted">正在確認你的登入狀態，請稍候。</p>
        </div>
      </main>
    </LoginFrame>
  )
}

function LoginFrame({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-screen flex-col bg-white bg-[linear-gradient(theme(colors.warehouse.grid)_1px,transparent_1px),linear-gradient(90deg,theme(colors.warehouse.grid)_1px,transparent_1px)] bg-[size:24px_24px] font-warehouse text-warehouse-ink antialiased">
      <header className="border-b border-warehouse-line bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="inline-flex items-center gap-2 text-xl font-bold leading-none tracking-[-0.04em]">
            <LayersMark />
            4WALL AI
          </span>
          <a
            className="text-sm font-medium text-warehouse-muted transition-colors hover:text-warehouse-ink"
            href="https://www.4wall.io/"
          >
            回到官網
          </a>
        </div>
      </header>
      {children}
    </div>
  )
}

function LoginField({
  label,
  error,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  ref?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        {...props}
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 w-full rounded-[9px] border border-warehouse-line-strong bg-white px-3.5 text-[15px] text-warehouse-ink outline-none transition placeholder:text-warehouse-muted focus:border-warehouse-teal focus:ring-[3px] focus:ring-warehouse-teal/15 aria-[invalid=true]:border-warehouse-danger"
      />
      {error ? (
        <p className="text-xs text-warehouse-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

function LoginFact({ term, children }: PropsWithChildren<{ term: string }>) {
  return (
    <div className="bg-white p-5">
      <dt className="text-sm font-semibold">{term}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-warehouse-muted">{children}</dd>
    </div>
  )
}

function LayersMark() {
  return (
    <svg
      className="h-[22px] w-[22px] flex-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </svg>
  )
}
