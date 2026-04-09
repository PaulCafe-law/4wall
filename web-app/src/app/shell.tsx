import { NavLink, Outlet } from 'react-router-dom'

import { ActionButton } from '../components/ui'
import { useAuth } from '../lib/auth'

const sharedLinks = [
  { to: '/sites', label: 'Sites' },
  { to: '/missions', label: 'Missions' },
  { to: '/missions/new', label: 'Planner' },
  { to: '/billing', label: 'Billing' },
]

const internalLinks = [
  { to: '/organizations', label: 'Organizations' },
  { to: '/audit', label: 'Audit' },
]

function linkClass(active: boolean) {
  return active
    ? 'rounded-full bg-chrome-950 px-4 py-2 text-white'
    : 'rounded-full px-4 py-2 text-chrome-700 transition hover:bg-white/70 hover:text-chrome-950'
}

export function AppShell() {
  const auth = useAuth()

  return (
    <>
      <div className="md:hidden">
        <div className="min-h-screen bg-grain px-6 py-10">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-panel backdrop-blur">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">Unsupported viewport</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">
              Desktop beta only
            </h1>
            <p className="mt-3 text-sm text-chrome-700">
              This console supports full workflow at 1280px and limited workflow at 768px and above.
              Smaller screens are outside the beta boundary.
            </p>
          </div>
        </div>
      </div>

      <div className="hidden min-h-screen bg-grain md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-r border-white/60 bg-chrome-50/70 px-5 py-6 backdrop-blur">
          <div className="space-y-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-ember-500">The Fourth Wall</p>
              <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-chrome-950">
                Route Console
              </h1>
              <p className="mt-2 text-sm text-chrome-700">
                Planning, ops, and customer surfaces in one desktop app. Never flight critical.
              </p>
            </div>

            <nav className="space-y-2">
              {[...sharedLinks, ...(auth.isInternal ? internalLinks : [])].map((link) => (
                <NavLink key={link.to} to={link.to} className={({ isActive }) => linkClass(isActive)}>
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-panel">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Current role map</p>
              <p className="mt-3 text-sm font-medium text-chrome-950">{auth.user?.displayName}</p>
              <p className="mt-1 text-sm text-chrome-600">{auth.user?.email}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {auth.user?.globalRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500"
                  >
                    {role.replaceAll('_', ' ')}
                  </span>
                ))}
                {auth.user?.memberships
                  .filter((membership) => membership.organizationId)
                  .map((membership) => (
                    <span
                      key={membership.membershipId}
                      className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-700"
                    >
                      {membership.role.replaceAll('_', ' ')}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/60 bg-chrome-50/70 px-6 py-4 backdrop-blur">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-chrome-500">Invite-only beta</p>
              <p className="text-sm text-chrome-700">Tablet fallback keeps the rail inside the main column.</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void auth.logout()}>
              Sign out
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
