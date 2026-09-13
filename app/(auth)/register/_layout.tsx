// app/(auth)/register/_layout.tsx
import { Stack } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'

export default function RegisterLayout() {
  const colors = useThemeColors()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      {/* The car picker is a FULL-SCREEN route, not a sheet: 141 makes and up to
          52 models per make need the whole screen plus a keyboard. Presented
          modally so it reads as a detour off the vehicle step rather than a
          fourth wizard step — the wizard stays "3 of 3". Every other route in
          this group keeps the group defaults (declaring one screen here does not
          undeclare the rest). */}
      <Stack.Screen name="car-picker" options={{ presentation: 'modal' }} />
    </Stack>
  )
}
