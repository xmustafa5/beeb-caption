import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

export interface LatLng {
  latitude: number
  longitude: number
}

interface LocationState {
  location: LatLng | null
  permissionGranted: boolean
  error: string | null
  loading: boolean
}

const BAGHDAD_CENTER: LatLng = { latitude: 33.3152, longitude: 44.3661 }

// Module-level cache of the last good fix, shared across all screens. Lets a
// freshly-opened picker (pickup → destination → abriyah) center INSTANTLY on the
// last known spot instead of cold-starting GPS every time.
let lastFix: LatLng | null = null

export function useCurrentLocation(): LocationState & { fallback: LatLng } {
  const [state, setState] = useState<LocationState>({
    // Seed from the cached fix so the map can center immediately on remount.
    location: lastFix,
    permissionGranted: false,
    error: null,
    loading: lastFix === null,
  })

  useEffect(() => {
    let cancelled = false
    let subscription: Location.LocationSubscription | null = null

    const apply = (coords: LatLng) => {
      lastFix = coords
      if (!cancelled) {
        setState((s) => ({ ...s, location: coords, permissionGranted: true, error: null, loading: false }))
      }
    }

    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (cancelled) return
        if (status !== 'granted') {
          setState({ location: null, permissionGranted: false, error: 'permission_denied', loading: false })
          return
        }

        // 1) INSTANT: the OS's last-known position returns immediately (no GPS wait).
        //    Centers the map in milliseconds while a fresh fix is acquired.
        try {
          const last = await Location.getLastKnownPositionAsync()
          if (last && !cancelled) apply({ latitude: last.coords.latitude, longitude: last.coords.longitude })
        } catch {
          // ignore — fall through to the live fix
        }

        // 2) FRESH: a current fix, refining whatever we showed from cache.
        const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (cancelled) return
        apply({ latitude: initial.coords.latitude, longitude: initial.coords.longitude })

        // 3) LIVE: keep it current while the picker is open.
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 5000 },
          (pos) => apply({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        )
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'unknown'
        setState((s) => ({ ...s, error: msg, loading: false }))
      }
    })()

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [])

  return { ...state, fallback: BAGHDAD_CENTER }
}
