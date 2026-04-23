import { NavLink, Outlet } from 'react-router-dom'

import { ActionButton } from '../components/ui'
import { useAuth } from '../lib/auth'
import { formatRole } from '../lib/presentation'

const customerLinks = [
  { to: '/overview', label: '總覽' },
  { to: '/sites', label: '場域' },
  { to: '/missions', label: '任務' },
  { to: '/billing', label: '帳務' },
]

const internalLinks = [
  { to: '/control-plane', label: '控制平面' },
  { to: '/live-ops', label: '即時營運' },
  { to: '/organizations', label: '組織' },
  { to: '/support', label: '支援工作台' },
  { to: '/audit', label: '稽核紀錄' },
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
        </div>
      </div>

      <div className="hidden min-h-screen bg-grain md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-r border-white/60 bg-chrome-50/70 px-5 py-6 backdrop-blur">
          <div className="space-y-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-ember-500">
                The Fourth Wall
              </p>
              <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">
                建築巡檢工作區
              </h1>
              <p className="mt-2 text-sm text-chrome-700">
                Web 端負責規劃、營運、支援與客戶入口，不進 flight-critical loop。
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">
                  客戶工作區
                </p>
                <nav className="mt-3 flex flex-col items-start gap-2">
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
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex flex-col items-start gap-3 border-b border-white/60 bg-chrome-50/70 px-6 py-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-chrome-500">
                目前頁面範圍
              </p>
              <p className="text-sm text-chrome-700">
                目前位於客戶入口，可檢視場域、任務、報表與帳務資訊。
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
