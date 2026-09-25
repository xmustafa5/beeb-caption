import { useEffect, useState } from 'react'
import { View, Appearance } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Poppins_400Regular,
  Poppins_400Regular_Italic,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_600SemiBold_Italic,
  Poppins_300Light,
  Poppins_300Light_Italic,
  Poppins_200ExtraLight,
  Poppins_200ExtraLight_Italic,
} from '@expo-google-fonts/poppins'
import 'react-native-reanimated'
import i18n, { languageReady } from '@/i18n'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { selectIsApproved, useAuthStore } from '@/store/auth-store'
import { useThemeStore } from '@/store/theme-store'
import { CaptainPresenceProvider } from '@/providers/captain-presence'
import { PushProvider } from '@/providers/push-provider'

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
})

export default function RootLayout() {
  const colors = useThemeColors()

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_400Regular_Italic,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_600SemiBold_Italic,
    Poppins_300Light,
    Poppins_300Light_Italic,
    Poppins_200ExtraLight,
    Poppins_200ExtraLight_Italic,
  })

  const [langReady, setLangReady] = useState(false)
  useEffect(() => {
    languageReady.then(() => setLangReady(true))
  }, [])

  // Load the saved theme preference, then keep "system" in sync with the OS.
  const [themeReady, setThemeReady] = useState(false)
  useEffect(() => {
    useThemeStore.getState().loadPersistedScheme().finally(() => setThemeReady(true))
    const sub = Appearance.addChangeListener(() => useThemeStore.getState().syncSystemScheme())
    return () => sub.remove()
  }, [])

  const scheme = useThemeStore((s) => s.scheme)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (fontsLoaded && langReady && themeReady && hasHydrated) SplashScreen.hideAsync()
  }, [fontsLoaded, langReady, themeReady, hasHydrated])

  // Held under the native splash until the persisted session is known, so the
  // navigator's first render already has the right guards. Nothing can navigate
  // before the navigator exists; from here on it is never unmounted.
  if (!fontsLoaded || !langReady || !themeReady || !hasHydrated)
    return <View style={{ flex: 1, backgroundColor: colors.background }} />

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <BottomSheetModalProvider>
              {/* Presence spans the whole authenticated surface (tabs + the live
                  trip screen) so the driving screen gets live WS trip updates.
                  It self-gates on token + approval, so it no-ops on auth screens. */}
              <CaptainPresenceProvider>
                <PushProvider>
                  <AuthGate />
                </PushProvider>
              </CaptainPresenceProvider>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            </BottomSheetModalProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

/**
 * The root navigator, where the session decides which screens EXIST. A captain
 * without an approved session has no (tabs), (trip), (chat), (wallet) or
 * (account) route at all, and an approved one has no (auth). When the guard
 * flips, the stack drops the routes that went away and lands on its first
 * available screen in the same render: an approved login goes to (tabs), a
 * logout or a 401 from anywhere goes to (auth), and a cold launch starts on the
 * right group (the launch route, '/' = (tabs), is checked against the guards
 * before the first render). The wrong screen never mounts, so its hooks never
 * fire. app/(auth)/_layout.tsx does the same for login vs status inside (auth).
 *
 * Why guards and not redirects: expo-router 6 doesn't navigate synchronously.
 * router.replace() queues the action and dispatches it from an effect after the
 * next render, so the navigator it targets must still be mounted by then. The
 * old gate computed a redirect during render and swapped the whole Stack for a
 * blank view until it landed. The queued REPLACE then found no navigator ("not
 * handled by any navigator") and was dropped, and where the remounted Stack
 * ended up was luck: a pending login could land on the home map. So the Stack
 * is never unmounted, and a session change needs no router call: login.tsx only
 * stores the session. Navigating to a screen a guard has removed is a no-op.
 */
function AuthGate() {
  const colors = useThemeColors()
  const isApproved = useAuthStore(selectIsApproved)
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
    }}>
      {/* (tabs) comes first: it is where an approved session lands. */}
      <Stack.Protected guard={isApproved}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(trip)" />
        <Stack.Screen name="(chat)" />
        <Stack.Screen name="(wallet)" />
        <Stack.Screen name="(account)" />
      </Stack.Protected>
      <Stack.Protected guard={!isApproved}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  )
}
