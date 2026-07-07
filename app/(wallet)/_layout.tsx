// app/(wallet)/_layout.tsx
import { Stack } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'

export default function WalletLayout() {
  const colors = useThemeColors()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  )
}
