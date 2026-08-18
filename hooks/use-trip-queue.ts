// hooks/use-trip-queue.ts
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTripQueue, acceptTrip, acceptRoom, type CaptainOffer } from '@/services/captain-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useTabStore } from '@/store/tab-store'
import { parseApiError } from '@/lib/api'

const KEY = ['captain', 'trip-queue'] as const
const HOME_TAB_INDEX = 0 // Home tab hosts the live map + offers carousel

/**
 * The backend cancels `requested`/`matched` trips past ~30 min, so an offer older
 * than that cannot be accepted no matter what the last fetch returned.
 *
 * This guard exists because query data OUTLIVES polling: React Query keeps the last
 * successful response when a refetch fails (429) and the query is disabled entirely
 * when the captain goes offline or leaves the Home tab. Without an age check, a
 * long-dead trip keeps rendering as an acceptable card — the rider sees no trip, the
 * captain sees a phantom, and tapping Accept fails.
 */
const OFFER_TTL_MS = 30 * 60 * 1000

/** How often the age filter re-evaluates — offers must expire without needing a fetch. */
const AGE_TICK_MS = 15 * 1000

/** Stable identity so consumers don't re-render on every empty result. */
const NO_OFFERS: CaptainOffer[] = []

/**
 * Live trip queue. Polls every 8s only while the captain is online AND the Home
 * tab (the live map) is active; also refetches immediately when a new offer arrives
 * over the WS (presence.lastOffer). Exposes an accept() that routes by offer type.
 */
export function useTripQueue() {
  const { online, lastOffer } = useCaptainPresence()
  const activeTab = useTabStore((s) => s.activeTabIndex)
  const queryClient = useQueryClient()

  const focused = activeTab === HOME_TAB_INDEX
  const active = online && focused

  // NOTE (Area 5): while online + Home tab active, this polls every 8s even if the
  // captain has navigated into an accepted trip (the tab screen stays mounted under
  // the pager). Area 5 should gate polling on "no active trip" or pause it on accept.
  const query = useQuery({
    queryKey: KEY,
    queryFn: getTripQueue,
    enabled: active,
    refetchInterval: active ? 8000 : false,
    staleTime: 0,
  })

  // Live push → instant refetch.
  useEffect(() => {
    if (active && lastOffer) queryClient.invalidateQueries({ queryKey: KEY })
  }, [lastOffer, active, queryClient])

  const acceptMutation = useMutation({
    mutationFn: (offer: CaptainOffer) =>
      offer.offerType === 'room' ? acceptRoom(offer.id) : acceptTrip(offer.id),
    onError: (err, offer) => {
      const status = parseApiError(err).status
      // 404 = the trip is gone (expired/cancelled), 409 = someone else took it.
      // Drop it NOW rather than waiting for a refetch that may itself fail and
      // leave the dead card on screen.
      if (status === 404 || status === 409) {
        queryClient.setQueryData<CaptainOffer[]>(KEY, (prev) =>
          prev?.filter((o) => o.id !== offer.id),
        )
      }
    },
    onSettled: (_data, err) => {
      // Never refetch straight back into a rate limit — that's what got us limited.
      if (parseApiError(err).status === 429) return
      queryClient.invalidateQueries({ queryKey: KEY })
    },
  })

  // Offline means nothing here is acceptable, and polling is off — so anything still
  // cached is a phantom. Otherwise drop offers past the backend's own TTL.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => clearInterval(id)
  }, [active])

  const offers = useMemo(() => {
    if (!online) return NO_OFFERS
    const fresh = (query.data ?? []).filter((o) => {
      const age = now - Date.parse(o.createdAt)
      return Number.isNaN(age) || age < OFFER_TTL_MS // unparseable date → keep, don't hide a live offer
    })
    return fresh.length ? fresh : NO_OFFERS
  }, [online, query.data, now])

  return {
    offers,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: () => query.refetch(),
    accept: (offer: CaptainOffer) => acceptMutation.mutateAsync(offer),
    accepting: acceptMutation.isPending,
  }
}
