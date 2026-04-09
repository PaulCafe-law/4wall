import { api } from './api'
import { getReadableOrganizationIds, getWritableOrganizationIds, useAuth } from './auth'
import { useAuthedQuery } from './auth-query'

interface OrganizationChoice {
  organizationId: string
  name: string
}

export function useOrganizationChoices(mode: 'read' | 'write' = 'read') {
  const auth = useAuth()
  const internalOrganizations = useAuthedQuery({
    queryKey: ['organizations', 'choices', mode],
    queryFn: api.listOrganizations,
    enabled: auth.isInternal,
    staleTime: 30_000,
  })

  const membershipIds =
    mode === 'write' ? getWritableOrganizationIds(auth.user) : getReadableOrganizationIds(auth.user)

  const choices: OrganizationChoice[] = auth.isInternal
    ? (internalOrganizations.data ?? []).map((organization) => ({
        organizationId: organization.organizationId,
        name: organization.name,
      }))
    : membershipIds.map((organizationId, index) => ({
        organizationId,
        name: membershipIds.length === 1 ? 'Current organization' : `Organization ${index + 1}`,
      }))

  return {
    choices,
    isLoading: auth.isInternal ? internalOrganizations.isLoading : false,
  }
}
