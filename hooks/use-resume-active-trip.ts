// hooks/use-resume-active-trip.ts
import { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useActiveTrip } from '@/hooks/use-active-trip'
import { useAuthStore } from '@/store/auth-store'

/**
 * On launch, resume the captain into their live trip if one is in flight
 * (accepted / in_progress). Auto-navigates ONCE per app session — after that the
 * captain may leave the trip screen freely (e.g. to check earnings) without being
 * yanked back; the home-screen banner (useActiveTrip) is the persistent way back.
 *
 * Shares the useActiveTrip query, so this does not fetch separately. Mount it
 * where it runs only for an approved captain (the tabs layout).
 */
export function useResumeActiveTrip() {
  const router = useRouter()
  const captainId = useAuthStore((s) => s.captain?.id)
  const { data: trip } = useActiveTrip()
  // One auto-navigate per app session, keyed on the captain id (so a logout→login
  // of a different captain re-checks, but a re-render of the same session does not).
  const resumedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!captainId || !trip) return
    if (resumedFor.current === captainId) return
    resumedFor.current = captainId
    router.push(`/(trip)/${trip.id}`)
  }, [captainId, trip, router])
}
