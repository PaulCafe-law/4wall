import { act } from '@testing-library/react'
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { OfficialSitePage } from './OfficialSitePage'

// www.4wall.io hydrates the prerendered HTML; any mismatch would make React
// throw the server markup away and flash the page.
describe('OfficialSitePage hydration', () => {
  it.each(['zh', 'en'] as const)('hydrates the %s server markup without mismatches', async (locale) => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(createElement(OfficialSitePage, { locale }))
    document.body.appendChild(container)
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args)
    })
    const recoverable: unknown[] = []

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, createElement(OfficialSitePage, { locale }), {
        onRecoverableError: (error) => recoverable.push(error),
      })
    })

    expect(recoverable).toEqual([])
    expect(errors).toEqual([])
    spy.mockRestore()
    await act(async () => root?.unmount())
    container.remove()
  })
})
