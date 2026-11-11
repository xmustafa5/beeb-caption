import { Stack } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { selectIsPendingLike, selectNeedsDocuments, useAuthStore } from '@/store/auth-store'

export default function AuthLayout() {
  const colors = useThemeColors()
  // The second half of AuthGate (app/_layout.tsx): the session decides which
  // (auth) screens EXIST, and the stack lands on the first one that does, so the
  // order below matters. Nobody calls router.replace() for these moves: storing
  // the session is the navigation.
  //
  //   no session              login, status (a 403 login shows it with
  //                           ?forbidden=1) and the register wizard
  //   pending, documents owed documents ONLY. The vehicle step creates the
  //                           account and stores this session, which drops the
  //                           wizard and lands here; so does every later launch,
  //                           until the captain submits. Before this guard a
  //                           captain who left the app mid-upload came back to
  //                           "waiting for approval" with nothing uploaded.
  //   pending / rejected /    status (login is gone: they are already signed in)
  //   blocked
  const isPendingLike = useAuthStore(selectIsPendingLike)
  const needsDocuments = useAuthStore(selectNeedsDocuments)
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
      <Stack.Protected guard={needsDocuments}>
        {/* Nothing to go back to: the wizard behind it is gone with its draft. */}
        <Stack.Screen name="documents" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!needsDocuments}>
        <Stack.Screen name="status" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  )
}
