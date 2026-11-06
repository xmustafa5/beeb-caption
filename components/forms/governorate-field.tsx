import { useRef } from 'react'
import { Keyboard } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Icon } from '@/components/ui/icon'
import { SelectField } from '@/components/forms/select-field'
import { GovernorateSheet } from '@/components/ui/governorate-sheet'
import type { OptionSheetRef } from '@/components/ui/option-sheet'
import type { Governorate } from '@/lib/governorates'

interface GovernorateFieldProps {
  value: Governorate | undefined
  onChange: (governorate: Governorate) => void
  error?: string
}

/** The sign-up form's governorate picker. */
export function GovernorateField({ value, onChange, error }: GovernorateFieldProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const sheetRef = useRef<OptionSheetRef>(null)
  return (
    <>
      <SelectField
        label={t('governorates.label')}
        value={value ? t(`governorates.names.${value}`) : ''}
        placeholder={t('governorates.placeholder')}
        onPress={() => {
          // A focused text input would otherwise keep the keyboard up over the sheet.
          Keyboard.dismiss()
          sheetRef.current?.present()
        }}
        leading={<Icon name="location-outline" size={18} color={colors.subtle} />}
        error={error}
      />
      <GovernorateSheet ref={sheetRef} selected={value} onSelect={onChange} />
    </>
  )
}
