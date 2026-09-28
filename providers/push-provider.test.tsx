import { act, type ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { registerFcmToken } from '@/services/push'
import { useAuthStore } from '@/store/auth-store'
import type { Captain } from '@/lib/captain-mappers'
import { PushProvider } from './push-provider'

// The wiring that reports a language switch: useTranslation re-renders the
// provider on `languageChanged`, its effect runs, and the registrar sends the
// new language. Only the device, the network and navigation are faked.

jest.mock('@/i18n', () => {
  const { createInstance } = jest.requireActual('i18next')
  const { initReactI18next } = jest.requireActual('react-i18next')
  const instance = createInstance()
  instance.use(initReactI18next).init({ lng: 'ar', resources: {}, initImmediate: false, showSupportNotice: false })
  return { __esModule: true, default: instance }
})
jest.mock('expo-device', () => ({ isDevice: true }))
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'android', data: 'fcm-device' })),
  setNotificationChannelAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  AndroidImportance: { HIGH: 4, MAX: 5 },
}))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }) }))
jest.mock('@/services/push', () => ({
  registerFcmToken: jest.fn(async () => true),
  clearFcmToken: jest.fn(async () => true),
}))
jest.mock('@/hooks/use-active-trip', () => ({ ACTIVE_TRIP_KEY: ['captain', 'active-trip'] }))
jest.mock('@/hooks/use-remote-trip-cancel', () => ({ TRIP_QUEUE_KEY: ['captain', 'trip-queue'] }))

// react-test-renderer ships with jest-expo (see hooks/use-seconds-left.test.tsx).
interface ReactTestRenderer {
  unmount(): void
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require('react-test-renderer') as { create(element: ReactElement): ReactTestRenderer }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const register = registerFcmToken as jest.MockedFunction<typeof registerFcmToken>
const CAPTAIN = { id: 'captain-a', status: 'approved' } as unknown as Captain

/** Let the registrar's awaits (permission, token, POST) run to the end. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r))
  })

let consoleError: jest.SpyInstance
let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  const original = console.error
  consoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return
    original(...args)
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  consoleError.mockRestore()
})

it('reports a live language switch to the backend with the same device token', async () => {
  useAuthStore.getState().setSession('jwt-a', CAPTAIN)
  const client = new QueryClient()
  act(() => {
    renderer = create(
      <QueryClientProvider client={client}>
        <PushProvider>{null}</PushProvider>
      </QueryClientProvider>,
    )
  })
  await settle()
  expect(register.mock.calls).toEqual([['fcm-device', 'ar']])

  await act(async () => {
    await i18n.changeLanguage('ckb')
  })
  await settle()
  expect(register.mock.calls).toEqual([
    ['fcm-device', 'ar'],
    ['fcm-device', 'ckb'],
  ])
})
