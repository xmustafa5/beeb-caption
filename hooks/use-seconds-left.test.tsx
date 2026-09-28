import { act, type ReactElement } from 'react'
import { useSecondsLeft } from './use-seconds-left'

// react-test-renderer ships with jest-expo, pinned to this React version; the
// repo has neither @testing-library nor its @types, so this is a tiny
// renderHook over the one call it needs.
interface ReactTestRenderer {
  update(element: ReactElement): void
  unmount(): void
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require('react-test-renderer') as { create(element: ReactElement): ReactTestRenderer }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const T0 = 1_790_000_000_000

function renderSecondsLeft(deadlineMs: number | undefined) {
  const result: { current: number | undefined } = { current: undefined }
  function Probe({ deadline }: { deadline: number | undefined }) {
    result.current = useSecondsLeft(deadline)
    return null
  }
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<Probe deadline={deadlineMs} />)
  })
  return {
    result,
    rerender: (next: number | undefined) =>
      act(() => {
        renderer.update(<Probe deadline={next} />)
      }),
    unmount: () =>
      act(() => {
        renderer.unmount()
      }),
  }
}

const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms)
  })

let consoleError: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers({ now: T0 })
  // React 19 logs a deprecation notice for react-test-renderer; anything else still fails loudly.
  const original = console.error
  consoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return
    original(...args)
  })
})
afterEach(() => {
  consoleError.mockRestore()
  jest.useRealTimers()
})

describe('useSecondsLeft', () => {
  it('is undefined and schedules nothing without a deadline', () => {
    const { result } = renderSecondsLeft(undefined)
    expect(result.current).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('ticks once a second and stops at 0', () => {
    const { result } = renderSecondsLeft(T0 + 3000)
    expect(result.current).toBe(3)
    expect(jest.getTimerCount()).toBe(1)

    advance(999)
    expect(result.current).toBe(3) // the shown second has not changed yet
    advance(6)
    expect(result.current).toBe(2)
    advance(1000)
    expect(result.current).toBe(1)
    advance(1000)
    expect(result.current).toBe(0)
    // Nothing left to tick: no timer keeps running on an expired card.
    expect(jest.getTimerCount()).toBe(0)
    advance(10_000)
    expect(result.current).toBe(0)
  })

  it('re-renders exactly when the shown second changes, from a mid-second start', () => {
    jest.setSystemTime(T0 + 250)
    const { result } = renderSecondsLeft(T0 + 3000) // 2.75 s left shows as 3
    expect(result.current).toBe(3)
    advance(754)
    expect(result.current).toBe(3)
    advance(1)
    expect(result.current).toBe(2)
  })

  it('restarts on a new deadline and drops the old timer', () => {
    const { result, rerender } = renderSecondsLeft(T0 + 3000)
    advance(1005)
    expect(result.current).toBe(2)
    rerender(T0 + 1005 + 300_000) // a join restarted the room's wait
    expect(result.current).toBe(300)
    expect(jest.getTimerCount()).toBe(1)
    advance(1005)
    expect(result.current).toBe(299)
  })

  it('syncs at once when a new deadline arrives after the last one ran out', () => {
    const { result, rerender } = renderSecondsLeft(T0 + 1000)
    advance(1005)
    expect(result.current).toBe(0)
    advance(60_000) // nothing ticks meanwhile, so the hook's clock is a minute stale
    rerender(Date.now() + 120_000)
    expect(result.current).toBe(120)
  })

  it('clears its timer on unmount', () => {
    const { unmount } = renderSecondsLeft(T0 + 60_000)
    expect(jest.getTimerCount()).toBe(1)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('stops ticking when the deadline goes away', () => {
    const { result, rerender } = renderSecondsLeft(T0 + 60_000)
    rerender(undefined)
    expect(result.current).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })
})
