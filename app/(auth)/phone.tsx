import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, I18nManager } from 'react-native'
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
import { requestOtp } from '@/services/captain-auth'
import { apiErrorKey } from '@/lib/api'

const phoneSchema = z.object({
  phone: z.string().regex(/^07\d{9}$/, 'auth.phoneInvalid'),
})

type PhoneForm = z.infer<typeof phoneSchema>

const isRTL = I18nManager.isRTL

export default function PhoneScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [apiError, setApiError] = useState<string | null>(null)

  const { control, handleSubmit, formState: { errors, isValid } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: (phone: string) => requestOtp(phone),
    onMutate: () => setApiError(null),
    onSuccess: (_, phone) => {
      router.push({ pathname: '/(auth)/otp', params: { phone } })
    },
    onError: (err) => setApiError(t(apiErrorKey(err, 'auth.otpSendFailed'))),
  })

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
            paddingBottom: Spacing.xl * 2.2,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}
        >
          {/* Decorative blobs */}
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
              top: 60,
              left: -20,
              width: 90,
              height: 90,
              borderRadius: 45,
              backgroundColor: colors.accent,
              opacity: 0.18,
            }}
          />

          {/* Logo */}
          <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Image
              source={require('@/assets/images/logo-white.png')}
              style={{ width: 96, height: 32 }}
              contentFit="contain"
            />
          </View>

          {/* Title block */}
          <View style={{ gap: Spacing.sm, marginTop: Spacing.xl * 1.5 }}>
            <Text
              style={{
                ...Typography['heading-lg'],
                color: colors.onTint,
                fontSize: 30,
                lineHeight: 36,
                letterSpacing: -0.5,
              }}
            >
              {t('captain.auth.phoneTitle')}
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
              {t('captain.auth.phoneSubtitle')}
            </Text>
          </View>
        </View>

        {/* Form card — overlaps hero */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: Spacing.xl,
            marginTop: -Spacing.xl,
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
              boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.08)',
            }}
          >
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, value } }) => (
                <Input
                  label={t('auth.phoneTitle')}
                  value={value}
                  onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
                  keyboardType="phone-pad"
                  placeholder={t('auth.phonePlaceholder')}
                  maxLength={11}
                  numeric
                  autoFocus
                  leading={
                    // The phone field reads LTR in both languages: flag + "+964" on the
                    // left, divider on the right, digits after it. Pinned LTR (not flipped
                    // in RTL) so the country code sits next to the LTR number coherently.
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingRight: Spacing.sm,
                        borderRightWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>🇮🇶</Text>
                      <Text
                        style={{
                          ...Typography.body,
                          color: colors.text,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        +964
                      </Text>
                    </View>
                  }
                  error={errors.phone ? t(errors.phone.message ?? '') : undefined}
                />
              )}
            />

            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: Spacing.sm,
              }}
            >
              <Icon name="shield-checkmark" size={16} color={colors.success} />
              <Text
                style={{
                  ...Typography['caption-sm'],
                  color: colors.subtle,
                  flex: 1,
                  fontStyle: 'normal',
                }}
              >
                {t('auth.phoneSubtitle')}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <FormError message={apiError} />

          <Button
            label={t('auth.sendOtp')}
            loading={mutation.isPending}
            disabled={!isValid}
            onPress={handleSubmit((v) => mutation.mutate(v.phone))}
            trailing={
              <Icon
                name={isRTL ? 'arrow-back' : 'arrow-forward'}
                size={18}
                color={colors.onTint}
              />
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
