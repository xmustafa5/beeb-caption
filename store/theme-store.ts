import { create } from 'zustand'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

type Scheme = 'light' | 'dark'
export type Preference = 'light' | 'dark' | 'system'

function resolveScheme(pref: Preference): Scheme {
  if (pref === 'system') return Appearance.getColorScheme() === 'light' ? 'light' : 'dark'
  return pref
}

interface ThemeStore {
  // User's choice: explicit light/dark, or follow the device ("system")
  preference: Preference
  // Resolved scheme the rest of the app renders with
  scheme: Scheme
  setPreference: (p: Preference) => void
  // Re-resolve from the OS (called when preference is 'system' and the device theme changes)
  syncSystemScheme: () => void
  loadPersistedScheme: () => Promise<void>
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  preference: 'system',
  scheme: resolveScheme('system'),
  setPreference: (preference) => {
    set({ preference, scheme: resolveScheme(preference) })
    AsyncStorage.setItem('beeb.themePreference', preference)
  },
  syncSystemScheme: () => {
    if (get().preference === 'system') set({ scheme: resolveScheme('system') })
  },
  loadPersistedScheme: async () => {
    const saved = await AsyncStorage.getItem('beeb.themePreference')
    const pref: Preference =
      saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
    set({ preference: pref, scheme: resolveScheme(pref) })
  },
}))
