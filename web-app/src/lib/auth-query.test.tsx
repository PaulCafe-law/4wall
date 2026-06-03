import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { ApiError } from './api'
import { useAuthedMutation, useAuthedQuery } from './auth-query'
import { createAuthValue, createSession, renderWithProviders } from '../test/utils'

function QueryProbe({ queryFn }: { queryFn: (token: string) => Promise<string> }) {
  const query = useAuthedQuery({
    queryKey: ['auth-query-refresh-probe'],
    queryFn,
  })

  if (query.isLoading) return <div>loading</div>
  if (query.isError) return <div>error</div>
  return <div>{query.data}</div>
}

function MutationProbe({ mutationFn }: { mutationFn: (token: string) => Promise<string> }) {
  const mutation = useAuthedMutation({
    mutationKey: ['auth-mutation-refresh-probe'],
    mutationFn: ({ token }) => mutationFn(token),
  })

  return (
    <div>
      <button onClick={() => mutation.mutate(undefined)}>save</button>
      <span>{mutation.data ?? mutation.error?.detail ?? 'idle'}</span>
    </div>
  )
}

describe('authenticated query helpers', () => {
  it('refreshes the web session and retries a query once after an expired access token', async () => {
    const refreshedSession = createSession()
    refreshedSession.accessToken = 'fresh-token'
    const refreshSession = vi.fn(async () => refreshedSession)
    const queryFn = vi.fn(async (token: string) => {
      if (token === 'test-token') {
        throw new ApiError(401, 'token_expired')
      }
      return `ok:${token}`
    })

    renderWithProviders(<QueryProbe queryFn={queryFn} />, {
      auth: createAuthValue({ refreshSession }),
    })

    expect(await screen.findByText('ok:fresh-token')).toBeInTheDocument()
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(queryFn).toHaveBeenNthCalledWith(1, 'test-token')
    expect(queryFn).toHaveBeenNthCalledWith(2, 'fresh-token')
  })

  it('refreshes the web session and retries a mutation once after an expired access token', async () => {
    const refreshedSession = createSession()
    refreshedSession.accessToken = 'fresh-token'
    const refreshSession = vi.fn(async () => refreshedSession)
    const mutationFn = vi.fn(async (token: string) => {
      if (token === 'test-token') {
        throw new ApiError(401, 'token_expired')
      }
      return `saved:${token}`
    })

    renderWithProviders(<MutationProbe mutationFn={mutationFn} />, {
      auth: createAuthValue({ refreshSession }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(screen.getByText('saved:fresh-token')).toBeInTheDocument())
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(mutationFn).toHaveBeenNthCalledWith(1, 'test-token')
    expect(mutationFn).toHaveBeenNthCalledWith(2, 'fresh-token')
  })
})
