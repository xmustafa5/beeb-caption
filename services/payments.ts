// services/payments.ts
// QiCard hosted-form card checkout (Phase 10). Sits alongside the wallet model:
// the payer pays on QiCard's own form, and on SUCCESS the backend fulfils the
// order (credits the wallet for wallet_topup, flips the captain activation to
// `paid` for daily_fee). In sandbox auto-confirm the order comes back already
// `paid` so the client can proceed without the redirect; in live mode the client
// opens `form_url` and polls the order until it settles.
import { api } from '@/lib/api'

export type CheckoutPurpose = 'wallet_topup' | 'trip_fare' | 'daily_fee'
export type OrderStatus = 'created' | 'paid' | 'failed' | 'cancelled' | 'refunded'

export interface CheckoutResponse {
  orderId: string
  /** QiCard payment id (sandbox returns a real one too). */
  paymentId?: string
  /** Hosted-form URL to open in a browser (live mode; may be present in sandbox). */
  formUrl?: string
  status: OrderStatus
  /** True when the order is already settled (sandbox auto-confirm). */
  paid: boolean
  sandbox: boolean
}

export interface PaymentOrder {
  id: string
  purpose: CheckoutPurpose
  targetId?: string
  amountIqd: number
  status: OrderStatus
  formUrl?: string
  failureReason?: string
  paidAt?: string | null
}

interface BackendCheckoutResponse {
  order_id: string
  payment_id?: string | null
  form_url?: string | null
  status: OrderStatus
  paid: boolean
  sandbox: boolean
}

interface BackendPaymentOrder {
  id: string
  purpose: CheckoutPurpose
  target_id?: string | null
  amount_iqd: number
  status: OrderStatus
  form_url?: string | null
  failure_reason?: string | null
  paid_at?: string | null
}

function toCheckoutResponse(b: BackendCheckoutResponse): CheckoutResponse {
  return {
    orderId: b.order_id,
    paymentId: b.payment_id ?? undefined,
    formUrl: b.form_url ?? undefined,
    status: b.status,
    paid: b.paid,
    sandbox: b.sandbox,
  }
}

function toPaymentOrder(b: BackendPaymentOrder): PaymentOrder {
  return {
    id: b.id,
    purpose: b.purpose,
    targetId: b.target_id ?? undefined,
    amountIqd: b.amount_iqd,
    status: b.status,
    formUrl: b.form_url ?? undefined,
    failureReason: b.failure_reason ?? undefined,
    paidAt: b.paid_at ?? null,
  }
}

/**
 * Start a QiCard checkout. The server enforces ownership + amount:
 *  - `daily_fee`  → `targetId` = the captain activation id; `amountIqd` MUST equal
 *    its `fee_amount_iqd` (else 400). Settling flips the activation to `paid`.
 *  - `wallet_topup` → no `targetId`; amount is the payer's choice.
 * 400 wrong amount / pairing; 403 not a rider/captain or foreign target; 404 unknown target.
 */
export async function startCheckout(
  purpose: CheckoutPurpose,
  amountIqd: number,
  targetId?: string,
): Promise<CheckoutResponse> {
  const { data } = await api.post<BackendCheckoutResponse>('/api/payments/checkout', {
    purpose,
    amount_iqd: amountIqd,
    ...(targetId ? { target_id: targetId } : {}),
  })
  return toCheckoutResponse(data)
}

/** Read one of the caller's own orders. Poll after opening `form_url`. 404 if not yours. */
export async function getPaymentOrder(orderId: string): Promise<PaymentOrder> {
  const { data } = await api.get<BackendPaymentOrder>(`/api/payments/orders/${orderId}`)
  return toPaymentOrder(data)
}

/** Force the backend to re-poll QiCard and settle/fail the order (webhook fallback). */
export async function refreshPaymentOrder(orderId: string): Promise<PaymentOrder> {
  const { data } = await api.post<BackendPaymentOrder>(`/api/payments/orders/${orderId}/refresh`)
  return toPaymentOrder(data)
}
