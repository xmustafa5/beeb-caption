// hooks/use-clear-cache-on-session-end.ts
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Drop every cached query when an approved session ends (logout, a 401 from
 * anywhere, the account leaving 'approved'). Keys like ['captain','active-trip']
 * are not per captain, and the cache outlives the session by its gcTime: the
 * next login's (tabs) would read the last session's answers before its own
 * arrive. The launch resume in particular spends its one check on the first
 * value it sees, so a stale "no trip" would hide a live one.
 */
export function useClearCacheOnSessionEnd(isApproved: boolean) {
  const qc = useQueryClient()
  const was = useRef(isApproved)
  useEffect(() => {
    if (was.current && !isApproved) qc.clear()
    was.current = isApproved
  }, [isApproved, qc])
}
