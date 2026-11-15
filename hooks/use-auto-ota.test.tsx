import { act, type ReactElement } from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'
import { useAutoOta } from './use-auto-ota'

interface ReactTestRenderer {
  unmount(): void
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require('react-test-renderer') as { create(element: ReactElement): ReactTestRenderer }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(async () => {}),
}))

const mocked = Updates as jest.Mocked<typeof Updates>
let onAppState: ((s: string) => void) | undefined

function Probe() {
  useAutoOta()
  return null
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  jest.clearAllMocks()
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, cb) => {
    onAppState = cb as (s: string) => void
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>
  })
})

afterAll(() => {
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
})

describe('useAutoOta', () => {
  it('downloads and reloads into a new update on launch', async () => {
    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: true } as never)
    mocked.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never)
    act(() => { create(<Probe />) })
    await flush()
    expect(mocked.fetchUpdateAsync).toHaveBeenCalledTimes(1)
    expect(mocked.reloadAsync).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no update, then checks again on foreground', async () => {
    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: false } as never)
    act(() => { create(<Probe />) })
    await flush()
    expect(mocked.fetchUpdateAsync).not.toHaveBeenCalled()
    expect(mocked.reloadAsync).not.toHaveBeenCalled()

    mocked.checkForUpdateAsync.mockResolvedValue({ isAvailable: true } as never)
    mocked.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never)
    act(() => { onAppState?.('active') })
    await flush()
    expect(mocked.checkForUpdateAsync).toHaveBeenCalledTimes(2)
    expect(mocked.reloadAsync).toHaveBeenCalledTimes(1)
  })

  it('swallows network errors', async () => {
    mocked.checkForUpdateAsync.mockRejectedValue(new Error('offline'))
    act(() => { create(<Probe />) })
    await flush()
    expect(mocked.reloadAsync).not.toHaveBeenCalled()
  })

  it('is off in development', async () => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
    act(() => { create(<Probe />) })
    await flush()
    expect(mocked.checkForUpdateAsync).not.toHaveBeenCalled()
  })
})
