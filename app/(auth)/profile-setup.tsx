import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, I18nManager } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { updateProfile } from '@/services/auth'
import { apiErrorKey } from '@/lib/api'
import { useAuthStore } from '@/store/auth-store'

const profileSchema = z.object({
  name: z.string().min(2, 'auth.nameInvalid'),
  gender: z.enum(['male', 'female']),
})

type ProfileForm = z.infer<typeof profileSchema>
type SelectableGender = ProfileForm['gender']

const isRTL = I18nManager.isRTL

const GENDER_ICONS: Record<SelectableGender, React.ComponentProps<typeof Icon>['name']> = {
  male: 'male',
  female: 'female',
}

export default function ProfileSetupScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [apiError, setApiError] = useState<string | null>(null)

  const { control, handleSubmit, formState: { errors, isValid }, watch, setValue } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', gender: 'male' },
    mode: 'onChange',
  })

  const gender = watch('gender')
  const nameValue = watch('name')

  const mutation = useMutation({
    mutationFn: (v: ProfileForm) => updateProfile(v),
    onMutate: () => setApiError(null),
    onSuccess: (user) => {
      useAuthStore.getState().updateUser(user)
      router.replace('/(tabs)')
    },
    onError: (err) => setApiError(t(apiErrorKey(err, 'auth.profileSaveFailed'))),
  })

  const initial = nameValue.trim().charAt(0).toUpperCase() || '?'

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + Spacing.xl,
        }}
      >
        {/* Hero */}
        <View
          style={{
            backgroundColor: colors.tint,
            paddingTop: insets.top + Spacing.lg,
            paddingHorizontal: Spacing.xl,
            paddingBottom: Spacing.xl * 2.6,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -80,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: 'rgba(255,255,255,0.10)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: -90,
              left: -40,
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: 'rgba(255,255,255,0.07)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 70,
              left: -20,
              width: 90,
              height: 90,
              borderRadius: 45,
              backgroundColor: colors.accent,
              opacity: 0.18,
            }}
          />

          <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Image
              source={require('@/assets/images/logo-white.png')}
              style={{ width: 80, height: 26 }}
              contentFit="contain"
            />
          </View>

          <View style={{ gap: Spacing.sm, marginTop: Spacing.xl * 1.3 }}>
            <Text
              style={{
                ...Typography['heading-lg'],
                color: colors.onTint,
                fontSize: 30,
                lineHeight: 36,
                letterSpacing: -0.5,
              }}
            >
              {t('auth.profileTitle')}
            </Text>
            <Text
              style={{
                ...Typography.body,
                color: colors.onTint,
                opacity: 0.85,
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              {t('auth.profileSubtitle')}
            </Text>
          </View>
        </View>

        {/* Avatar — overlaps hero */}
        <View
          style={{
            alignItems: 'center',
            marginTop: -Spacing.xl * 2,
          }}
        >
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.card,
              borderWidth: 4,
              borderColor: colors.background,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0px 6px 18px rgba(13, 24, 42, 0.12)',
            }}
          >
            <Text
              style={{
                ...Typography['heading-lg'],
                color: colors.tint,
                fontSize: 36,
                lineHeight: 40,
              }}
            >
              {initial}
            </Text>
          </View>
        </View>

        {/* Card */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: Spacing.xl,
            marginTop: Spacing.lg,
            gap: Spacing.lg,
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 22,
              borderCurve: 'continuous',
              padding: Spacing.xl,
              gap: Spacing.lg,
              boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
            }}
          >
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <Input
                  label={t('auth.namePlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  placeholder={t('auth.namePlaceholder')}
                  error={errors.name ? t(errors.name.message ?? '') : undefined}
                  autoFocus
                  autoCapitalize="words"
                  leading={<Icon name="person-outline" size={20} color={colors.subtle} />}
                />
              )}
            />

            <View style={{ gap: Spacing.sm }}>
              <Text style={{ ...Typography['input-label'], color: colors.subtle }}>
                {t('auth.genderLabel')}
              </Text>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
                {(['male', 'female'] as SelectableGender[]).map((g) => (
                  <GenderChip
                    key={g}
                    label={t(`auth.gender${g[0].toUpperCase()}${g.slice(1)}`)}
                    icon={GENDER_ICONS[g]}
                    active={gender === g}
                    onPress={() => setValue('gender', g, { shouldValidate: true })}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <FormError message={apiError} />

          <Button
            label={t('auth.finish')}
            loading={mutation.isPending}
            disabled={!isValid}
            onPress={handleSubmit((v) => mutation.mutate(v))}
            trailing={
              <Icon name="checkmark" size={20} color={colors.onTint} />
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

interface GenderChipProps {
  label: string
  icon: React.ComponentProps<typeof Icon>['name']
  active: boolean
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
}

function GenderChip({ label, icon, active, onPress, colors }: GenderChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flex: 1,
        paddingVertical: Spacing.md + 2,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: active ? colors.tint : colors.surface,
        borderWidth: 1.5,
        borderColor: active ? colors.tint : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <Icon
        name={icon}
        size={20}
        color={active ? colors.onTint : colors.subtle}
      />
      <Text
        style={{
          ...Typography['caption-sm'],
          color: active ? colors.onTint : colors.text,
          fontStyle: 'normal',
          fontFamily: active ? 'Poppins_600SemiBold' : undefined,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}
