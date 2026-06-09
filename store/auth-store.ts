import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'

export type Gender = 'male' | 'female' | 'unset'

export interface User {
  id: string
  phone: string
  name: string
  gender: Gender
  photoUri?: string | null
  email?: string | null
}

interface AuthStore {
  user: User | null
  token: string | null
  hasHydrated: boolean
  setSession: (token: string, user: User) => void
  updateUser: (patch: Partial<User>) => void
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
      user: null,
      token: null,
      hasHydrated: false,
      setSession: (token, user) => set({ token, user }),
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      clear: () => set({ token: null, user: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'beeb.auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
