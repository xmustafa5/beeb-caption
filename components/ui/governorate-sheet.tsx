import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectSheet } from '@/components/ui/select-sheet'
import type { OptionSheetRef } from '@/components/ui/option-sheet'
import { GOVERNORATES, type Governorate } from '@/lib/governorates'

interface GovernorateSheetProps {
  selected: Governorate | null | undefined
  onSelect: (governorate: Governorate) => void
}

/** Scrolling list of every governorate. Opened through its ref, like the other sheets. */
export const GovernorateSheet = forwardRef<OptionSheetRef, GovernorateSheetProps>(function GovernorateSheet(
  { selected, onSelect },
  ref,
) {
  const { t } = useTranslation()
  return (
    <SelectSheet
      ref={ref}
      title={t('governorates.label')}
      options={GOVERNORATES.map((g) => ({ value: g, label: t(`governorates.names.${g}`) }))}
      selected={selected ?? ''}
      onSelect={(value) => onSelect(value as Governorate)}
    />
  )
})
