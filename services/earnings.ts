// services/earnings.ts
import { api } from '@/lib/api'

export type EarningsPeriod = 'today' | 'week' | 'month'

export interface Earnings {
  grossIqd: number
  activationFeeIqd: number
  netIqd: number
  tripCount: number
  period: EarningsPeriod
}

export interface EarningsHistoryItem {
  tripId: string
  fareIqd: number
  tripType: 'regular' | 'abriyah'
  completedAt: string
}

interface BackendEarnings {
  gross_iqd: number
  activation_fee_iqd: number
  net_iqd: number
  trip_count: number
  period: string
}

interface BackendHistoryItem {
  trip_id: string
  fare_iqd: number
  trip_type: string
  completed_at: string
}

export async function getEarnings(captainId: string, period: EarningsPeriod): Promise<Earnings> {
  const { data } = await api.get<BackendEarnings>(`/api/captains/${captainId}/earnings`, {
    params: { period },
  })
  return {
    grossIqd: data.gross_iqd,
    activationFeeIqd: data.activation_fee_iqd,
    netIqd: data.net_iqd,
    tripCount: data.trip_count,
    period: (data.period as EarningsPeriod) ?? period,
  }
}

export async function getEarningsHistory(
  captainId: string,
  period: EarningsPeriod,
): Promise<EarningsHistoryItem[]> {
  const { data } = await api.get<{ items: BackendHistoryItem[] }>(
    `/api/captains/${captainId}/earnings/history`,
    { params: { period } },
  )
  return (data.items ?? []).map((i) => ({
    tripId: i.trip_id,
    fareIqd: i.fare_iqd,
    tripType: i.trip_type === 'abriyah' ? 'abriyah' : 'regular',
    completedAt: i.completed_at,
  }))
}
