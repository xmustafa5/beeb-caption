// app/(auth)/register/account.tsx — wizard step 1: phone → OTP → password.
// Mints a register-purpose ticket and stashes phone+ticket+password in the draft,
// then advances to the personal step. (Vehicle step submits /captains/register.)
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, I18nManager } from 'react-native'
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
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { PasswordField, PhoneField, OtpBoxes } from '@/components/auth/auth-scaffold'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { sendOtp, verifyOtp } from '@/services/captain-auth'
import { useRegistrationStore } from '@/store/registration-store'
import { parseApiError } from '@/lib/api'
import { toAsciiDigits } from '@/lib/digits'

const isRTL = I18nManager.isRTL
type Step = 'phone' | 'otp' | 'password'
const RESEND_SECONDS = 30

const phoneSchema = z.object({ phone: z.string().regex(/^0?7\d{9}$/, 'auth.phoneInvalid') })
const passwordSchema = z.object({ password: z.string().min(8, 'captain.auth.passwordTooShort') })
type PhoneForm = z.infer<typeof phoneSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export default function AccountStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const draft = useRegistrationStore()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState(draft.phone)
  const [ticket, setTicket] = useState('')
  const [code, setCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [apiError, setApiError] = useState<string | null>(null)
  const codeRef = useRef<TextInput>(null)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: draft.phone },
    mode: 'onChange',
  })
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
    mode: 'onChange',
  })

  const sendMutation = useMutation({
    mutationFn: (p: string) => sendOtp(p),
    onMutate: () => setApiError(null),
    onSuccess: (_, p) => { setPhone(p); setCode(''); setStep('otp'); setSecondsLeft(RESEND_SECONDS) },
    onError: (err) => {
      // otp/send: 429 = rate-limited; 400 ambiguous (invalid phone / limit) → generic.
      const info = parseApiError(err)
      setApiError(t(info.isNetwork ? 'common.networkError' : info.status === 429 ? 'auth.otpRateLimited' : 'auth.otpSendFailed'))
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (c: string) => verifyOtp(phone, c),
    onMutate: () => setApiError(null),
    onSuccess: ({ ticket: tk }) => { setTicket(tk); setStep('password') },
    onError: (err) => {
      const info = parseApiError(err)
      setApiError(t(info.isNetwork ? 'common.networkError' : info.status === 401 ? 'captain.auth.otpWrong' : info.status === 429 ? 'common.rateLimited' : 'captain.auth.otpVerifyFailed'))
    },
  })

  const resendMutation = useMutation({
    mutationFn: () => sendOtp(phone),
    onMutate: () => setApiError(null),
    onSuccess: () => { setCode(''); setSecondsLeft(RESEND_SECONDS) },
    onError: (err) => setApiError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'auth.otpSendFailed')),
  })

  const onContinuePassword = (v: PasswordForm) => {
    // Stash everything the register call needs, then advance to personal details.
    draft.setAccount({ phone, ticket, password: v.password })
    router.push('/(auth)/register/personal')
  }

  const onBack = () => {
    setApiError(null)
    if (step === 'phone') router.back()
    else if (step === 'otp') setStep('phone')
    else setStep('otp')
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}>
        <View style={{ paddingTop: insets.top + Spacing.xl, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.lg }}>
          <WizardProgress current={1} total={3} />
          <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: isRTL ? 'right' : 'left' }}>
            {step === 'phone' ? t('captain.auth.accountTitle') : step === 'otp' ? t('auth.otpTitle') : t('captain.auth.setPasswordTitle')}
          </Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
            {step === 'phone' ? t('captain.auth.accountSubtitle') : step === 'otp' ? t('auth.otpSubtitle', { phone }) : t('captain.auth.setPasswordSubtitle')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg }}>
            {step === 'phone' && (
              <Controller
                control={phoneForm.control}
                name="phone"
                render={({ field: { onChange, value } }) => (
                  <PhoneField
                    label={t('auth.phone')}
                    value={value}
                    onChangeText={(v) => onChange(toAsciiDigits(v).replace(/\D/g, ''))}
                    placeholder={t('auth.phonePlaceholder')}
                    autoFocus
                    error={phoneForm.formState.errors.phone ? t(phoneForm.formState.errors.phone.message ?? '') : undefined}
                  />
                )}
              />
            )}

            {step === 'otp' && (
              <>
                <TouchableOpacity activeOpacity={1} onPress={() => codeRef.current?.focus()}>
                  <OtpBoxes value={code} />
                </TouchableOpacity>
                <TextInput
                  ref={codeRef}
                  value={code}
                  onChangeText={(v) => setCode(toAsciiDigits(v).replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm }}>
                  {secondsLeft > 0 ? (
                    <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
                      {`${t('auth.resend')} · ${secondsLeft}s`}
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={() => resendMutation.mutate()} disabled={resendMutation.isPending} activeOpacity={0.7} hitSlop={8}>
                      <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
                        {t('auth.resend')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {step === 'password' && (
              <Controller
                control={passwordForm.control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <PasswordField
                    label={t('auth.password')}
                    value={value}
                    onChangeText={onChange}
                    placeholder={t('auth.passwordPlaceholder')}
                    autoFocus
                    error={passwordForm.formState.errors.password ? t(passwordForm.formState.errors.password.message ?? '') : undefined}
                  />
                )}
              />
            )}
          </View>

          <View style={{ flex: 1 }} />
          <FormError message={apiError} />

          {step === 'phone' && (
            <Button label={t('auth.sendOtp')} loading={sendMutation.isPending} disabled={!phoneForm.formState.isValid}
              onPress={phoneForm.handleSubmit((v) => sendMutation.mutate(v.phone))}
              trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
          )}
          {step === 'otp' && (
            <Button label={t('auth.verify')} loading={verifyMutation.isPending} disabled={code.length !== 6}
              onPress={() => verifyMutation.mutate(code)}
              trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
          )}
          {step === 'password' && (
            // Gate on the live field value, not formState.isValid: the password
            // field mounts only on this step, and RHF's isValid (mode: onChange)
            // lags a render behind a late-registered field's first async (zod)
            // validation — so the button stayed disabled until you bounced back to
            // the OTP step and returned. handleSubmit still runs the full zod check,
            // so an <8-char password is rejected with the inline error here.
            <Button label={t('captain.register.next')} disabled={passwordForm.watch('password').length < 8}
              onPress={passwordForm.handleSubmit(onContinuePassword)}
              trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
          )}

          {/* Back control mirrors the wizard's per-step back. */}
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={{ alignSelf: 'center', paddingVertical: Spacing.sm }}>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
              {t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
