import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { clearFcmToken, registerFcmToken } from './push'

jest.mock('@/lib/api', () => ({ api: { post: jest.fn() } }))

const post = api.post as jest.Mock

function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('request failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  })
}

afterEach(() => post.mockReset())

describe('registerFcmToken', () => {
  it('sends the app language with the token', async () => {
    post.mockResolvedValue({ status: 204 })
    await expect(registerFcmToken('fcm-1', 'ckb')).resolves.toBe(true)
    expect(post).toHaveBeenCalledWith('/api/me/fcm-token', { fcm_token: 'fcm-1', language: 'ckb' })
  })

  it('sends the token alone when there is no language (the stored one is kept)', async () => {
    post.mockResolvedValue({ status: 204 })
    await registerFcmToken('fcm-1')
    expect(post).toHaveBeenCalledWith('/api/me/fcm-token', { fcm_token: 'fcm-1' })
  })

  it('still registers the token when the backend refuses the language', async () => {
    post.mockRejectedValueOnce(httpError(400, { error: 'invalid_language' })).mockResolvedValueOnce({ status: 204 })
    await expect(registerFcmToken('fcm-1', 'ckb')).resolves.toBe(true)
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ fcm_token: 'fcm-1', language: 'ckb' }, { fcm_token: 'fcm-1' }])
  })

  it('reports a failure without throwing, and does not retry other errors', async () => {
    post.mockRejectedValue(httpError(500, { error: 'internal' }))
    await expect(registerFcmToken('fcm-1', 'ar')).resolves.toBe(false)
    post.mockRejectedValue(new Error('Network Error'))
    await expect(registerFcmToken('fcm-1', 'ar')).resolves.toBe(false)
    expect(post).toHaveBeenCalledTimes(2)
  })
})

describe('clearFcmToken', () => {
  it("clears with the ended session's JWT (the store no longer has it)", async () => {
    post.mockResolvedValue({ status: 204 })
    await clearFcmToken('jwt-a')
    expect(post).toHaveBeenCalledWith(
      '/api/me/fcm-token',
      { fcm_token: null },
      { headers: { Authorization: 'Bearer jwt-a' } },
    )
  })

  it('never throws', async () => {
    post.mockRejectedValue(httpError(401, ''))
    await expect(clearFcmToken('jwt-a')).resolves.toBeUndefined()
  })
})
