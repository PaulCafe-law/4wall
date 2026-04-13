import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { ActionButton } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatRole } from '../lib/presentation'

const customerLinks = [
  { to: '/', label: '總覽' },
  { to: '/sites', label: '場址' },
  { to: '/missions', label: '任務' },
  { to: '/billing', label: '帳務' },
  { to: '/team', label: '團隊' },
]

const internalLinks = [
  { to: '/live-ops', label: '飛行監看' },
  { to: '/organizations', label: '組織' },
  { to: '/support', label: '支援佇列' },
  { to: '/audit', label: '稽核記錄' },
]

function linkClass(active: boolean) {
  return active
    ? 'inline-flex w-fit items-center rounded-full bg-chrome-950 px-4 py-2 text-white'
    : 'inline-flex w-fit items-center rounded-full px-4 py-2 text-chrome-700 transition hover:bg-white/70 hover:text-chrome-950'
}

export function AppShell() {
  const auth = useAuth()
  const location = useLocation()

  const headerScopeLabel = auth.isInternal
    ? location.pathname.startsWith('/live-ops') ||
      location.pathname.startsWith('/organizations') ||
      location.pathname.startsWith('/support') ||
      location.pathname.startsWith('/audit')
      ? '目前為內部支援與跨組織檢視模式。'
      : '目前為客戶工作區檢視模式。'
    : '目前為客戶工作區檢視模式。'

  return (
    <>
      <div className="md:hidden">
        <div className="min-h-screen bg-grain px-6 py-10">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-panel backdrop-blur">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">桌面優先</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">
              目前僅支援桌面寬度
            </h1>
            <p className="mt-3 text-sm text-chrome-700">
              請在 1280px 以上的桌面視窗開啟，才能使用完整的任務、監看與營運功能。
            </p>
          </div>
        </div>
      </div>

      <div className="hidden min-h-screen bg-grain md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-r border-white/60 bg-chrome-50/70 px-5 py-6 backdrop-blur">
          <div className="space-y-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-ember-500">The Fourth Wall</p>
              <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">
                路線主控台
              </h1>
              <p className="mt-2 text-sm text-chrome-700">
                客戶可管理場址、任務與帳務；內部人員可額外查看飛行監看、支援與稽核資料。
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">客戶工作區</p>
                <nav className="mt-3 flex flex-col items-start gap-2">
                  {customerLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      end={link.to === '/'}
                      to={link.to}
                      className={({ isActive }) => linkClass(isActive)}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </nav>
              </div>

              {auth.isInternal ? (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">內部支援</p>
                  <nav className="mt-3 flex flex-col items-start gap-2">
                    {internalLinks.map((link) => (
                      <NavLink key={link.to} to={link.to} className={({ isActive }) => linkClass(isActive)}>
                        {link.label}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-panel">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">目前登入</p>
              <p className="mt-3 text-sm font-medium text-chrome-950">{auth.user?.displayName}</p>
              <p className="mt-1 break-all text-sm text-chrome-600">{auth.user?.email}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {auth.user?.globalRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500"
                  >
                    {formatRole(role)}
                  </span>
                ))}
                {auth.user?.memberships
                  .filter((membership) => membership.organizationId)
                  .map((membership) => (
                    <span
                      key={membership.membershipId}
                      className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700"
                    >
                      {formatRole(membership.role)}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex flex-col items-start gap-3 border-b border-white/60 bg-chrome-50/70 px-6 py-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-chrome-500">營運工作台</p>
              <p className="text-sm text-chrome-700">
                {headerScopeLabel}
              </p>
            </div>
            <ActionButton variant="secondary" onClick={() => void auth.logout()}>
              登出
            </ActionButton>
          </header>

          <main className="min-w-0 px-4 py-4 md:px-6 md:py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  )
}
