import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactElement } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'

import { AppShell } from './shell'
import { AttributionWorkbenchPage } from '../features/attribution/AttributionWorkbenchPage'
import { AuditPage } from '../features/audit/AuditPage'
import { InvitePage } from '../features/auth/InvitePage'
import { LineAccountLinkPage } from '../features/auth/LineAccountLinkPage'
import { LoginPage } from '../features/auth/LoginPage'
import { BillingPage } from '../features/billing/BillingPage'
import { CamerasPage } from '../features/cameras/CamerasPage'
import { ControlPlanePage } from '../features/controlplane/ControlPlanePage'
import { DemoFactoryPage, FactoryTwinPage } from '../features/factory-twin/FactoryTwinPage'
import { IncidentCenterPage } from '../features/incidents/IncidentCenterPage'
import { IncidentDetailPage } from '../features/incidents/IncidentDetailPage'
import { IndustrialDataEnginePage } from '../features/industrial-data-engine/IndustrialDataEnginePage'
import { LineFloorplanMobilePage } from '../features/line-floorplan-mobile/LineFloorplanMobilePage'
import { LiveOpsPage } from '../features/liveops/LiveOpsPage'
import { MissionDetailPage } from '../features/missions/MissionDetailPage'
import { MissionsPage } from '../features/missions/MissionsPage'
import { PlannerPage } from '../features/missions/PlannerPage'
import { OrganizationsPage } from '../features/orgs/OrganizationsPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { SiteMapPage } from '../features/site-map/SiteMapPage'
import { SitesPage } from '../features/sites/SitesPage'
import { SupportPage } from '../features/support/SupportPage'
import { SystemStatusPage } from '../features/system-status/SystemStatusPage'
import { AuthProvider, isFactoryOpsCustomer, useAuth } from '../lib/auth'

const queryClient = new QueryClient()

// Loaded on demand so the official site's CSS and motion chunks stay out of the
// platform shell. www.4wall.io itself is served by the prerendered official entry.
const LazyOfficialSitePage = lazy(() =>
  import('../features/official/OfficialSitePage').then((module) => ({ default: module.OfficialSitePage })),
)

function OfficialSitePage(props: { locale?: 'zh' | 'en'; basePath?: '' | '/official' }) {
  return (
    <Suspense fallback={null}>
      <LazyOfficialSitePage {...props} />
    </Suspense>
  )
}

export function AppRoutes({ hostname = window.location.hostname }: { hostname?: string } = {}) {
  const isPlatformHost = hostname === 'platform.4wall.io'
  const isOfficialHost = hostname === 'www.4wall.io' || hostname === '4wall.io'

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {isPlatformHost && <Route path="/" element={<PlatformHome />} />}
            {isOfficialHost && <Route path="/" element={<OfficialSitePage />} />}
            {isOfficialHost && <Route path="/en" element={<OfficialSitePage locale="en" />} />}
            <Route path="/login" element={isPlatformHost ? <PlatformLoginAlias /> : <LoginPage />} />
            <Route path="/line/link" element={<LineAccountLinkPage />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route path="/official" element={isOfficialHost ? <OfficialAlias pathname="/" /> : <OfficialSitePage basePath="/official" />} />
            <Route path="/official/en" element={isOfficialHost ? <OfficialAlias pathname="/en" /> : <OfficialSitePage locale="en" basePath="/official" />} />
            <Route path="/m/floorplan/:siteSlug" element={<LineFloorplanMobilePage />} />
            <Route element={<RequireAuthenticated />}>
              <Route element={<AppShell />}>
                {!isPlatformHost && !isOfficialHost && <Route index element={<AuthenticatedHome />} />}
                <Route
                  path="/overview"
                  element={
                    <RequireBuildingRoute>
                      <OverviewPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/sites"
                  element={
                    <RequireBuildingRoute>
                      <SitesPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/sites/:siteId"
                  element={
                    <RequireBuildingRoute>
                      <SitesPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route path="/cameras" element={<CamerasPage />} />
                <Route path="/factory-twin" element={<FactoryTwinPage />} />
                <Route
                  path="/demo-factory"
                  element={
                    <RequireInternal>
                      <DemoFactoryPage />
                    </RequireInternal>
                  }
                />
                <Route path="/system-status" element={<SystemStatusPage />} />
                <Route
                  path="/site-map"
                  element={
                    <RequireBuildingRoute>
                      <SiteMapPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/missions"
                  element={
                    <RequireBuildingRoute>
                      <MissionsPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/missions/new"
                  element={
                    <RequireBuildingRoute>
                      <PlannerPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/missions/:missionId"
                  element={
                    <RequireBuildingRoute>
                      <MissionDetailPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route path="/incidents" element={<IncidentCenterPage />} />
                <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
                <Route
                  path="/attribution"
                  element={
                    <RequireInternal>
                      <AttributionWorkbenchPage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/industrial-data-engine"
                  element={
                    <RequireBuildingRoute>
                      <IndustrialDataEnginePage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/billing"
                  element={
                    <RequireBuildingRoute>
                      <BillingPage />
                    </RequireBuildingRoute>
                  }
                />
                <Route
                  path="/control-plane"
                  element={
                    <RequireInternal>
                      <ControlPlanePage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/control-plane/routes"
                  element={
                    <RequireInternal>
                      <ControlPlanePage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/control-plane/templates"
                  element={
                    <RequireInternal>
                      <ControlPlanePage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/control-plane/schedules"
                  element={
                    <RequireInternal>
                      <ControlPlanePage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/control-plane/dispatch"
                  element={
                    <RequireInternal>
                      <ControlPlanePage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/live-ops"
                  element={
                    <RequireInternal>
                      <LiveOpsPage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/organizations"
                  element={
                    <RequireInternal>
                      <OrganizationsPage />
                    </RequireInternal>
                  }
                />
                <Route
                  path="/support"
                  element={
                    <RequireInternal>
                      <SupportPage />
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

function PlatformLoginAlias() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/', search: location.search, hash: location.hash }} replace />
}

function OfficialAlias({ pathname }: { pathname: '/' | '/en' }) {
  const location = useLocation()
  return <Navigate to={{ pathname, search: location.search, hash: location.hash }} replace />
}

function PlatformHome() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()

  if (auth.status === 'restoring') {
    return <SessionRestoring />
  }

  if (auth.status === 'authenticated' && searchParams.get('lineLink') !== '1') {
    return <AuthenticatedHome />
  }

  return <LoginPage />
}

function SessionRestoring() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grain px-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/80 px-8 py-10 text-center shadow-panel backdrop-blur">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember-500">Session</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">正在恢復登入狀態</h1>
        <p className="mt-3 text-sm text-chrome-700">系統正在確認 access token 與 refresh cookie。</p>
      </div>
    </div>
  )
}

export function RequireAuthenticated() {
  const auth = useAuth()

  if (auth.status === 'restoring') {
    return <SessionRestoring />
  }

  if (auth.status === 'expired') {
    return <Navigate to="/login?expired=1" replace />
  }

  if (auth.status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function AuthenticatedHome() {
  const auth = useAuth()
  return <Navigate to={isFactoryOpsCustomer(auth.user) ? '/factory-twin' : '/overview'} replace />
}

function RequireBuildingRoute({ children }: { children: ReactElement }) {
  const auth = useAuth()
  if (isFactoryOpsCustomer(auth.user)) {
    return <Navigate to="/factory-twin" replace />
  }
  return children
}

export function RequireInternal({ children }: { children: ReactElement }) {
  const auth = useAuth()

  if (!auth.isInternal) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[1.75rem] border border-red-200 bg-red-50/85 p-8 text-center shadow-panel">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-red-600">Access Denied</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-chrome-950">
            這個頁面僅提供 internal 使用
          </h1>
          <p className="mt-3 text-sm text-chrome-700">
            請使用具備 platform_admin 或 ops 權限的帳號登入。
          </p>
        </div>
      </div>
    )
  }

  return children
}
