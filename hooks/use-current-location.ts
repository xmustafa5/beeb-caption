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

export function useCurrentLocation(): LocationState & { fallback: LatLng } {
  const [state, setState] = useState<LocationState>({
    location: null,
    permissionGranted: false,
    error: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    let subscription: Location.LocationSubscription | null = null

    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (cancelled) return
        if (status !== 'granted') {
          setState({ location: null, permissionGranted: false, error: 'permission_denied', loading: false })
          return
        }
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (cancelled) return
        setState({
          location: { latitude: initial.coords.latitude, longitude: initial.coords.longitude },
          permissionGranted: true,
          error: null,
          loading: false,
        })
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 5000 },
          (pos) => {
            setState((s) => ({
              ...s,
              location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            }))
          },
        )
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'unknown'
        setState({ location: null, permissionGranted: false, error: msg, loading: false })
      }
    })()

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [])

  return { ...state, fallback: BAGHDAD_CENTER }
}
