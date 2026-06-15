import { useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { AuthScaffold, PasswordField, PhoneField, authIsRTL as isRTL } from '@/components/auth/auth-scaffold'
import { loginCaptain } from '@/services/captain-auth'
import { parseApiError } from '@/lib/api'
import { toAsciiDigits } from '@/lib/digits'
import { useAuthStore } from '@/store/auth-store'
import { useRegistrationStore } from '@/store/registration-store'

const schema = z.object({
  phone: z.string().regex(/^0?7\d{9}$/, 'auth.phoneInvalid'),
  password: z.string().min(1, 'captain.auth.passwordRequired'),
})
type FormData = z.infer<typeof schema>

export default function CaptainLoginScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ phone?: string }>()
  const [apiError, setApiError] = useState<string | null>(null)

  const prefilledPhone = (() => {
    const p = params.phone ?? ''
    if (!p) return ''
    const local = p.startsWith('964') ? p.slice(3) : p
    return local.startsWith('0') ? local : `0${local}`
  })()

  const { control, handleSubmit, getValues, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { phone: prefilledPhone, password: '' },
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: (v: FormData) => loginCaptain(v.phone, v.password),
    onMutate: () => setApiError(null),
    onSuccess: (res) => {
      if (res.kind === 'authed') {
        useAuthStore.getState().setSession(res.token, res.captain)
        router.replace(res.captain.status === 'approved' ? '/(tabs)' : '/(auth)/status')
      } else if (res.kind === 'forbidden') {
        // 403 — registered but rejected or blocked (no token, no captain record).
        // Pass forbidden=1 so the status screen shows the "not approved — contact
        // support" UI instead of the default "pending, log in" view (which would
        // loop straight back here).
        router.replace({ pathname: '/(auth)/status', params: { forbidden: '1' } })
      } else {
        // 404/500 — no captain for this phone. Seed the draft and start register.
        useRegistrationStore.getState().setPhone(getValues('phone'))
        router.replace('/(auth)/register/account')
      }
    },
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork
        ? 'common.networkError'
        : info.status === 401
          ? 'captain.auth.invalidCredentials'
          : info.status === 429
            ? 'captain.auth.tooManyAttempts'
            : 'captain.auth.loginFailed'
      setApiError(t(key))
    },
  })

  return (
    <AuthScaffold title={t('captain.auth.loginTitle')} subtitle={t('captain.auth.loginSubtitle')} showBack={false}>
      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, value } }) => (
          <PhoneField
            label={t('auth.phone')}
            value={value}
            onChangeText={(v) => onChange(toAsciiDigits(v).replace(/\D/g, ''))}
            placeholder={t('auth.phonePlaceholder')}
            autoFocus
            error={errors.phone ? t(errors.phone.message ?? '') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <PasswordField
            label={t('auth.password')}
            value={value}
            onChangeText={onChange}
            placeholder={t('auth.passwordPlaceholder')}
            error={errors.password ? t(errors.password.message ?? '') : undefined}
          />
        )}
      />

      <FormError message={apiError} />

      <Button
        label={t('captain.auth.login')}
        loading={mutation.isPending}
        disabled={!isValid}
        onPress={handleSubmit((v) => mutation.mutate(v))}
        trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: Spacing.sm }}>
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
          {t('captain.auth.noAccount')}
        </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/register/account')} activeOpacity={0.7} hitSlop={8}>
          <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
            {t('captain.auth.register')}
          </Text>
        </TouchableOpacity>
      </View>
    </AuthScaffold>
  )
}
