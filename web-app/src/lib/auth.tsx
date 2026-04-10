/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type PropsWithChildren,
} from 'react'

import { api, ApiError, type InviteAcceptPayload, type LoginPayload } from './api'
import type { Role, SessionUser, WebSession } from './types'

export type AuthStatus = 'restoring' | 'anonymous' | 'authenticated' | 'expired'

export interface AuthContextValue {
  status: AuthStatus
  session: WebSession | null
  user: SessionUser | null
  isInternal: boolean
  globalRoles: Role[]
  login: (payload: LoginPayload) => Promise<void>
  acceptInvite: (payload: InviteAcceptPayload) => Promise<void>
  logout: () => Promise<void>
  markExpired: () => void
  canReadOrganization: (organizationId: string) => boolean
  canWriteOrganization: (organizationId: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

function isInternalRole(role: Role): boolean {
  return role === 'platform_admin' || role === 'ops'
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('restoring')
  const [session, setSession] = useState<WebSession | null>(null)

  const restoreSession = useEffectEvent(async () => {
    try {
      const restored = await api.refreshSession()
      startTransition(() => {
        setSession(restored)
        setStatus('authenticated')
      })
    } catch {
      startTransition(() => {
        setSession(null)
        setStatus('anonymous')
      })
    }
  })

  useEffect(() => {
    void restoreSession()
  }, [])

  const applySession = (nextSession: WebSession) => {
    startTransition(() => {
      setSession(nextSession)
      setStatus('authenticated')
    })
  }

  const clearSession = (nextStatus: AuthStatus) => {
    startTransition(() => {
      setSession(null)
      setStatus(nextStatus)
    })
  }

  const login = async (payload: LoginPayload) => {
    const nextSession = await api.login(payload)
    applySession(nextSession)
  }

  const acceptInvite = async (payload: InviteAcceptPayload) => {
    const nextSession = await api.acceptInvite(payload)
    applySession(nextSession)
  }

  const logout = async () => {
    try {
      await api.logout()
    } finally {
      clearSession('anonymous')
    }
  }

  const markExpired = () => {
    clearSession('expired')
  }

  const user = session?.user ?? null
  const globalRoles = user?.globalRoles ?? []
  const isInternal = globalRoles.some(isInternalRole)

  const value: AuthContextValue = {
    status,
    session,
    user,
    isInternal,
    globalRoles,
    login,
    acceptInvite,
    logout,
    markExpired,
    canReadOrganization: (organizationId) => {
      if (!user) {
        return false
      }
      if (user.globalRoles.some(isInternalRole)) {
        return true
      }
      return user.memberships.some(
        (membership) => membership.organizationId === organizationId && membership.isActive,
      )
    },
    canWriteOrganization: (organizationId) => {
      if (!user) {
        return false
      }
      if (user.globalRoles.some(isInternalRole)) {
        return true
      }
      return user.memberships.some(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.isActive &&
          membership.role === 'customer_admin',
      )
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}

export function getReadableOrganizationIds(user: SessionUser | null): string[] {
  if (!user) {
    return []
  }
  return user.memberships
    .filter((membership) => membership.organizationId && membership.isActive)
    .map((membership) => membership.organizationId as string)
}

export function getWritableOrganizationIds(user: SessionUser | null): string[] {
  if (!user) {
    return []
  }
  return user.memberships
    .filter(
      (membership) =>
        membership.organizationId && membership.isActive && membership.role === 'customer_admin',
    )
    .map((membership) => membership.organizationId as string)
}

export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}
