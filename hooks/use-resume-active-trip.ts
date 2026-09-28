// hooks/use-resume-active-trip.ts
import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSegments } from 'expo-router'
import { useActiveTrip } from '@/hooks/use-active-trip'
import { useAuthStore } from '@/store/auth-store'
import { launchResume } from '@/lib/trip-route'

/**
 * On launch, resume the captain into their live trip if one is in flight
 * (accepted / in_progress). Only a trip that was already there when the check
 * first answered: accepting an offer opens the trip screen itself, and the same
 * query later returning that new trip must not push the screen a second time.
 * Auto-navigates at most ONCE per app session — after that the captain may leave
 * the trip screen freely (e.g. to check earnings) without being yanked back; the
 * home-screen banner (useActiveTrip) is the persistent way back.
 *
 * The decision itself is `launchResume` (lib/trip-route.ts, unit-tested); this
 * hook only feeds it and acts on the answer. It relies on the query cache
 * starting empty for each session (AuthGate clears it on logout), so the first
 * value it reads is this session's answer, not the last one's.
 *
 * Shares the useActiveTrip query, so this does not fetch separately. Mount it
 * where it runs only for an approved captain (the tabs layout).
 */
export function useResumeActiveTrip() {
  const router = useRouter()
  const pathname = usePathname()
  const segments = useSegments()
  const captainId = useAuthStore((s) => s.captain?.id)
  const { data: trip } = useActiveTrip()
  // The captain the launch check was spent for (see launchResume).
  const checkedFor = useRef<string | null>(null)

  useEffect(() => {
    const { spend, href } = launchResume(checkedFor.current, captainId, trip, pathname, segments)
    if (!spend) return
    checkedFor.current = captainId ?? null
    if (href) router.push(href)
  }, [captainId, trip, pathname, segments, router])
}
