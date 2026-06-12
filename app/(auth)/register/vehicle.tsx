// app/(auth)/register/vehicle.tsx
import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { useRegistrationStore } from '@/store/registration-store'
import { registerCaptain } from '@/services/captain-auth'
import { getCities } from '@/services/cities'
import { useAuthStore } from '@/store/auth-store'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL

const schema = z.object({
  carMake: z.string().min(1, 'captain.register.carMakeInvalid'),
  carModel: z.string().min(1, 'captain.register.carModelInvalid'),
  carColor: z.string().optional(),
  carPlate: z.string().min(2, 'captain.register.carPlateInvalid'),
})
type Form = z.infer<typeof schema>

export default function VehicleStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const draft = useRegistrationStore()
  const [apiError, setApiError] = useState<string | null>(null)

  const cities = useQuery({ queryKey: ['cities'], queryFn: getCities, staleTime: 1000 * 60 * 10 })

  const { control, handleSubmit, formState: { errors, isValid } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { carMake: draft.carMake, carModel: draft.carModel, carColor: draft.carColor, carPlate: draft.carPlate },
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: (v: Form) => {
      const cityId = draft.cityId || cities.data?.[0]?.id || ''
      draft.setStep2({ carMake: v.carMake, carModel: v.carModel, carColor: v.carColor ?? '', carPlate: v.carPlate, cityId })
      return registerCaptain({
        phone: draft.phone,
        name: draft.name,
        nameAr: draft.nameAr,
        gender: draft.gender,
        nationalId: draft.nationalId || null,
        carMake: v.carMake,
        carModel: v.carModel,
        carColor: v.carColor || null,
        carPlate: v.carPlate,
        cityId,
      })
    },
    onMutate: () => setApiError(null),
    onSuccess: (captain) => {
      // Register issues NO token. Hold the captain id as pending; the documents
      // step mints the token (re-verify) before uploads. See plan flow-change note.
      useAuthStore.getState().setPending(captain.id)
      router.replace('/(auth)/register/documents')
    },
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork ? 'common.networkError'
        : info.status === 409 ? 'captain.register.duplicate'
        : info.status === 429 ? 'common.rateLimited'
        : 'captain.register.registerFailed'
      setApiError(t(key))
    },
  })

  const noCity = cities.isError
  const submitDisabled = !isValid || mutation.isPending || cities.isLoading || noCity

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}>
        <View style={{ paddingTop: insets.top + Spacing.xl, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.lg }}>
          <WizardProgress current={2} total={3} />
          <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.register.vehicleTitle')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg }}>
            <Controller control={control} name="carMake" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carMake')} value={value} onChangeText={onChange}
                error={errors.carMake ? t(errors.carMake.message ?? '') : undefined} />
            )} />
            <Controller control={control} name="carModel" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carModel')} value={value} onChangeText={onChange}
                error={errors.carModel ? t(errors.carModel.message ?? '') : undefined} />
            )} />
            <Controller control={control} name="carColor" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carColor')} value={value ?? ''} onChangeText={onChange} />
            )} />
            <Controller control={control} name="carPlate" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carPlate')} value={value} onChangeText={onChange} autoCapitalize="characters"
                error={errors.carPlate ? t(errors.carPlate.message ?? '') : undefined} />
            )} />
          </View>

          <View style={{ flex: 1 }} />
          {noCity && <FormError message={t('captain.register.citiesFailed')} />}
          <FormError message={apiError} />
          <Button label={t('captain.register.submit')} loading={mutation.isPending} disabled={submitDisabled}
            onPress={handleSubmit((v) => mutation.mutate(v))}
            trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
