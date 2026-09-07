// lib/trip-location-task.ts
import * as TaskManager from 'expo-task-manager'
import type { LocationObject } from 'expo-location'
import { pingLocation, toPingCoords } from '@/services/captain-location'
import { useAuthStore } from '@/store/auth-store'

/**
 * Name the OS knows this task by. It is persisted natively across launches, so it
 * must never change without also stopping the old one (see `stopTripTracking`).
 */
export const TRIP_LOCATION_TASK = 'beeb-captain-trip-location'

/**
 * Background location sink for an active trip.
 *
 * `TaskManager.defineTask` MUST run at module scope, before the OS can deliver an
 * event: on a background relaunch the native side looks the task up by name the
 * moment JS boots, and a definition buried inside a component would not exist
 * yet. Import this module for its side effect (the presence provider does) rather
 * than only for `TRIP_LOCATION_TASK`.
 *
 * The OS batches fixes, so `data.locations` can hold several; only the newest is
 * worth posting — the backend keeps the last ping and the rider only ever draws
 * the current position.
 */
TaskManager.defineTask<{ locations?: LocationObject[] }>(TRIP_LOCATION_TASK, async ({ data, error }) => {
  if (error) return
  const locations = data?.locations
  const last = locations?.[locations.length - 1]
  if (!last) return

  // A background relaunch can run this before SecureStore rehydration finishes.
  // Skip rather than fire an anonymous request: the next batch is seconds away.
  if (!useAuthStore.getState().token) return

  try {
    await pingLocation(toPingCoords(last.coords))
  } catch {
    // No queue here — a background ping that fails is already obsolete by the
    // time the next batch arrives, and the foreground loop owns the retry queue.
  }
})
