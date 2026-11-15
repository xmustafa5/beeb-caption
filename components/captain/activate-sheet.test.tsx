import { act, type ReactElement } from 'react'
import { ActivateSheet } from './activate-sheet'

// react-test-renderer ships with jest-expo (see hooks/use-seconds-left.test.tsx).
interface ReactTestRenderer {
  update(element: ReactElement): void
  unmount(): void
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require('react-test-renderer') as { create(element: ReactElement): ReactTestRenderer }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockSetOnline = jest.fn(async () => {})
let mockActivationData: { activated: boolean; activation: null } | undefined

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('@/hooks/use-theme-colors', () => ({ useThemeColors: () => jest.requireActual('@/constants/Colors').Colors.light }))
jest.mock('@/components/ui/button', () => ({ Button: () => null }))
jest.mock('@/components/ui/icon', () => ({ Icon: () => null }))
jest.mock('@/components/forms/form-error', () => ({ FormError: () => null }))
jest.mock('@/components/captain/top-up-sheet', () => ({ TopUpSheet: () => null }))
jest.mock('@/hooks/use-qicard-checkout', () => ({ useQiCardCheckout: () => ({ checkout: jest.fn() }) }))
jest.mock('@/services/wallet', () => ({ getWallet: jest.fn() }))
jest.mock('@/services/activation', () => ({ DEFAULT_DAILY_FEE_IQD: 2000, getTodayActivation: jest.fn() }))
jest.mock('@/providers/captain-presence', () => ({ useCaptainPresence: () => ({ setOnline: mockSetOnline }) }))
jest.mock('@/hooks/use-activation', () => ({
  useActivation: () => ({
    query: { data: mockActivationData, refetch: jest.fn() },
    activate: { mutateAsync: jest.fn(), isPending: false },
  }),
}))

function sheet(onClose: () => void, visible = true) {
  return <ActivateSheet visible={visible} onClose={onClose} />
}

beforeEach(() => {
  mockSetOnline.mockClear()
  mockActivationData = undefined
})

describe('ActivateSheet', () => {
  it('goes online once the day is paid from the sheet, and closes', () => {
    const onClose = jest.fn()
    mockActivationData = { activated: false, activation: null }
    let r!: ReactTestRenderer
    act(() => { r = create(sheet(onClose)) })
    expect(mockSetOnline).not.toHaveBeenCalled()

    mockActivationData = { activated: true, activation: null }
    act(() => r.update(sheet(onClose)))
    expect(onClose).toHaveBeenCalled()
    expect(mockSetOnline).toHaveBeenCalledTimes(1)
    expect(mockSetOnline).toHaveBeenCalledWith(true)

    // Re-renders before the parent hides it do not switch online again.
    act(() => r.update(sheet(onClose)))
    expect(mockSetOnline).toHaveBeenCalledTimes(1)
    r.unmount()
  })

  it('only closes when opened on a day that is already paid', () => {
    const onClose = jest.fn()
    mockActivationData = { activated: true, activation: null }
    let r!: ReactTestRenderer
    act(() => { r = create(sheet(onClose)) })
    expect(onClose).toHaveBeenCalled()
    expect(mockSetOnline).not.toHaveBeenCalled()
    r.unmount()
  })

  it('does not go online when the status was still loading, not unpaid', () => {
    const onClose = jest.fn()
    let r!: ReactTestRenderer
    act(() => { r = create(sheet(onClose)) })
    mockActivationData = { activated: true, activation: null }
    act(() => r.update(sheet(onClose)))
    expect(onClose).toHaveBeenCalled()
    expect(mockSetOnline).not.toHaveBeenCalled()
    r.unmount()
  })
})
