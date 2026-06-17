// hooks/use-qicard-checkout.ts
import { useCallback, useRef } from 'react'
import * as WebBrowser from 'expo-web-browser'
import {
  startCheckout,
  getPaymentOrder,
  type CheckoutPurpose,
  type PaymentOrder,
} from '@/services/payments'
import { delay } from '@/lib/delay'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 1000 * 60 * 3 // give the payer 3 min on the hosted form

export type CheckoutOutcome =
  | { kind: 'paid'; order?: PaymentOrder }
  | { kind: 'failed'; reason?: string }
  | { kind: 'cancelled' } // payer dismissed the form before completing
  | { kind: 'pending' } // still 'created' after the timeout — let the caller refresh later

/**
 * Runs a QiCard hosted-form checkout to a terminal outcome:
 *  - sandbox auto-confirm → the checkout response is already `paid` → resolve immediately.
 *  - live → open `form_url` in an in-app browser, then poll the order until it
 *    settles (`paid`) / fails, the payer dismisses the form, or we time out.
 * Money/amount are server-enforced; the caller passes the real fee/amount.
 */
export function useQiCardCheckout() {
  // Guard against overlapping checkouts (double-tap).
  const running = useRef(false)

  const checkout = useCallback(
    async (
      purpose: CheckoutPurpose,
      amountIqd: number,
      targetId?: string,
    ): Promise<CheckoutOutcome> => {
      if (running.current) return { kind: 'pending' }
      running.current = true
      try {
        const res = await startCheckout(purpose, amountIqd, targetId)

        // Sandbox auto-confirm (or already settled): nothing to open, we're done.
        if (res.paid || res.status === 'paid') return { kind: 'paid' }
        if (res.status === 'failed') return { kind: 'failed' }

        // Live mode: open the hosted form. Without a URL we can't proceed.
        if (!res.formUrl) return { kind: 'pending' }
        const browser = await WebBrowser.openBrowserAsync(res.formUrl)

        // Poll the order until terminal or timeout. We keep polling briefly even
        // if the payer dismissed the browser — the webhook may settle it server-side.
        const dismissed = browser.type === 'cancel' || browser.type === 'dismiss'
        const deadline = POLL_TIMEOUT_MS
        let waited = 0
        while (waited < deadline) {
          const order = await getPaymentOrder(res.orderId)
          if (order.status === 'paid' || order.status === 'refunded')
            return { kind: 'paid', order }
          if (order.status === 'failed' || order.status === 'cancelled')
            return { kind: 'failed', reason: order.failureReason }
          // If the payer dismissed and the order is still 'created', give the
          // webhook one short grace window, then report cancelled.
          if (dismissed && waited >= POLL_INTERVAL_MS) return { kind: 'cancelled' }
          await delay(POLL_INTERVAL_MS)
          waited += POLL_INTERVAL_MS
        }
        return { kind: 'pending' }
      } finally {
        running.current = false
      }
    },
    [],
  )

  return { checkout }
}
