import { act, type ReactElement } from 'react'
import { Platform } from 'react-native'
import { UpdateGate } from './update-gate'
import { APP_KEY, type AppMinVersions } from '@/lib/app-version'

interface TestInstance {
  findAll(pred: (n: { props: Record<string, unknown> }) => boolean): unknown[]
}
interface ReactTestRenderer {
  root: TestInstance
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require('react-test-renderer') as { create(element: ReactElement): ReactTestRenderer }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mockData: unknown
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mockData, refetch: jest.fn() }) }))
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '2.2.0' } } }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('@/hooks/use-theme-colors', () => ({ useThemeColors: () => jest.requireActual('@/constants/Colors').Colors.light }))
jest.mock('@/hooks/use-auto-ota', () => ({ useAutoOta: () => {} }))
jest.mock('@/components/ui/button', () => ({ Button: () => null }))
jest.mock('@/components/ui/icon', () => ({ Icon: () => null }))
jest.mock('@/services/app-version', () => ({ getMinVersions: jest.fn(), minVersionsQueryKey: ['app', 'min-versions'] }))

function visible(ios: string): boolean {
  const data: AppMinVersions = { rider: { ios: '0.0.0', android: '0.0.0' }, captain: { ios: '0.0.0', android: '0.0.0' } }
  data[APP_KEY] = { ios, android: '0.0.0' }
  mockData = data
  let r!: ReactTestRenderer
  act(() => { r = create(<UpdateGate />) })
  const modal = r.root.findAll((n) => n.props.onRequestClose !== undefined)[0] as { props: { visible: boolean } }
  return modal.props.visible
}

beforeAll(() => {
  Platform.OS = 'ios'
})

describe('UpdateGate', () => {
  it('blocks a build older than the minimum', () => {
    expect(visible('2.3.0')).toBe(true)
  })

  it('lets a current build in', () => {
    expect(visible('2.2.0')).toBe(false)
    expect(visible('0.0.0')).toBe(false)
  })

  it('lets the user in while the minimum is unknown (offline / loading)', () => {
    mockData = undefined
    let r!: ReactTestRenderer
    act(() => { r = create(<UpdateGate />) })
    const modal = r.root.findAll((n) => n.props.onRequestClose !== undefined)[0] as { props: { visible: boolean } }
    expect(modal.props.visible).toBe(false)
  })
})
