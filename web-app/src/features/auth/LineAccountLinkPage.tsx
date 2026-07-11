import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import {
  api,
  ApiError,
  getApiBaseOrigin,
  isAllowedLineAccountLinkRedirectUrl,
  type LineAccountLinkPayload,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { formatApiError } from '../../lib/presentation'

const FLOW_STORAGE_KEY = 'fw.line-account-link.flow'

type CapturedFlow = {
  token: string | null
  storageAvailable: boolean
}

type LineAccountLinkPageProps = {
  apiOrigin?: string
  navigateToAccountLink?: (url: string) => void
}

export function LineAccountLinkPage({
  apiOrigin = getApiBaseOrigin(),
  navigateToAccountLink = (url) => window.location.assign(url),
}: LineAccountLinkPageProps) {
  const auth = useAuth()
  const [capturedFlow, setCapturedFlow] = useState<CapturedFlow | null>(null)
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [completionError, setCompletionError] = useState<string | null>(null)

  useEffect(() => {
    setCapturedFlow(captureFlowToken())
  }, [])

  const sitesQuery = useAuthedQuery({
    queryKey: [
      'line-account-link',
      'sites',
      auth.user?.userId ?? 'anonymous',
      capturedFlow?.token ?? 'missing-flow',
    ],
    queryFn: api.listLineAccountLinkSites,
    enabled: Boolean(capturedFlow?.token),
  })

  useEffect(() => {
    setSelectedSiteId('')
    setCompletionError(null)
  }, [auth.user?.userId, capturedFlow?.token])

  useEffect(() => {
    const sites = sitesQuery.data ?? []
    if (sites.length === 1) {
      setSelectedSiteId(sites[0].siteId)
      return
    }
    if (selectedSiteId && !sites.some((site) => site.siteId === selectedSiteId)) {
      setSelectedSiteId('')
    }
  }, [selectedSiteId, sitesQuery.data])

  const completeLink = useAuthedMutation({
    mutationKey: ['line-account-link', 'complete'],
    mutationFn: ({ token, payload }: { token: string; payload: LineAccountLinkPayload }) =>
      api.completeLineAccountLink(token, payload),
    onSuccess: (result) => {
      if (!isAllowedLineAccountLinkRedirectUrl(result.accountLinkUrl, apiOrigin)) {
        setCompletionError('帳號連結網址無法驗證，尚未離開此頁。請稍後重試。')
        return
      }
      try {
        window.sessionStorage.removeItem(FLOW_STORAGE_KEY)
      } catch {
        // The server accepted the flow. Storage cleanup is best-effort before the LINE redirect.
      }
      navigateToAccountLink(result.accountLinkUrl)
    },
    onError: (error) => {
      const detail = error instanceof ApiError ? error.detail : undefined
      setCompletionError(formatApiError(detail, '無法完成 LINE 帳號連結，請稍後重試。'))
    },
  })

  if (capturedFlow === null || auth.status === 'restoring') {
    return <LinkPageStatus title="正在確認連結狀態" body="系統正在讀取 LINE 連結並確認登入狀態。" />
  }

  if (!capturedFlow.token) {
    return (
      <LinkPageStatus
        tone="error"
        title="找不到 LINE 連結資訊"
        body="請回到 LINE，重新對官方帳號傳送「連結帳號」後，再開啟新的連結。"
      />
    )
  }

  if ((auth.status === 'anonymous' || auth.status === 'expired') && !capturedFlow.storageAvailable) {
    return (
      <LinkPageStatus
        tone="error"
        title="瀏覽器無法保存連結"
        body="請允許此頁使用暫存資料，再回到 LINE 重新開啟連結。"
      />
    )
  }

  if (auth.status === 'anonymous' || auth.status === 'expired') {
    return <Navigate to="/login?lineLink=1" replace />
  }

  const sites = sitesQuery.data ?? []
  const visibleError = completionError ?? (sitesQuery.error ? '無法載入可使用的場域，請稍後重試。' : null)

  const submit = () => {
    if (!selectedSiteId || !capturedFlow.token) {
      setCompletionError('請先選擇要在 LINE 使用的場域。')
      return
    }
    setCompletionError(null)
    completeLink.mutate({ flowToken: capturedFlow.token, siteId: selectedSiteId })
  }

  return (
    <main className="min-h-screen bg-chrome-50 px-4 py-8 text-chrome-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-chrome-300 pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-moss-500">LINE 帳號連結</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            選擇 LINE 要使用的場域
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-chrome-700 sm:text-base">
            完成後，官方帳號只會依照你選擇的場域與目前有效的帳號權限回覆資訊。
          </p>
        </header>

        <section className="mt-6 rounded-xl border border-chrome-300 bg-white p-5 shadow-[0_16px_48px_rgba(18,24,33,0.08)] sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-chrome-200 pb-5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">登入帳號</p>
              <p className="mt-2 font-medium text-chrome-950">{auth.user?.displayName}</p>
              <p className="mt-1 text-sm text-chrome-700">{auth.user?.email}</p>
            </div>
            <span className="rounded border border-moss-300 bg-moss-300/30 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500">
              已驗證
            </span>
          </div>

          {sitesQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-chrome-700" role="status">
              正在載入可使用的場域…
            </div>
          ) : sites.length > 0 ? (
            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-chrome-950">可使用的場域</legend>
              <p className="mt-1 text-sm text-chrome-700">
                {sites.length === 1 ? '已為你預選唯一可使用的場域，確認後再繼續。' : '請明確選擇一個場域。'}
              </p>
              <div className="mt-4 divide-y divide-chrome-200 border-y border-chrome-200">
                {sites.map((site) => {
                  const selected = selectedSiteId === site.siteId
                  return (
                    <label
                      key={site.siteId}
                      className={`flex cursor-pointer items-start gap-3 px-2 py-4 transition-colors duration-150 ${
                        selected ? 'bg-moss-300/20' : 'hover:bg-chrome-50'
                      }`}
                    >
                      <input
                        checked={selected}
                        className="mt-1 h-4 w-4 accent-moss-500"
                        name="line-site"
                        onChange={() => {
                          setSelectedSiteId(site.siteId)
                          setCompletionError(null)
                        }}
                        type="radio"
                        value={site.siteId}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-chrome-950">{site.name}</span>
                        <span className="mt-1 block text-sm leading-5 text-chrome-700">{site.address}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : !sitesQuery.error ? (
            <div className="mt-6 border-y border-chrome-200 py-8">
              <h2 className="font-display text-xl font-semibold text-chrome-950">目前沒有可連結的場域</h2>
              <p className="mt-2 text-sm leading-6 text-chrome-700">
                請聯絡管理者確認你的組織權限與場域設定，再從 LINE 重新開始連結。
              </p>
            </div>
          ) : null}

          {visibleError ? (
            <div
              aria-live="polite"
              className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {visibleError}
            </div>
          ) : null}

          <div className="mt-6 border-t border-chrome-200 pt-5">
            <p className="text-sm leading-6 text-chrome-700">
              日後若要取消綁定，可在 LINE 對官方帳號傳送「解除連結」。
            </p>
            <button
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-moss-500 px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-moss-400 disabled:cursor-not-allowed disabled:bg-chrome-300 sm:w-auto"
              disabled={!selectedSiteId || completeLink.isPending || sitesQuery.isLoading}
              onClick={submit}
              type="button"
            >
              {completeLink.isPending ? '正在建立安全連結…' : '繼續前往 LINE'}
            </button>
          </div>
        </section>

        <p className="mt-5 font-mono text-[11px] leading-5 text-chrome-500">
          場域權限會在每次 LINE 操作時重新確認。權限停用後，官方帳號將停止提供該場域資料。
        </p>
      </div>
    </main>
  )
}

function captureFlowToken(): CapturedFlow {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const fragmentToken = fragment.get('flow')?.trim() || null
  let storageAvailable = true

  if (fragmentToken) {
    try {
      window.sessionStorage.setItem(FLOW_STORAGE_KEY, fragmentToken)
    } catch {
      storageAvailable = false
    }
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    )
    return { token: fragmentToken, storageAvailable }
  }

  try {
    return {
      token: window.sessionStorage.getItem(FLOW_STORAGE_KEY)?.trim() || null,
      storageAvailable: true,
    }
  } catch {
    return { token: null, storageAvailable: false }
  }
}

function LinkPageStatus({
  title,
  body,
  tone = 'neutral',
}: {
  title: string
  body: string
  tone?: 'neutral' | 'error'
}) {
  return (
    <main className="flex min-h-screen items-center bg-chrome-50 px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-chrome-300 bg-white p-6 shadow-[0_16px_48px_rgba(18,24,33,0.08)] sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-moss-500">LINE 帳號連結</p>
        <h1
          className={`mt-3 font-display text-3xl font-semibold ${tone === 'error' ? 'text-red-700' : 'text-chrome-950'}`}
        >
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-chrome-700">{body}</p>
      </section>
    </main>
  )
}
