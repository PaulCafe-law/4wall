import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AuditPage } from '../features/audit/AuditPage'
import { BillingPage } from '../features/billing/BillingPage'
import { InvitePage } from '../features/auth/InvitePage'
import { LoginPage } from '../features/auth/LoginPage'
import { MissionDetailPage } from '../features/missions/MissionDetailPage'
import { MissionsPage } from '../features/missions/MissionsPage'
import { PlannerPage } from '../features/missions/PlannerPage'
import { OrganizationsPage } from '../features/orgs/OrganizationsPage'
import { SitesPage } from '../features/sites/SitesPage'
import { AuthProvider, useAuth } from '../lib/auth'
import { AppShell } from './shell'

const queryClient = new QueryClient()

export function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route element={<RequireAuthenticated />}>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/missions" replace />} />
                <Route path="/sites" element={<SitesPage />} />
                <Route path="/sites/:siteId" element={<SitesPage />} />
                <Route path="/missions" element={<MissionsPage />} />
                <Route path="/missions/new" element={<PlannerPage />} />
                <Route path="/missions/:missionId" element={<MissionDetailPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route
                  path="/organizations"
                  element={
                    <RequireInternal>
                      <OrganizationsPage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/audit"
                  element={
                    <RequireInternal>
                      <AuditPage />
                    </RequireInternal>
                  }
                />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export function RequireAuthenticated() {
  const auth = useAuth()

  if (auth.status === 'restoring') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-grain px-6">
        <div className="rounded-[2rem] border border-white/70 bg-white/80 px-8 py-10 text-center shadow-panel backdrop-blur">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">工作階段還原</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">正在還原工作區</h1>
          <p className="mt-3 text-sm text-chrome-700">
            正在檢查最近一次已驗證的工作階段與角色對應。
          </p>
        </div>
      </div>
    )
  }
  if (auth.status === 'expired') {
    return <Navigate to="/login?expired=1" replace />
  }
  if (auth.status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function RequireInternal({ children }: { children: ReactElement }) {
  const auth = useAuth()

  if (!auth.isInternal) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[1.75rem] border border-red-200 bg-red-50/85 p-8 text-center shadow-panel">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-red-600">角色受限</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">
            需要內部權限
          </h1>
          <p className="mt-3 text-sm text-chrome-700">
            這個頁面僅提供平台營運與稽核流程使用。
          </p>
        </div>
      </div>
    )
  }

  return children
}
