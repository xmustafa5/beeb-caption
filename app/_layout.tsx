import { useEffect, useState } from 'react'
import { View, Appearance } from 'react-native'
import { Stack, useRouter, useSegments, type Href } from 'expo-router'
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
import { useAuthStore } from '@/store/auth-store'
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

  if (!fontsLoaded || !langReady || !themeReady || !hasHydrated)
    return <View style={{ flex: 1, backgroundColor: colors.background }} />

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <BottomSheetModalProvider>
              <AuthGate>
                {/* Presence spans the whole authenticated surface (tabs + the live
                    trip screen) so the driving screen gets live WS trip updates.
                    It self-gates on token + approval, so it no-ops on auth screens. */}
                <CaptainPresenceProvider>
                  <PushProvider>
                    <Stack screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}>
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="(trip)" />
                      <Stack.Screen name="(chat)" />
                      <Stack.Screen name="(wallet)" />
                    </Stack>
                  </PushProvider>
                </CaptainPresenceProvider>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              </AuthGate>
            </BottomSheetModalProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors()
  const token = useAuthStore((s) => s.token)
  const captain = useAuthStore((s) => s.captain)
  const pendingCaptainId = useAuthStore((s) => s.pendingCaptainId)
  const segments = useSegments()
  const router = useRouter()

  // Decide where this session belongs SYNCHRONOUSLY from the persisted auth
  // state — don't trust the route the router mounts first. On launch it renders
  // (tabs) before any redirect effect runs, so a logged-out user briefly sees
  // the tabs ("skipping auth"). We compute the target during render and block
  // rendering children until we're on it, so the wrong screen never mounts.
  const inAuthGroup = segments[0] === '(auth)'
  const path = segments.join('/')
  const inRegister = path.startsWith('(auth)/register')
  const isApproved = !!token && captain?.status === 'approved'
  const isPendingLike =
    (!!token && !!captain && captain.status !== 'approved') || !!pendingCaptainId

  let target: Href | null = null
  if (isApproved) {
    if (inAuthGroup) target = '/(tabs)'
  } else if (isPendingLike) {
    // Pending/rejected/blocked. Park on the status screen until approved. Don't
    // redirect while they're still in the register wizard (uploading documents).
    if (!inRegister && path !== '(auth)/status') target = '/(auth)/status'
  } else if (!token) {
    // No session at all → login. This is the case that was leaking into (tabs).
    if (!inAuthGroup) target = '/(auth)/login'
  }

  useEffect(() => {
    if (target) router.replace(target)
  }, [target])

  // While a redirect is pending, render the splash-colored gate instead of
  // children so the wrong screen never mounts (and never fires its hooks).
  if (target) return <View style={{ flex: 1, backgroundColor: colors.background }} />

  return <>{children}</>
}
