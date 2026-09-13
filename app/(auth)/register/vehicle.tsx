// app/(auth)/register/vehicle.tsx
import { useEffect, useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable, TouchableOpacity, I18nManager } from 'react-native'
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
import { toAsciiDigits } from '@/lib/digits'

// Stable for the session — forceRTL changes require a restart anyway
const isRTL = I18nManager.isRTL

// Model-year bounds. The backend rejects anything outside 1970..=2100 with a 400;
// we tighten the upper end to "next year" because next-model-year cars do ship
// early and a 2087 typo must not sail through. Evaluated once per module load,
// which is fine for an app process that never outlives a calendar year of use.
const MIN_CAR_YEAR = 1970
const MAX_CAR_YEAR = new Date().getFullYear() + 1

const schema = z
  .object({
    // Catalog selection — written by the car-picker route via the draft store.
    carBrandId: z.string(),
    carModelId: z.string(),
    // Free-text fallback, revealed by "Can't find your car?". Optional at the
    // field level; the superRefine below enforces "picker OR both text fields".
    carMake: z.string(),
    carModel: z.string(),
    carYear: z.string(),
    carColor: z.string().optional(),
    carPlate: z.string().min(2, 'captain.register.carPlateInvalid'),
  })
  .superRefine((v, ctx) => {
    // A car identity is REQUIRED, and there are exactly two legal shapes for it:
    // a resolved catalog pair (gradeable — star 1..3) or free text (capped at
    // star 2 server-side). Anything less and Submit stays disabled.
    const picked = !!v.carBrandId && !!v.carModelId
    const typed = v.carMake.trim().length > 0 && v.carModel.trim().length > 0
    if (!picked && !typed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['carModel'], message: 'captain.register.carRequired' })
    }
    // Year is REQUIRED in the UI even though the API allows omitting it: no year
    // means the classifier clears no age gate, which pins the captain at star 1
    // forever (there is no vehicle-edit endpoint to fix it later).
    const year = Number(v.carYear)
    if (!/^\d{4}$/.test(v.carYear) || !Number.isInteger(year) || year < MIN_CAR_YEAR || year > MAX_CAR_YEAR) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['carYear'], message: 'captain.register.carYearInvalid' })
    }
  })
type Form = z.infer<typeof schema>

export default function VehicleStep() {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const draft = useRegistrationStore()
  const lang = i18n.language as 'en' | 'ar'
  const [apiError, setApiError] = useState<string | null>(null)
  // Free-text escape hatch. Open it automatically for a draft that already holds
  // typed-in text but no catalog ids (a captain who came back to this step).
  const [manual, setManual] = useState(!draft.carBrandId && !!draft.carMake)

  const cities = useQuery({ queryKey: ['cities'], queryFn: getCities, staleTime: 1000 * 60 * 10 })

  const { control, handleSubmit, setValue, clearErrors, formState: { errors, isValid } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      carBrandId: draft.carBrandId,
      carModelId: draft.carModelId,
      carMake: draft.carMake,
      carModel: draft.carModel,
      carYear: draft.carYear,
      carColor: draft.carColor,
      carPlate: draft.carPlate,
    },
    mode: 'onChange',
  })

  // The picker is a separate route and hands its result back through the draft
  // store (not router params), so mirror the store into the form when it changes.
  const { carBrandId, carModelId, carMake: draftMake, carModel: draftModel } = draft
  useEffect(() => {
    setValue('carBrandId', carBrandId, { shouldValidate: true })
    setValue('carModelId', carModelId, { shouldValidate: true })
    if (carBrandId && carModelId) {
      // Catalog path: car_make / car_model are still REQUIRED by the API, so keep
      // them populated from the chosen entry's English names.
      setValue('carMake', draftMake, { shouldValidate: true })
      setValue('carModel', draftModel, { shouldValidate: true })
      setManual(false)
    }
  }, [carBrandId, carModelId, draftMake, draftModel, setValue])

  const picked = !!draft.carBrandId && !!draft.carModelId
  const carLabel = picked ? `${draft.carBrandName} ${draft.carModelName}`.trim() : ''
  // The "a car is required" issue is raised at path ['carModel'], but the carModel
  // <Input> that renders it only exists on the free-text path. On the picker path
  // the tappable car field owns that error — border AND message read this one
  // expression so the red outline can never appear without its explanation.
  const carError = !manual && errors.carModel ? t(errors.carModel.message ?? '') : null

  const onClearPicked = () => {
    draft.setCar({ carBrandId: '', carModelId: '', carBrandName: '', carModelName: '', carMake: '', carModel: '' })
    // Don't validate here: emptying the car is exactly what the captain asked for,
    // so flagging it red the instant they tap "change car" scolds them for nothing.
    // isValid still drops, because the draft-id change re-runs the effect above with
    // shouldValidate — the resolver's global result is what feeds isValid.
    setValue('carMake', '', { shouldValidate: false })
    setValue('carModel', '', { shouldValidate: false })
    clearErrors(['carMake', 'carModel'])
  }

  const mutation = useMutation({
    mutationFn: (v: Form) => {
      const cityId = draft.cityId || cities.data?.[0]?.id || ''
      // On the fallback path the typed text is the car identity and NO catalog
      // ids are sent (the server then caps the grade at star 2).
      const brandId = manual ? '' : v.carBrandId
      const modelId = manual ? '' : v.carModelId
      const year = Number(v.carYear)
      draft.setStep2({
        carMake: v.carMake,
        carModel: v.carModel,
        carColor: v.carColor ?? '',
        carPlate: v.carPlate,
        cityId,
        carBrandId: brandId,
        carModelId: modelId,
        carBrandName: brandId ? draft.carBrandName : '',
        carModelName: modelId ? draft.carModelName : '',
        carYear: v.carYear,
      })
      return registerCaptain({
        phone: draft.phone,
        password: draft.password,
        ticket: draft.ticket,
        name: draft.name,
        gender: draft.gender,
        nationalId: draft.nationalId || null,
        carMake: v.carMake,
        carModel: v.carModel,
        carColor: v.carColor || null,
        carPlate: v.carPlate,
        cityId,
        ...(brandId && modelId ? { carBrandId: brandId, carModelId: modelId } : {}),
        // String → int at the boundary; the draft keeps it as typed text.
        ...(Number.isInteger(year) ? { carYear: year } : {}),
      })
    },
    onMutate: () => setApiError(null),
    onSuccess: ({ captain, token }) => {
      // Register now returns a captain JWT (onboarding-scoped). Store the full
      // session so the request interceptor authenticates the document uploads,
      // then send the captain to the documents step to upload the 5 docs. The
      // captain is still PENDING — the token only authorizes docs + self-read.
      useAuthStore.getState().setSession(token, captain)
      useRegistrationStore.getState().reset()
      // onboarding=1 tells the documents step to finish on the status screen
      // (waiting-for-approval), not router.back() — which is for the profile entry.
      router.replace({ pathname: '/(auth)/register/documents', params: { onboarding: '1' } })
    },
    onError: (err) => {
      const info = parseApiError(err)
      if (info.status === 401) {
        // Register-purpose ticket expired/used — restart the account step.
        setApiError(t('captain.auth.ticketExpired'))
        router.replace('/(auth)/register/account')
        return
      }
      const key = info.isNetwork ? 'common.networkError'
        : info.status === 409 ? 'captain.register.duplicate'
        : info.status === 400 ? 'captain.register.registerFailed'
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
          {/* Still 3 of 3 — the car picker is a detour off this step, not a step. */}
          <WizardProgress current={3} total={3} />
          <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: 'left' }}>
            {t('captain.register.vehicleTitle')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg }}>
            {/* ── Car: one tappable field that opens the full-screen catalog picker ── */}
            <View style={{ gap: Spacing.xs + 1 }}>
              <Text style={{ ...Typography['input-label'], color: colors.subtle, textAlign: 'left' }}>
                {t('captain.register.car')}
              </Text>
              <Pressable
                onPress={() => router.push('/(auth)/register/car-picker')}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  // Mirrors the bordered container in components/forms/input.tsx so the
                  // form reads as one control set. native forceRTL mirrors this row in AR.
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: pressed ? colors.cardElevated : colors.surface,
                  borderWidth: 1,
                  borderColor: carError ? colors.destructive : colors.border,
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  paddingHorizontal: Spacing.lg,
                  height: 54,
                  gap: Spacing.md,
                })}
              >
                <Icon name="car-sport-outline" size={18} color={colors.subtle} />
                <Text
                  numberOfLines={1}
                  style={{ ...Typography.body, color: picked ? colors.text : colors.subtle, flex: 1, textAlign: 'left' }}
                >
                  {picked ? carLabel : t('captain.register.carPickPrompt')}
                </Text>
                {/* Chevron points toward the reading-direction end — swap glyph in AR. */}
                <Icon name={lang === 'ar' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
              </Pressable>
              {picked && (
                <TouchableOpacity onPress={onClearPicked} activeOpacity={0.7} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', textAlign: 'left' }}>
                    {t('captain.register.carChange')}
                  </Text>
                </TouchableOpacity>
              )}
              {carError && (
                <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'left' }}>
                  {carError}
                </Text>
              )}
            </View>

            {/* ── Free-text fallback: the captain's car may simply not be in the
                 catalog. This path sends NO catalog ids (server caps it at star 2)
                 but it must exist, or an unlisted car cannot register at all. ── */}
            {!picked && !manual && (
              <TouchableOpacity onPress={() => setManual(true)} activeOpacity={0.7} accessibilityRole="button">
                <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', textAlign: 'left' }}>
                  {t('captain.register.carNotListed')}
                </Text>
              </TouchableOpacity>
            )}
            {!picked && manual && (
              <>
                <Controller control={control} name="carMake" render={({ field: { onChange, value } }) => (
                  <Input label={t('captain.register.carMake')} value={value} onChangeText={onChange}
                    error={errors.carMake ? t(errors.carMake.message ?? '') : undefined} />
                )} />
                <Controller control={control} name="carModel" render={({ field: { onChange, value } }) => (
                  <Input label={t('captain.register.carModel')} value={value} onChangeText={onChange}
                    error={errors.carModel ? t(errors.carModel.message ?? '') : undefined} />
                )} />
              </>
            )}

            {/* ── Model year (REQUIRED) ── Arabic-Indic digits from the AR keyboard are
                 normalized to ASCII before the \D strip, exactly like the national-ID
                 field; `numeric` pins the field LTR so the year isn't reordered in RTL. */}
            <Controller control={control} name="carYear" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carYear')} value={value}
                onChangeText={(v) => onChange(toAsciiDigits(v).replace(/\D/g, ''))}
                keyboardType="number-pad" maxLength={4} numeric
                placeholder={String(MAX_CAR_YEAR - 1)}
                error={errors.carYear ? t(errors.carYear.message ?? '') : undefined} />
            )} />
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
              {t('captain.register.carYearHint')}
            </Text>

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
