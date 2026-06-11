// services/activation.ts
import { api } from '@/lib/api'

// Backend default daily fee; shown only before the first activation row exists
// (the server computes the real charge — we never charge a hardcoded amount).
export const DEFAULT_DAILY_FEE_IQD = 2000

export type ActivationStatus = 'pending' | 'paid' | 'waived' | 'failed'

export interface Activation {
  id: string
  date: string // YYYY-MM-DD
  feeAmountIqd: number
  status: ActivationStatus
  collectedAt?: string | null
  chargeError?: string | null
}

export interface TodayActivation {
  activated: boolean
  activation: Activation | null
}

interface BackendActivation {
  id: string
  captain_id: string
  date: string
  fee_amount_iqd: number
  status: string
  collected_at?: string | null
  charge_error?: string | null
}

function toActivation(b: BackendActivation): Activation {
  return {
    id: b.id,
    date: b.date,
    feeAmountIqd: b.fee_amount_iqd,
    status: (b.status as ActivationStatus) ?? 'pending',
    collectedAt: b.collected_at ?? null,
    chargeError: b.charge_error ?? null,
  }
}

/** Today's activation gate state. 403 if the captain is not approved. */
export async function getTodayActivation(): Promise<TodayActivation> {
  const { data } = await api.get<{ activated: boolean; activation: BackendActivation | null }>(
    '/api/captain/activation/today',
  )
  return {
    activated: data.activated,
    activation: data.activation ? toActivation(data.activation) : null,
  }
}

/**
 * Activate for today (charges the captain wallet). 201 → paid row. A 402
 * (insufficient balance) propagates as an axios error for the caller to catch
 * and recover via top-up. Idempotent: re-activating the same day returns the
 * same row.
 */
export async function activateToday(): Promise<Activation> {
  const { data } = await api.post<BackendActivation>('/api/captain/activation/today', {})
  return toActivation(data)
}
