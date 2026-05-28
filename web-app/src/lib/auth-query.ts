import {
  useMutation,
  type MutationKey,
  type QueryKey,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'

import { ApiError } from './api'
import { type AuthContextValue, useAuth } from './auth'

type TokenQueryFn<TData> = (token: string) => Promise<TData>

async function withSessionRefresh<TData>(
  auth: AuthContextValue,
  operation: (token: string) => Promise<TData>,
): Promise<TData> {
  if (!auth.session?.accessToken) {
    try {
      const refreshed = await auth.refreshSession()
      return await operation(refreshed.accessToken)
    } catch (error) {
      auth.markExpired()
      throw error instanceof ApiError ? error : new ApiError(401, 'missing_session')
    }
  }

  try {
    return await operation(auth.session.accessToken)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error
    }
    try {
      const refreshed = await auth.refreshSession()
      return await operation(refreshed.accessToken)
    } catch (retryError) {
      auth.markExpired()
      throw retryError
    }
  }
}

export function useAuthedQuery<TData>({
  queryKey,
  queryFn,
  enabled = true,
  ...options
}: Omit<UseQueryOptions<TData, ApiError, TData, QueryKey>, 'queryKey' | 'queryFn'> & {
  queryKey: QueryKey
  queryFn: TokenQueryFn<TData>
}) {
  const auth = useAuth()

  return useQuery<TData, ApiError>({
    queryKey,
    enabled: enabled && auth.status === 'authenticated' && Boolean(auth.session?.accessToken),
    queryFn: async () => {
      return withSessionRefresh(auth, queryFn)
    },
    ...options,
  })
}

type TokenMutationFn<TData, TVariables> = (variables: {
  token: string
  payload: TVariables
}) => Promise<TData>

export function useAuthedMutation<TData, TVariables>({
  mutationKey,
  mutationFn,
  ...options
}: Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  'mutationFn' | 'mutationKey'
> & {
  mutationKey?: MutationKey
  mutationFn: TokenMutationFn<TData, TVariables>
}) {
  const auth = useAuth()

  return useMutation<TData, ApiError, TVariables>({
    mutationKey,
    mutationFn: async (payload) => {
      return withSessionRefresh(auth, (token) => mutationFn({ token, payload }))
    },
    ...options,
  })
}
