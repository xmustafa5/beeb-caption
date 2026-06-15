import { useEffect, useState } from 'react'
import { View, Appearance } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
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
            <AuthGate>
              <Stack screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(trip)" />
              </Stack>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            </AuthGate>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const captain = useAuthStore((s) => s.captain)
  const pendingCaptainId = useAuthStore((s) => s.pendingCaptainId)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)'
    const isApproved = !!token && captain?.status === 'approved'
    const isPendingLike =
      (!!token && !!captain && captain.status !== 'approved') || !!pendingCaptainId

    if (isApproved) {
      if (inAuthGroup) router.replace('/(tabs)')
    } else if (isPendingLike) {
      // Pending/rejected/blocked — with OR without a token. Captain login is gated
      // on admin approval, so a freshly-registered captain holds a pendingCaptainId
      // and NO token; an approved-but-not-yet-active captain may hold a token. Both
      // park on the status screen until approved (then they log in / get routed to
      // tabs). Don't redirect while they're still in the register wizard.
      const path = segments.join('/')
      const inRegister = path.startsWith('(auth)/register')
      if (!inRegister && path !== '(auth)/status') router.replace('/(auth)/status')
    } else if (!token) {
      if (!inAuthGroup) router.replace('/(auth)/login')
    }
  }, [token, captain, pendingCaptainId, segments])

  return <>{children}</>
}
