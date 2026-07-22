import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('camera latest-frame delivery', () => {
  it('downloads a short-lived signed frame without sending credentials to object storage', async () => {
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            frameId: 'frame-1',
            capturedAt: '2026-07-22T12:00:00Z',
            contentType: 'image/jpeg',
            imageUrl: 'https://frames.example.test/latest.jpg?X-Amz-Signature=test',
            expiresAt: '2026-07-22T12:01:30Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(jpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.fetchCameraLatestFrameBlob('web-token', 'camera-1')

    expect(result.type).toBe('image/jpeg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/cameras/camera-1/latest-frame/manifest')
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://frames.example.test/latest.jpg?X-Amz-Signature=test',
      { cache: 'no-store', credentials: 'omit' },
    ])
  })

  it('keeps the authenticated proxy fallback for local-file storage', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            frameId: 'frame-local',
            capturedAt: '2026-07-22T12:00:00Z',
            contentType: 'image/jpeg',
            imageUrl: null,
            expiresAt: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(new Blob(['jpeg'], { type: 'image/jpeg' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await api.fetchCameraLatestFrameBlob('web-token', 'camera-local')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1/cameras/camera-local/latest-frame/image')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      credentials: 'include',
      headers: { Authorization: 'Bearer web-token' },
    })
  })

  it('falls back to the authenticated proxy when direct object storage is unavailable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            frameId: 'frame-remote',
            capturedAt: '2026-07-22T12:00:00Z',
            contentType: 'image/jpeg',
            imageUrl: 'https://frames.example.test/unavailable.jpg?X-Amz-Signature=test',
            expiresAt: '2026-07-22T12:01:30Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(new Blob(['jpeg'], { type: 'image/jpeg' }), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.fetchCameraLatestFrameBlob('web-token', 'camera-remote')

    expect(result.type).toBe('image/jpeg')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[2][0])).toContain('/v1/cameras/camera-remote/latest-frame/image')
  })
})
