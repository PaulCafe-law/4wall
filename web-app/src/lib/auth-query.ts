import {
  useMutation,
  type MutationKey,
  type QueryKey,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'

import { ApiError } from './api'
import { useAuth } from './auth'

type TokenQueryFn<TData> = (token: string) => Promise<TData>

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
      try {
        return await queryFn(auth.session!.accessToken)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          auth.markExpired()
        }
        throw error
      }
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
      if (!auth.session?.accessToken) {
        auth.markExpired()
        throw new ApiError(401, 'missing_session')
      }
      try {
        return await mutationFn({ token: auth.session.accessToken, payload })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          auth.markExpired()
        }
        throw error
      }
    },
    ...options,
  })
}
