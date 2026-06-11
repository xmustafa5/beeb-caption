// hooks/use-trip-queue.ts
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTripQueue, acceptTrip, acceptRoom, type CaptainOffer } from '@/services/captain-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useTabStore } from '@/store/tab-store'

const KEY = ['captain', 'trip-queue'] as const
const QUEUE_TAB_INDEX = 1

/**
 * Live trip queue. Polls every 8s only while the captain is online AND the Queue
 * tab is active; also refetches immediately when a new offer arrives over the WS
 * (presence.lastOffer). Exposes an accept() that routes by offer type.
 */
export function useTripQueue() {
  const { online, lastOffer } = useCaptainPresence()
  const activeTab = useTabStore((s) => s.activeTabIndex)
  const queryClient = useQueryClient()

  const focused = activeTab === QUEUE_TAB_INDEX
  const active = online && focused

  // NOTE (Area 5): while online + Queue tab active, this polls every 8s even if the
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return {
    offers: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: () => query.refetch(),
    accept: (offer: CaptainOffer) => acceptMutation.mutateAsync(offer),
    accepting: acceptMutation.isPending,
  }
}
