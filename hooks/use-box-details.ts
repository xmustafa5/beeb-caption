// hooks/use-box-details.ts
import { useQuery } from '@tanstack/react-query'
import { getBoxDetails } from '@/services/box'
import { parseApiError } from '@/lib/api'

/** Presigned photo URLs live ~5 minutes; refresh a little before they lapse. */
const PHOTO_URL_REFRESH_MS = 4 * 60 * 1000

/** Final answers, not blips: 403 = not this captain / trip no longer live, 404 = no such Box. */
const NO_RETRY_STATUSES = [403, 404]

/**
 * The parcel on a Box trip (description, photos, recipient). Pass `enabled` only
 * for a Box trip that is `accepted` or `in_progress` — the backend refuses the
 * captain outside that window (403), so asking earlier or later only errors.
 */
export function useBoxDetails(tripId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['captain', 'box', tripId],
    queryFn: () => getBoxDetails(tripId as string),
    enabled: !!tripId && enabled,
    retry: (failureCount, error) =>
      !NO_RETRY_STATUSES.includes(parseApiError(error).status ?? 0) && failureCount < 2,
    staleTime: PHOTO_URL_REFRESH_MS,
    // Keep the signed URLs fresh while the screen is open, so a photo opened for
    // the first time late in the trip still loads. Cached photos don't re-download
    // (stable cacheKey), so this costs one small JSON request.
    refetchInterval: PHOTO_URL_REFRESH_MS,
    refetchIntervalInBackground: false,
  })
}
