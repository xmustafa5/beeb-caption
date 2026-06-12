import { useEffect, useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, I18nManager } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
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
import { requestOtp, verifyCaptainOtp } from '@/services/captain-auth'
import { useRegistrationStore } from '@/store/registration-store'
import { parseApiError, apiErrorKey } from '@/lib/api'
import { useAuthStore } from '@/store/auth-store'

const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'auth.otpInvalid'),
})

type OtpForm = z.infer<typeof otpSchema>

const isRTL = I18nManager.isRTL
const RESEND_SECONDS = 30

export default function OtpScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { phone } = useLocalSearchParams<{ phone: string }>()

  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  const { control, handleSubmit, formState: { errors, isValid }, watch } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
    mode: 'onChange',
  })

  const code = watch('code')

  const mutation = useMutation({
    mutationFn: (c: string) => verifyCaptainOtp(phone, c),
    onMutate: () => setApiError(null),
    onSuccess: (res) => {
      if (res.kind === 'authed') {
        // Approved OR pending — both get a token now. Route on captain.status.
        useAuthStore.getState().setSession(res.token, res.captain)
        if (res.captain.status === 'approved') {
          router.replace('/(tabs)')
        } else {
          router.replace('/(auth)/status')
        }
      } else if (res.kind === 'forbidden') {
        // 403 = rejected or blocked (no token). Tell the status screen so it shows
        // the forbidden UI instead of the default pending view.
        router.replace({ pathname: '/(auth)/status', params: { forbidden: '1' } })
      } else {
        // 404 — unregistered. Seed the draft phone and start the wizard.
        useRegistrationStore.getState().setPhone(phone)
        router.replace('/(auth)/register/personal')
      }
    },
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork
        ? 'common.networkError'
        : info.status === 401
          ? 'captain.auth.otpWrong'
          : info.status === 429
            ? 'common.rateLimited'
            : 'captain.auth.otpVerifyFailed'
      setApiError(t(key))
    },
  })

  const resendMutation = useMutation({
    mutationFn: () => requestOtp(phone),
    onMutate: () => setApiError(null),
    onSuccess: () => setSecondsLeft(RESEND_SECONDS),
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

          {/* Top bar: back + logo */}
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              hitSlop={12}
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon
                name={isRTL ? 'arrow-forward' : 'arrow-back'}
                size={20}
                color={colors.onTint}
              />
            </TouchableOpacity>
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
              {t('auth.otpTitle')}
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
              {t('auth.otpSubtitle', { phone })}
            </Text>
          </View>
        </View>

        {/* Card */}
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
              name="code"
              render={({ field: { onChange, value } }) => (
                <>
                  <Input
                    value={value}
                    onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    placeholder={t('auth.otpPlaceholder')}
                    maxLength={6}
                    error={errors.code ? t(errors.code.message ?? '') : undefined}
                    autoFocus
                  />
                  <CodeBoxes value={value} colors={colors} />
                </>
              )}
            />

            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
                {secondsLeft > 0
                  ? `${t('auth.resend')} · ${secondsLeft}s`
                  : t('auth.resend')}
              </Text>
              <TouchableOpacity
                onPress={() => resendMutation.mutate()}
                disabled={secondsLeft > 0 || resendMutation.isPending}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Text
                  style={{
                    ...Typography['body-md'],
                    color: secondsLeft > 0 ? colors.muted : colors.tint,
                    fontFamily: 'Poppins_600SemiBold',
                  }}
                >
                  {t('auth.resend')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <FormError message={apiError} />

          <Button
            label={t('auth.verify')}
            loading={mutation.isPending}
            disabled={!isValid || code.length !== 6}
            onPress={handleSubmit((v) => mutation.mutate(v.code))}
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

interface CodeBoxesProps {
  value: string
  colors: ReturnType<typeof useThemeColors>
}

function CodeBoxes({ value, colors }: CodeBoxesProps) {
  const digits = value.split('')
  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        gap: Spacing.sm,
        justifyContent: 'space-between',
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const filled = !!digits[i]
        const active = digits.length === i
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 12,
              borderCurve: 'continuous',
              borderWidth: 1.5,
              borderColor: active ? colors.tint : filled ? colors.border : colors.muted,
              backgroundColor: filled ? colors.surface : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                ...Typography['heading-md'],
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {digits[i] ?? ''}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
