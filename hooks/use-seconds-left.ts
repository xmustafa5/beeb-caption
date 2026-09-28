// hooks/use-seconds-left.ts
import { useEffect, useState } from 'react'
import { msUntilNextTick, secondsLeft } from '@/lib/room-countdown'

/**
 * Whole seconds left until `deadlineMs` (local clock), re-rendering exactly
 * when the shown second changes and stopping at 0. Undefined without a
 * deadline. A new deadline (a join restarted the room's wait) restarts it.
 */
export function useSecondsLeft(deadlineMs: number | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadlineMs == null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const wait = msUntilNextTick(deadlineMs, t)
      // A few ms past the boundary, so the next read lands on the new second.
      if (wait != null) timer = setTimeout(tick, wait + 5)
    }
    // Sync right away: the clock may be stale if the last deadline had run out.
    tick()
    return () => clearTimeout(timer)
  }, [deadlineMs])

  return deadlineMs == null ? undefined : secondsLeft(deadlineMs, now)
}
