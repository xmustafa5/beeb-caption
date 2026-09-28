import type { AppLanguage } from '@/i18n/languages'
import { createPushRegistrar, pushLanguage, type PushRegistrarDeps } from './push-registration'

type MockDeps = jest.Mocked<PushRegistrarDeps>
type RegisterArgs = [deviceToken: string, language: AppLanguage | undefined]

function setup(overrides: Partial<MockDeps> = {}) {
  const deps: MockDeps = {
    canUsePush: jest.fn(() => true),
    ensurePermission: jest.fn<Promise<boolean>, [mayPrompt: boolean]>(async () => true),
    getDeviceToken: jest.fn(async () => 'fcm-1'),
    register: jest.fn<Promise<boolean>, RegisterArgs>(async () => true),
    clear: jest.fn<Promise<void>, [endedSession: string]>(async () => {}),
    ...overrides,
  }
  return { deps, registrar: createPushRegistrar(deps) }
}

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
})
