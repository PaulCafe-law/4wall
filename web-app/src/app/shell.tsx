import { clsx } from 'clsx'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { ActionButton } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatRole } from '../lib/presentation'

const customerLinks = [
  { to: '/overview', label: '總覽' },
  { to: '/sites', label: '場域' },
  { to: '/cameras', label: '固定攝影機' },
  { to: '/factory-twin', label: '工廠數位分身' },
  { to: '/site-map', label: '場域地圖' },
  { to: '/missions', label: '任務' },
  { to: '/incidents', label: '異常事件' },
  { to: '/industrial-data-engine', label: '資料引擎' },
  { to: '/billing', label: '帳務' },
]

const internalLinks = [
  { to: '/attribution', label: '歸因工作台' },
  { to: '/control-plane', label: '控制平面' },
  { to: '/live-ops', label: '即時營運' },
  { to: '/organizations', label: '組織' },
  { to: '/support', label: '支援工作台' },
  { to: '/audit', label: '稽核紀錄' },
]

function linkClass(active: boolean) {
  return active
    ? 'inline-flex w-fit shrink-0 items-center rounded-full bg-chrome-950 px-4 py-2 text-white'
    : 'inline-flex w-fit shrink-0 items-center rounded-full px-4 py-2 text-chrome-700 transition hover:bg-white/70 hover:text-chrome-950'
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'fw.sidebar-collapsed'

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    if (collapsed) {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    }
  } catch {
    // Storage unavailable (private mode / prerender) — the preference is session-only.
  }
}

function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const label = collapsed ? '展開側欄' : '收合側欄'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-chrome-300 bg-white text-sm text-chrome-700 transition hover:border-chrome-500 hover:text-chrome-950"
    >
      {collapsed ? '»' : '«'}
    </button>
  )
}

export function AppShell() {
  const auth = useAuth()
  const location = useLocation()
  // 工廠數位分身頁以 3D 為主體：拿掉頁首文案、讓內容區撐滿可視高度。
  const immersive = location.pathname.startsWith('/factory-twin')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)

  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    writeSidebarCollapsed(next)
  }

  return (
    <div
      className={clsx(
        'bg-grain',
        immersive ? 'h-dvh overflow-hidden' : 'min-h-screen',
        sidebarCollapsed
          ? 'md:grid md:grid-cols-[3.25rem_minmax(0,1fr)]'
          : 'md:grid md:grid-cols-[18rem_minmax(0,1fr)]',
      )}
    >
      <aside
        className={clsx(
          // 側邊欄有自己的捲軸:視窗高、置頂、內容過長時獨立上下捲,不牽動主內容。
          'min-w-0 border-b border-white/60 bg-chrome-50/70 backdrop-blur md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r',
          sidebarCollapsed ? 'px-2 py-2 md:px-0 md:py-4' : 'px-4 py-5 md:px-5 md:py-6',
        )}
      >
        {sidebarCollapsed ? (
          <div className="flex md:sticky md:top-4 md:justify-center">
            <SidebarToggle collapsed onToggle={toggleSidebar} />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">
                  The Fourth Wall
                </p>
                <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">
                  建築巡檢工作區
                </h1>
                <p className="mt-3 text-sm text-chrome-700">
                  Web 端負責規劃、營運、支援與客戶入口，不進 flight-critical loop。
                </p>
              </div>
              <SidebarToggle collapsed={false} onToggle={toggleSidebar} />
            </div>

            <div className="space-y-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                  客戶工作區
                </p>
                <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-col md:items-start md:overflow-visible md:pb-0">
                  {customerLinks.map((link) => (
                    <NavLink key={link.to} to={link.to} className={({ isActive }) => linkClass(isActive)}>
                      {link.label}
                    </NavLink>
                  ))}
                </nav>
              </div>

              {auth.isInternal ? (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                    內部營運
                  </p>
                  <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-col md:items-start md:overflow-visible md:pb-0">
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
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                目前帳號
              </p>
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
              <ActionButton
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => void auth.logout()}
              >
                登出
              </ActionButton>
            </div>
          </div>
        )}
      </aside>

      <div className={clsx('min-w-0', immersive && 'flex h-dvh min-h-0 flex-col overflow-hidden')}>
        {immersive ? null : (
          <header className="sticky top-0 z-30 flex flex-col items-start gap-3 border-b border-chrome-200/80 bg-chrome-50/95 px-4 py-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-chrome-500">
                目前頁面範圍
              </p>
              <p className="text-sm text-chrome-700">
                目前位於客戶入口，可檢視場域、任務、報表與帳務資訊。
              </p>
            </div>
          </header>
        )}

        <main
          className={clsx(
            'min-w-0',
            immersive ? 'min-h-0 flex-1 overflow-hidden' : 'px-4 py-4 md:px-6 md:py-6',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
