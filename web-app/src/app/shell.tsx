import { NavLink, Outlet } from 'react-router-dom'

import { ActionButton } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatRole } from '../lib/presentation'

const sharedLinks = [
  { to: '/sites', label: '場址' },
  { to: '/missions', label: '任務' },
  { to: '/missions/new', label: '規劃器' },
  { to: '/billing', label: '帳務' },
]

const internalLinks = [
  { to: '/organizations', label: '組織' },
  { to: '/audit', label: '稽核記錄' },
]

function linkClass(active: boolean) {
  return active
    ? 'inline-flex w-fit items-center rounded-full bg-chrome-950 px-4 py-2 text-white'
    : 'inline-flex w-fit items-center rounded-full px-4 py-2 text-chrome-700 transition hover:bg-white/70 hover:text-chrome-950'
}

export function AppShell() {
  const auth = useAuth()

  return (
    <>
      <div className="md:hidden">
        <div className="min-h-screen bg-grain px-6 py-10">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-panel backdrop-blur">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">不支援的視窗寬度</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">
              目前僅支援桌面版測試
            </h1>
            <p className="mt-3 text-sm text-chrome-700">
              1280px 以上提供完整工作流程，768px 以上提供有限操作。更小的螢幕尺寸不在本輪測試範圍內。
            </p>
          </div>
        </div>
      </div>

      <div className="hidden min-h-screen bg-grain md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-r border-white/60 bg-chrome-50/70 px-5 py-6 backdrop-blur">
          <div className="space-y-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-ember-500">第四面牆</p>
              <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">
                路線主控台
              </h1>
              <p className="mt-2 text-sm text-chrome-700">
                將規劃、營運與客戶工作區整合在同一個桌面應用中，且不進入飛行關鍵迴路。
              </p>
            </div>

            <nav className="flex flex-col items-start gap-2">
              {[...sharedLinks, ...(auth.isInternal ? internalLinks : [])].map((link) => (
                <NavLink key={link.to} to={link.to} className={({ isActive }) => linkClass(isActive)}>
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-panel">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">目前角色</p>
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
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-chrome-500">僅限受邀測試</p>
              <p className="text-sm text-chrome-700">平板寬度會把側欄收進主欄位，避免擠壓主要工作區。</p>
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
