import { api } from '@/lib/api'

export interface Wallet {
  balanceIqd: number
}

export type TxType = 'trip_fare' | 'daily_fee' | 'topup' | 'refund' | 'cancellation_penalty'
export type TxStatus = 'pending' | 'succeeded' | 'failed' | 'reversed'

export interface Transaction {
  id: string
  txType: TxType
  status: TxStatus
  amountIqd: number
  createdAt: string
  tripId?: string
  failureReason?: string
}

export interface PaymentMethod {
  id: string
  methodType: string
  maskedLast4: string | null
  isDefault: boolean
}

interface BackendWallet {
  balance_iqd: number
}
interface BackendTransaction {
  id: string
  tx_type: TxType
  status: TxStatus
  amount_iqd: number
  created_at: string
  trip_id?: string | null
  failure_reason?: string | null
}
interface BackendPaymentMethod {
  id: string
  method_type: string
  masked_last4: string | null
  is_default: boolean
}

function toTransaction(b: BackendTransaction): Transaction {
  return {
    id: b.id,
    txType: b.tx_type,
    status: b.status,
    amountIqd: b.amount_iqd,
    createdAt: b.created_at,
    tripId: b.trip_id ?? undefined,
    failureReason: b.failure_reason ?? undefined,
  }
}

function toPaymentMethod(b: BackendPaymentMethod): PaymentMethod {
  return {
    id: b.id,
    methodType: b.method_type,
    maskedLast4: b.masked_last4,
    isDefault: b.is_default,
  }
}

/** Wallet balance. Auto-provisions on first call. */
export async function getWallet(): Promise<Wallet> {
  const { data } = await api.get<BackendWallet>('/api/me/wallet')
  return { balanceIqd: data.balance_iqd }
}

/**
 * Top up the wallet. With `paymentMethodId` → MockGateway charge then credit;
 * without → cash/admin credit. amount<=0 → 400; gateway reject → 402.
 */
export async function topUp(amountIqd: number, paymentMethodId?: string): Promise<Transaction> {
  const { data } = await api.post<BackendTransaction>('/api/me/wallet/topup', {
    amount_iqd: amountIqd,
    ...(paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
  })
  return toTransaction(data)
}

/** Newest-first transaction ledger (limit/offset; bare array). */
export async function listTransactions(limit = 20, offset = 0): Promise<Transaction[]> {
  const { data } = await api.get<BackendTransaction[]>('/api/me/transactions', {
    params: { limit, offset },
  })
  return (data ?? []).map(toTransaction)
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data } = await api.get<{ items?: BackendPaymentMethod[] } | BackendPaymentMethod[]>(
    '/api/me/payment-methods',
  )
  const items = Array.isArray(data) ? data : (data.items ?? [])
  return items.map(toPaymentMethod)
}

/** Tokenize a card. Only `masked_last4` is returned; the raw number is never stored. */
export async function addPaymentMethod(
  cardNumber: string,
  setAsDefault?: boolean,
): Promise<PaymentMethod> {
  const { data } = await api.post<BackendPaymentMethod>('/api/me/payment-methods', {
    card_number: cardNumber,
    method_type: 'card',
    ...(setAsDefault ? { set_as_default: true } : {}),
  })
  return toPaymentMethod(data)
}

export async function setDefaultPaymentMethod(id: string): Promise<void> {
  await api.put(`/api/me/payment-methods/${id}/default`)
}

export async function deletePaymentMethod(id: string): Promise<void> {
  await api.delete(`/api/me/payment-methods/${id}`)
}
