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
  hasHydrated: boolean
  setSession: (token: string, captain: Captain) => void
  setPending: (captainId: string) => void
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
      hasHydrated: false,
      setSession: (token, captain) => set({ token, captain, pendingCaptainId: null }),
      setPending: (captainId) => set({ pendingCaptainId: captainId, token: null }),
      updateCaptain: (patch) =>
        set((s) => ({ captain: s.captain ? { ...s.captain, ...patch } : s.captain })),
      clear: () => set({ token: null, captain: null, pendingCaptainId: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'beeb.auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        token: s.token,
        captain: s.captain,
        pendingCaptainId: s.pendingCaptainId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
