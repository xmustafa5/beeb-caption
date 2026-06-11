// app/(trip)/[id].tsx
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

// Placeholder live-trip screen. Area 5 replaces this body with the map + leg actions.
export default function LiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="checkmark-circle" size={40} color={colors.success} />
      </View>
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
        {t('captain.trip.acceptedTitle')}
      </Text>
      <Text selectable style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
        {id}
      </Text>
      <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
        {t('captain.trip.comingSoon')}
      </Text>
      <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
    </View>
  )
}
