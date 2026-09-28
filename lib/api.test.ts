import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/auth-store'
import type { Captain } from '@/lib/captain-mappers'
import { api } from './api'

// Every request here is answered by this adapter instead of the network, so the
// real interceptors run on a real 401.
function answerWith(status: number, data: unknown = '') {
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('request failed', 'ERR_BAD_REQUEST', config, null, {
      status,
      statusText: '',
      headers: {},
      config,
      data,
    })
  }
}

const CAPTAIN = { id: 'captain-b', status: 'approved' } as unknown as Captain

function signIn(token: string) {
  useAuthStore.getState().setSession(token, CAPTAIN)
}

const originalAdapter = api.defaults.adapter
let log: jest.SpyInstance
beforeEach(() => {
  log = jest.spyOn(console, 'log').mockImplementation(() => {}) // the dev network logger
})
afterEach(() => {
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().clear()
  log.mockRestore()
})

describe('401 handling', () => {
  it("signs out when the current session's JWT is refused", async () => {
    signIn('jwt-b')
    answerWith(401)
    await expect(api.get('/api/captain/trips')).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState().token).toBeNull()
  })

  it("keeps the signed-in captain when an ended session's JWT is refused (the logout push-token clear)", async () => {
    signIn('jwt-b')
    answerWith(401)
    await expect(
      api.post('/api/me/fcm-token', { fcm_token: null }, { headers: { Authorization: 'Bearer jwt-a' } }),
    ).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState().token).toBe('jwt-b')
  })

  it('keeps the session on a wrong-password 401', async () => {
    signIn('jwt-b')
    answerWith(401, { error: 'wrong_password' })
    await expect(api.delete('/api/captain/me', { data: { password: 'x' } })).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState().token).toBe('jwt-b')
  })

  it('leaves a pending registration alone when a request with some other JWT is refused', async () => {
    useAuthStore.getState().setPending('captain-c')
    answerWith(401)
    await expect(
      api.post('/api/me/fcm-token', { fcm_token: null }, { headers: { Authorization: 'Bearer jwt-a' } }),
    ).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState().pendingCaptainId).toBe('captain-c')
  })

  it('ignores other statuses', async () => {
    signIn('jwt-b')
    answerWith(403)
    await expect(api.get('/api/captain/trips')).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState().token).toBe('jwt-b')
  })
})

// Keeps the helper's header type honest (AxiosHeaders, not a plain object).
it('attaches the stored JWT when a request carries none', async () => {
  signIn('jwt-b')
  let sent: unknown
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    sent = AxiosHeaders.from(config.headers).get('Authorization')
    return { status: 204, statusText: '', headers: {}, config, data: '' }
  }
  await api.get('/api/captain/trips')
  expect(sent).toBe('Bearer jwt-b')
})
