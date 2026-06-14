// app/(auth)/register/personal.tsx
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { useRegistrationStore } from '@/store/registration-store'
import type { CaptainGender } from '@/lib/captain-mappers'

const isRTL = I18nManager.isRTL

const schema = z.object({
  name: z.string().min(2, 'captain.register.nameInvalid'),
  nameAr: z.string().min(2, 'captain.register.nameArInvalid'),
  gender: z.enum(['male', 'female']),
  nationalId: z.string().optional(),
})
type Form = z.infer<typeof schema>

export default function PersonalStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const draft = useRegistrationStore()

  const { control, handleSubmit, watch, setValue, formState: { errors, isValid } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: draft.name, nameAr: draft.nameAr, gender: draft.gender, nationalId: draft.nationalId },
    mode: 'onChange',
  })
  const gender = watch('gender')

  const onNext = (v: Form) => {
    draft.setStep1({ name: v.name, nameAr: v.nameAr, gender: v.gender, nationalId: v.nationalId ?? '' })
    router.push('/(auth)/register/vehicle')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View
          style={{
            paddingTop: insets.top + Spacing.xl,
            paddingHorizontal: Spacing.xl,
            paddingBottom: Spacing.lg,
            gap: Spacing.lg,
          }}
        >
          <WizardProgress current={1} total={3} />
          <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.register.personalTitle')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg }}>
            <Controller control={control} name="name" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.name')} value={value} onChangeText={onChange} autoCapitalize="words"
                error={errors.name ? t(errors.name.message ?? '') : undefined} />
            )} />
            <Controller control={control} name="nameAr" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.nameAr')} value={value} onChangeText={onChange}
                error={errors.nameAr ? t(errors.nameAr.message ?? '') : undefined} />
            )} />
            <View style={{ gap: Spacing.sm }}>
              <Text style={{ ...Typography['input-label'], color: colors.subtle, textAlign: isRTL ? 'right' : 'left' }}>{t('captain.register.gender')}</Text>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
                {(['male', 'female'] as CaptainGender[]).map((g) => {
                  const active = gender === g
                  return (
                    <TouchableOpacity key={g} onPress={() => setValue('gender', g, { shouldValidate: true })} activeOpacity={0.85}
                      style={{ flex: 1, paddingVertical: Spacing.md + 2, borderRadius: 14, borderCurve: 'continuous',
                        backgroundColor: active ? colors.tint : colors.surface, borderWidth: 1.5,
                        borderColor: active ? colors.tint : colors.border, alignItems: 'center', gap: 4 }}>
                      <Icon name={g === 'male' ? 'male' : 'female'} size={20} color={active ? colors.onTint : colors.subtle} />
                      <Text style={{ ...Typography['caption-sm'], color: active ? colors.onTint : colors.text, fontStyle: 'normal',
                        fontFamily: active ? 'Poppins_600SemiBold' : undefined }}>
                        {t(g === 'male' ? 'captain.register.genderMale' : 'captain.register.genderFemale')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>{t('captain.register.genderNote')}</Text>
            </View>
            <Controller control={control} name="nationalId" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.nationalId')} value={value ?? ''} onChangeText={onChange} keyboardType="number-pad" />
            )} />
          </View>

          <View style={{ flex: 1 }} />
          <Button label={t('captain.register.next')} disabled={!isValid} onPress={handleSubmit(onNext)}
            trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
