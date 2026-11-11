// store/auth-store.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import type { Captain } from '@/lib/captain-mappers'

interface AuthStore {
  token: string | null
  captain: Captain | null
  // Set after a successful register so a pending captain who quits the app
  // resumes on the status screen instead of the phone entry.
  pendingCaptainId: string | null
  /**
   * Onboarding: does this pending captain still owe the 5 required documents?
   *   true  → not all uploaded. The (auth) guards park them on the documents
   *           screen on every launch until they submit, so a captain who leaves
   *           the app mid-upload (to find or photograph a paper) comes back to
   *           the upload list and never to "waiting for approval".
   *   false → all on file; "waiting for approval" is the truth.
   *   null  → not known yet (a login, or a session stored by a build that
   *           predates this field). The status screen asks the server and sets it.
   */
  documentsPending: boolean | null
  hasHydrated: boolean
  setSession: (token: string, captain: Captain, documentsPending?: boolean | null) => void
  setPending: (captainId: string) => void
  setDocumentsPending: (pending: boolean) => void
  updateCaptain: (patch: Partial<Captain>) => void
  clear: () => void
  setHasHydrated: (v: boolean) => void
}

const secureStorage = {
  getItem: async (name: string) => {
    const v = await SecureStore.getItemAsync(name)
    return v ?? null
  },
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value)
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name)
  },
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      captain: null,
      pendingCaptainId: null,
      documentsPending: null,
      hasHydrated: false,
      setSession: (token, captain, documentsPending = null) =>
        set({ token, captain, pendingCaptainId: null, documentsPending }),
      setPending: (captainId) => set({ pendingCaptainId: captainId, token: null }),
      setDocumentsPending: (pending) => set({ documentsPending: pending }),
      updateCaptain: (patch) =>
        set((s) => ({ captain: s.captain ? { ...s.captain, ...patch } : s.captain })),
      clear: () => set({ token: null, captain: null, pendingCaptainId: null, documentsPending: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'beeb.auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        token: s.token,
        captain: s.captain,
        pendingCaptainId: s.pendingCaptainId,
        documentsPending: s.documentsPending,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

// Which screens a session may see. The navigation guards (AuthGate in
// app/_layout.tsx, and app/(auth)/_layout.tsx) read these as selectors, so a
// layout re-renders only when the answer changes.

/** An approved captain with a token: the only session the operational app is for. */
export const selectIsApproved = (s: AuthStore): boolean =>
  !!s.token && s.captain?.status === 'approved'

/**
 * Registered but not approved: a token for a pending / rejected / blocked
 * captain, or a registration awaiting review. Parked on the status screen.
 */
export const selectIsPendingLike = (s: AuthStore): boolean =>
  (!!s.token && !!s.captain && s.captain.status !== 'approved') || !!s.pendingCaptainId

/**
 * A pending captain who has not finished uploading documents. Their one screen
 * is the documents step: neither "waiting for approval" (nothing is waiting on
 * the admin yet) nor the wizard (the account already exists).
 */
export const selectNeedsDocuments = (s: AuthStore): boolean =>
  !!s.token && s.captain?.status === 'pending' && s.documentsPending === true
