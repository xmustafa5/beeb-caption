import type { AppLanguage } from '@/i18n/languages'
import {
  createPushRegistrar,
  pushLanguage,
  sessionAccount,
  PUSH_RETRY_DELAYS_MS,
  type PushRegistrarDeps,
} from './push-registration'

type MockDeps = jest.Mocked<PushRegistrarDeps>
type RegisterArgs = [deviceToken: string, language: AppLanguage | undefined]
type ClearArgs = [endedSession: string]

function setup(overrides: Partial<MockDeps> = {}) {
  const deps: MockDeps = {
    canUsePush: jest.fn(() => true),
    ensurePermission: jest.fn<Promise<boolean>, [mayPrompt: boolean]>(async () => true),
    getDeviceToken: jest.fn(async () => 'fcm-1'),
    register: jest.fn<Promise<boolean>, RegisterArgs>(async () => true),
    clear: jest.fn<Promise<boolean>, ClearArgs>(async () => true),
    ...overrides,
  }
  return { deps, registrar: createPushRegistrar(deps) }
}

/** A JWT shaped like the backend's: `sub` is the captain id. Signature not checked. */
function jwt(sub: string, issuedAt = 1): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, role: 'captain', iat: issuedAt })}.sig`
}

const CAPTAIN_A = '6f1c2a4e-0000-4000-8000-00000000000a'
const CAPTAIN_B = '6f1c2a4e-0000-4000-8000-00000000000b'

// Real setImmediate (the tests flush with it); fake setTimeout (the retry timer).
beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }))
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('sessionAccount', () => {
  it("reads the captain id out of the session's JWT", () => {
    expect(sessionAccount(jwt(CAPTAIN_A))).toBe(CAPTAIN_A)
  })

  it('is null for anything it cannot read', () => {
    expect(sessionAccount('jwt-a')).toBeNull()
    expect(sessionAccount('a.%%%.c')).toBeNull()
    expect(sessionAccount(`x.${Buffer.from('{"role":"captain"}').toString('base64url')}.y`)).toBeNull()
  })
})

describe('pushLanguage', () => {
  it('passes the three app languages through', () => {
    expect(pushLanguage('ar')).toBe('ar')
    expect(pushLanguage('ckb')).toBe('ckb')
    expect(pushLanguage('en')).toBe('en')
  })

  it('sends nothing (keep the stored value) for anything the backend would refuse', () => {
    expect(pushLanguage('ku')).toBeUndefined()
    expect(pushLanguage('en-US')).toBeUndefined()
    expect(pushLanguage('')).toBeUndefined()
    expect(pushLanguage(undefined)).toBeUndefined()
    expect(pushLanguage(null)).toBeUndefined()
  })
})

describe('createPushRegistrar', () => {
  it('registers the token with the app language on sign-in', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: 'jwt-a', language: 'ckb' })
    expect(deps.register).toHaveBeenCalledTimes(1)
    expect(deps.register).toHaveBeenCalledWith('fcm-1', 'ckb')
  })

  it('does not re-send while nothing changed (re-renders, foregrounds)', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    await registrar.retry()
    expect(deps.register).toHaveBeenCalledTimes(1)
  })

  it('reports a live language switch (Arabic to Kurdish) with the same token', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    await registrar.sync({ session: 'jwt-a', language: 'ckb' })
    expect(deps.register.mock.calls).toEqual([
      ['fcm-1', 'ar'],
      ['fcm-1', 'ckb'],
    ])
  })

  it('reports again on the launch after the RTL restart', async () => {
    // The switch to English: the report before the restart may be cut off by it.
    const before = setup({ register: jest.fn<Promise<boolean>, RegisterArgs>(async () => false) })
    await before.registrar.sync({ session: 'jwt-a', language: 'en' })
    // The app restarts: a fresh registrar (module state is gone) on the same session.
    const after = setup()
    await after.registrar.sync({ session: 'jwt-a', language: 'en' })
    expect(after.deps.register).toHaveBeenCalledWith('fcm-1', 'en')
  })

  it('retries a report that failed when the app comes back', async () => {
    const register = jest.fn<Promise<boolean>, RegisterArgs>(async () => false)
    const { deps, registrar } = setup({ register })
    await registrar.sync({ session: 'jwt-a', language: 'ckb' })
    register.mockResolvedValue(true)
    await registrar.retry()
    await registrar.retry()
    expect(deps.register).toHaveBeenCalledTimes(2)
    expect(deps.register).toHaveBeenLastCalledWith('fcm-1', 'ckb')
  })

  it('keeps a no-Firebase build quiet and retries later', async () => {
    const getDeviceToken = jest.fn(async (): Promise<string> => {
      throw new Error('no firebase')
    })
    const { deps, registrar } = setup({ getDeviceToken })
    await expect(registrar.sync({ session: 'jwt-a', language: 'ar' })).resolves.toBeUndefined()
    expect(deps.register).not.toHaveBeenCalled()
    getDeviceToken.mockResolvedValue('fcm-2')
    await registrar.retry()
    expect(deps.register).toHaveBeenCalledWith('fcm-2', 'ar')
  })

  it('omits an unsupported language instead of sending it', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: 'jwt-a', language: 'fr' })
    expect(deps.register).toHaveBeenCalledWith('fcm-1', undefined)
  })

  it('does nothing on a simulator', async () => {
    const { deps, registrar } = setup({ canUsePush: jest.fn(() => false) })
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    expect(deps.ensurePermission).not.toHaveBeenCalled()
    expect(deps.register).not.toHaveBeenCalled()
  })

  it('asks for permission once per session, not on every language switch', async () => {
    const ensurePermission = jest.fn<Promise<boolean>, [mayPrompt: boolean]>(async () => false)
    const { deps, registrar } = setup({ ensurePermission })
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    await registrar.sync({ session: 'jwt-a', language: 'ckb' })
    expect(ensurePermission.mock.calls).toEqual([[true], [false]])
    expect(deps.register).not.toHaveBeenCalled()
    await registrar.sync({ session: 'jwt-b', language: 'ckb' })
    expect(ensurePermission).toHaveBeenLastCalledWith(true)
  })

  it('clears the ended session on logout, once', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    await registrar.sync({ session: null, language: 'ar' })
    await registrar.sync({ session: null, language: 'ckb' })
    expect(deps.clear).toHaveBeenCalledTimes(1)
    expect(deps.clear).toHaveBeenCalledWith('jwt-a')
  })

  it('has nothing to clear when this run never registered', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: null, language: 'ar' })
    expect(deps.clear).not.toHaveBeenCalled()
  })

  it('registers the next session after a logout', async () => {
    const { deps, registrar } = setup()
    await registrar.sync({ session: 'jwt-a', language: 'ar' })
    await registrar.sync({ session: null, language: 'ar' })
    await registrar.sync({ session: 'jwt-b', language: 'ar' })
    expect(deps.register).toHaveBeenCalledTimes(2)
  })

  it('runs one call at a time and ends on the latest language', async () => {
    let release: (ok: boolean) => void = () => {}
    const register = jest.fn<Promise<boolean>, RegisterArgs>(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve
        }),
    )
    const { registrar } = setup({ register })
    const first = registrar.sync({ session: 'jwt-a', language: 'ar' })
    await Promise.resolve()
    await new Promise((r) => setImmediate(r))
    // Two switches while the first report is still in flight.
    void registrar.sync({ session: 'jwt-a', language: 'en' })
    void registrar.sync({ session: 'jwt-a', language: 'ckb' })
    expect(register).toHaveBeenCalledTimes(1)
    release(true)
    await new Promise((r) => setImmediate(r))
    release(true)
    await first
    expect(register.mock.calls.map((c) => c[1])).toEqual(['ar', 'ckb'])
  })
  describe('the logout clear', () => {
    it('keeps a clear that did not land and retries it at the next foreground', async () => {
      const clear = jest.fn<Promise<boolean>, ClearArgs>(async () => false)
      const { deps, registrar } = setup({ clear })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await registrar.sync({ session: null, language: 'ar' }) // logout while offline
      clear.mockResolvedValue(true)
      await registrar.retry()
      await registrar.retry()
      expect(deps.clear.mock.calls).toEqual([[jwt(CAPTAIN_A)], [jwt(CAPTAIN_A)]])
    })

    it('retries a failed clear on the slow timer while the app stays open', async () => {
      const clear = jest.fn<Promise<boolean>, ClearArgs>(async () => false)
      const { deps, registrar } = setup({ clear })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await registrar.sync({ session: null, language: 'ar' })
      expect(deps.clear).toHaveBeenCalledTimes(1)
      clear.mockResolvedValue(true)
      await jest.advanceTimersByTimeAsync(PUSH_RETRY_DELAYS_MS[0])
      expect(deps.clear).toHaveBeenCalledTimes(2)
      await jest.advanceTimersByTimeAsync(10 * 60_000) // landed: no more tries
      expect(deps.clear).toHaveBeenCalledTimes(2)
    })

    it('treats a clear that throws like one that did not land', async () => {
      const clear = jest.fn<Promise<boolean>, ClearArgs>(async () => {
        throw new Error('boom')
      })
      const { deps, registrar } = setup({ clear })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await registrar.sync({ session: null, language: 'ar' })
      clear.mockResolvedValue(true)
      await registrar.retry()
      expect(deps.clear).toHaveBeenCalledTimes(2)
    })

    it("retries the previous captain's clear before the next captain registers", async () => {
      const calls: string[] = []
      let tries = 0
      const clear = jest.fn<Promise<boolean>, ClearArgs>(async (s) => {
        calls.push(`clear ${sessionAccount(s)}`)
        tries += 1
        return tries > 1 // the first try (at logout) fails
      })
      const register = jest.fn<Promise<boolean>, RegisterArgs>(async () => {
        calls.push('register')
        return true
      })
      const { registrar } = setup({ clear, register })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await registrar.sync({ session: null, language: 'ar' })
      await registrar.sync({ session: jwt(CAPTAIN_B), language: 'ar' })
      expect(calls).toEqual(['register', `clear ${CAPTAIN_A}`, `clear ${CAPTAIN_A}`, 'register'])
    })

    it('still registers the next captain when the old clear fails again, and keeps retrying it', async () => {
      const clear = jest.fn<Promise<boolean>, ClearArgs>(async () => false)
      const { deps, registrar } = setup({ clear })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await registrar.sync({ session: null, language: 'ar' })
      await registrar.sync({ session: jwt(CAPTAIN_B), language: 'ckb' })
      expect(deps.register).toHaveBeenLastCalledWith('fcm-1', 'ckb')
      clear.mockResolvedValue(true)
      await registrar.retry()
      expect(deps.clear).toHaveBeenCalledTimes(3)
      expect(deps.clear).toHaveBeenLastCalledWith(jwt(CAPTAIN_A))
      expect(deps.register).toHaveBeenCalledTimes(2) // B's report stands; nothing re-sent
    })

    it('drops the clear when the same captain signs back in (it would wipe their new registration)', async () => {
      const clear = jest.fn<Promise<boolean>, ClearArgs>(async () => false)
      const { deps, registrar } = setup({ clear })
      await registrar.sync({ session: jwt(CAPTAIN_A, 1), language: 'ar' })
      await registrar.sync({ session: null, language: 'ar' })
      await registrar.sync({ session: jwt(CAPTAIN_A, 2), language: 'ar' })
      await registrar.retry()
      await jest.advanceTimersByTimeAsync(10 * 60_000)
      expect(deps.clear).toHaveBeenCalledTimes(1)
      expect(deps.register).toHaveBeenCalledTimes(2)
    })

    it('clears the ended captain when logout and the next sign-in land during a registration', async () => {
      let release: (ok: boolean) => void = () => {}
      const register = jest.fn<Promise<boolean>, RegisterArgs>()
      register.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve
          }),
      )
      register.mockResolvedValue(true)
      const { deps, registrar } = setup({ register })
      const first = registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await new Promise((r) => setImmediate(r))
      // Logout, then another captain signs in, before register(A) returns.
      void registrar.sync({ session: null, language: 'ar' })
      void registrar.sync({ session: jwt(CAPTAIN_B), language: 'ar' })
      release(true)
      await first
      expect(deps.clear).toHaveBeenCalledWith(jwt(CAPTAIN_A))
      expect(register).toHaveBeenCalledTimes(2)
    })
  })

  describe('the retry timer', () => {
    it('retries a report that did not land without waiting for a foreground, backing off', async () => {
      const register = jest.fn<Promise<boolean>, RegisterArgs>(async () => false)
      const { registrar } = setup({ register })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ckb' })
      expect(register).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(PUSH_RETRY_DELAYS_MS[0] - 1)
      expect(register).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(1)
      expect(register).toHaveBeenCalledTimes(2)
      await jest.advanceTimersByTimeAsync(PUSH_RETRY_DELAYS_MS[1])
      expect(register).toHaveBeenCalledTimes(3)
      register.mockResolvedValue(true)
      await jest.advanceTimersByTimeAsync(PUSH_RETRY_DELAYS_MS[2])
      expect(register).toHaveBeenCalledTimes(4)
      expect(register).toHaveBeenLastCalledWith('fcm-1', 'ckb')
      await jest.advanceTimersByTimeAsync(60 * 60_000)
      expect(register).toHaveBeenCalledTimes(4)
    })

    it('retries a device token that could not be fetched (offline at launch)', async () => {
      const getDeviceToken = jest.fn(async (): Promise<string> => {
        throw new Error('SERVICE_NOT_AVAILABLE')
      })
      const { deps, registrar } = setup({ getDeviceToken })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      getDeviceToken.mockResolvedValue('fcm-2')
      await jest.advanceTimersByTimeAsync(PUSH_RETRY_DELAYS_MS[0])
      expect(deps.register).toHaveBeenCalledWith('fcm-2', 'ar')
    })

    it('a foreground retry replaces the pending timer instead of doubling it', async () => {
      const register = jest.fn<Promise<boolean>, RegisterArgs>(async () => false)
      const { registrar } = setup({ register })
      await registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      register.mockResolvedValue(true)
      await registrar.retry()
      await jest.advanceTimersByTimeAsync(60 * 60_000)
      expect(register).toHaveBeenCalledTimes(2)
    })

    it('does not poll when notifications are off or on a simulator', async () => {
      const ensurePermission = jest.fn<Promise<boolean>, [mayPrompt: boolean]>(async () => false)
      const denied = setup({ ensurePermission })
      await denied.registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      const simulator = setup({ canUsePush: jest.fn(() => false) })
      await simulator.registrar.sync({ session: jwt(CAPTAIN_A), language: 'ar' })
      await jest.advanceTimersByTimeAsync(60 * 60_000)
      expect(ensurePermission).toHaveBeenCalledTimes(1)
      expect(simulator.deps.canUsePush).toHaveBeenCalledTimes(1)
    })
  })
})
