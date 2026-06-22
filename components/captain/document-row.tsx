// components/captain/document-row.tsx
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { DocType } from '@/services/captain-documents'

export type DocState = 'empty' | 'uploading' | 'uploaded' | 'failed'

const ICONS: Record<DocType, React.ComponentProps<typeof Icon>['name']> = {
  driver_license: 'card-outline',
  car_registration: 'document-text-outline',
  captain_selfie: 'camera-outline',
  national_id_front: 'id-card-outline',
  national_id_back: 'id-card-outline',
}

interface DocumentRowProps {
  docType: DocType
  state: DocState
  onPress: () => void
}

export function DocumentRow({ docType, state, onPress }: DocumentRowProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()

  const statusColor =
    state === 'uploaded' ? colors.success
    : state === 'failed' ? colors.destructive
    : state === 'uploading' ? colors.tint
    : colors.subtle

  const statusText =
    state === 'uploaded' ? t('captain.documents.uploaded')
    : state === 'failed' ? t('captain.documents.failed')
    : state === 'uploading' ? t('captain.documents.uploading')
    : t('captain.documents.tapToAdd')

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={state === 'uploading'}
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: state === 'empty' ? colors.border : statusColor,
        borderStyle: state === 'empty' ? 'dashed' : 'solid',
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: Spacing.md + 2,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          borderCurve: 'continuous',
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={ICONS[docType]} size={20} color={colors.subtle} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', textAlign: 'left' }}>
          {t(`captain.documents.${docType}`)}
        </Text>
        <Text style={{ ...Typography['caption-sm'], color: statusColor, fontStyle: 'normal', textAlign: 'left' }}>
          {statusText}
        </Text>
      </View>
      {state === 'uploading' ? (
        <ActivityIndicator color={colors.tint} />
      ) : (
        <Icon
          name={
            state === 'uploaded' ? 'checkmark-circle'
            : state === 'failed' ? 'refresh'
            : 'add'
          }
          size={22}
          color={statusColor}
        />
      )}
    </TouchableOpacity>
  )
}
