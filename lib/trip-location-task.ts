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

export type BackgroundPingMode = 'idle' | 'trip'

/**
 * Shortest gap between two pings, per mode. The OS hands fixes over as often
 * as the device moves (iOS ignores `timeInterval`), and an idle captain only
 * needs a position good enough to match a dispatch, not one per second.
 */
export const MIN_PING_GAP_MS: Record<BackgroundPingMode, number> = { idle: 10_000, trip: 3_000 }

// Module state, shared with the foreground ping loop in the same JS runtime. A
// background relaunch starts at `trip`: the finer cadence is the safe guess.
let pingMode: BackgroundPingMode = 'trip'
let lastSentAt = 0

/** Called by the presence provider whenever it switches the OS task's mode. */
export function setBackgroundPingMode(mode: BackgroundPingMode): void {
  pingMode = mode
}

/** Record a ping, from either loop, so the other does not double it. */
export function notePingSent(at: number = Date.now()): void {
  lastSentAt = at
}

export function shouldSendBackgroundPing(now: number = Date.now()): boolean {
  return now - lastSentAt >= MIN_PING_GAP_MS[pingMode]
}

/** Test seam: back to a fresh app run. */
export function resetBackgroundPingState(): void {
  pingMode = 'trip'
  lastSentAt = 0
}

/**
 * Background location sink while the captain is online: idle (so leaving the
 * app does not end the shift, and offers keep matching their real position)
 * and on a trip (so the rider's car keeps moving under Waze).
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
  if (!shouldSendBackgroundPing()) return
  notePingSent()

  try {
    await pingLocation(toPingCoords(last.coords))
  } catch {
    // No queue here — a background ping that fails is already obsolete by the
    // time the next batch arrives, and the foreground loop owns the retry queue.
  }
})
