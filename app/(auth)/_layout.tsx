import { Stack } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { selectIsPendingLike, useAuthStore } from '@/store/auth-store'

export default function AuthLayout() {
  const colors = useThemeColors()
  // The second half of AuthGate (app/_layout.tsx). A registered captain who isn't
  // approved yet belongs on the status screen, so for them login doesn't exist: a
  // pending login swaps login for status, and a cold launch opens on status. The
  // stack lands on its first available screen, so the order below matters. Status
  // and the register wizard stay reachable for everyone: a 403 login (no session)
  // shows status with ?forbidden=1, and the vehicle step stores a pending session
  // mid-wizard, which must not pull the captain out before the documents step.
  const isPendingLike = useAuthStore(selectIsPendingLike)
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={!isPendingLike}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Screen name="status" />
      <Stack.Screen name="register" />
    </Stack>
  )
}
