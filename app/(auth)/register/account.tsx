// app/(auth)/register/account.tsx — wizard step 1, in two pages:
//   details: phone + password + confirm password on ONE screen. The phone is
//            checked against existing captains as soon as it is complete, so a
//            registered captain is told here (with a way to log in) and no OTP
//            is ever sent to them.
//   otp:     the 6-digit code for that phone. Verifying it mints the
//            register-purpose ticket.
// Phone + ticket + password go into the draft, then on to the personal step.
// (The vehicle step is what calls /captains/register.)
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, ActivityIndicator, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { PasswordField, PhoneField, OtpBoxes } from '@/components/auth/auth-scaffold'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { isCaptainPhoneRegistered, sendOtp, verifyOtp } from '@/services/captain-auth'
import { useRegistrationStore } from '@/store/registration-store'
import { parseApiError } from '@/lib/api'
import { normalizePhone } from '@/lib/captain-mappers'
import { toAsciiDigits } from '@/lib/digits'

const isRTL = I18nManager.isRTL
type Step = 'details' | 'otp'
const RESEND_SECONDS = 30
const PHONE_RE = /^0?7\d{9}$/
const MIN_PASSWORD = 8
// How long one "is this phone a captain?" answer is trusted before it is asked again.
const PHONE_CHECK_STALE_MS = 30_000

const schema = z
  .object({
    phone: z.string().regex(PHONE_RE, 'auth.phoneInvalid'),
    password: z.string().min(MIN_PASSWORD, 'captain.auth.passwordTooShort'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'captain.auth.passwordMismatch', path: ['confirmPassword'] })
type Form = z.infer<typeof schema>

const phoneCheckKey = (phone: string) => ['auth', 'captain-phone-registered', normalizePhone(phone)] as const

export default function AccountStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const draft = useRegistrationStore()
  // reverify=1: the vehicle step sent the captain back because the verification
  // ticket was no longer valid. Everything they typed is still in the draft.
  const { reverify } = useLocalSearchParams<{ reverify?: string }>()

  const [step, setStep] = useState<Step>('details')
  // The phone the current OTP was sent to, and the ticket + phone of the last
  // successful verification (so coming back from the personal step and pressing
  // Continue with the same number does not ask for a second code).
  const [phone, setPhone] = useState(draft.phone)
  const [verified, setVerified] = useState<{ phone: string; ticket: string } | null>(null)
  const [code, setCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [apiError, setApiError] = useState<string | null>(reverify ? t('captain.auth.reverify') : null)
  const codeRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)
  // The last code auto-submitted, so a wrong code is not re-sent on every render.
  const autoSubmitted = useRef('')

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  const { control, handleSubmit, watch, trigger, getValues, formState: { errors, isSubmitted, touchedFields } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { phone: draft.phone, password: draft.password, confirmPassword: draft.password },
    mode: 'onChange',
  })
  const phoneValue = watch('phone')
  const passwordValue = watch('password')
  const confirmValue = watch('confirmPassword')
  const phoneComplete = PHONE_RE.test(phoneValue)

  // Live check, fired once the number is complete: the captain learns the number
  // is taken before typing a password, not after an OTP and two more screens.
  const phoneCheck = useQuery({
    queryKey: phoneCheckKey(phoneValue),
    queryFn: () => isCaptainPhoneRegistered(phoneValue),
    enabled: phoneComplete,
    staleTime: PHONE_CHECK_STALE_MS,
    retry: 1,
  })
  const phoneTaken = phoneComplete && phoneCheck.data === true
  const phoneFree = phoneComplete && phoneCheck.data === false

  const goToPersonal = (v: { phone: string; ticket: string; password: string }) => {
    draft.setAccount(v)
    router.push('/(auth)/register/personal')
  }

  const continueMutation = useMutation({
    mutationFn: async (v: Form): Promise<'taken' | 'verified' | 'sent'> => {
      // Asked again at submit: the live check may still be loading or may have
      // failed. A phone-status that is unreachable for a non-network reason does
      // not block the captain: /captains/register still rejects a duplicate.
      let taken = false
      try {
        taken = await queryClient.fetchQuery({
          queryKey: phoneCheckKey(v.phone),
          queryFn: () => isCaptainPhoneRegistered(v.phone),
          staleTime: PHONE_CHECK_STALE_MS,
        })
      } catch (err) {
        if (parseApiError(err).isNetwork) throw err
      }
      if (taken) return 'taken'
      if (verified && verified.phone === normalizePhone(v.phone)) return 'verified'
      await sendOtp(v.phone)
      return 'sent'
    },
    onMutate: () => setApiError(null),
    onSuccess: (outcome, v) => {
      if (outcome === 'taken') return // the phone field shows it, with the login link
      if (outcome === 'verified' && verified) {
        goToPersonal({ phone: v.phone, ticket: verified.ticket, password: v.password })
        return
      }
      setPhone(v.phone)
      setCode('')
      autoSubmitted.current = ''
      setSecondsLeft(RESEND_SECONDS)
      setStep('otp')
    },
    onError: (err) => {
      // otp/send: 429 = rate-limited; 400 ambiguous (invalid phone / limit) → generic.
      const info = parseApiError(err)
      setApiError(t(info.isNetwork ? 'common.networkError' : info.status === 429 ? 'auth.otpRateLimited' : 'auth.otpSendFailed'))
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (c: string) => verifyOtp(phone, c),
    onMutate: () => setApiError(null),
    onSuccess: ({ ticket }) => {
      setVerified({ phone: normalizePhone(phone), ticket })
      // Back from the personal step lands on the details page, not on a spent code.
      setStep('details')
      setCode('')
      goToPersonal({ phone, ticket, password: getValues('password') })
    },
    onError: (err) => {
      const info = parseApiError(err)
      setApiError(t(info.isNetwork ? 'common.networkError' : info.status === 401 ? 'captain.auth.otpWrong' : info.status === 429 ? 'common.rateLimited' : 'captain.auth.otpVerifyFailed'))
    },
  })
  const { mutate: verify, isPending: verifying } = verifyMutation

  // The sixth digit submits the code; no need to reach for the button.
  useEffect(() => {
    if (step !== 'otp' || code.length !== 6 || verifying || autoSubmitted.current === code) return
    autoSubmitted.current = code
    verify(code)
  }, [step, code, verifying, verify])

  const resendMutation = useMutation({
    mutationFn: () => sendOtp(phone),
    onMutate: () => setApiError(null),
    onSuccess: () => { setCode(''); autoSubmitted.current = ''; setSecondsLeft(RESEND_SECONDS) },
    onError: (err) => {
      const info = parseApiError(err)
      setApiError(t(info.isNetwork ? 'common.networkError' : info.status === 429 ? 'auth.otpRateLimited' : 'auth.otpSendFailed'))
    },
  })

  const onBack = () => {
    setApiError(null)
    if (step === 'otp') setStep('details')
    else router.back()
  }

  const phoneError = phoneTaken
    ? t('captain.auth.phoneRegistered')
    : errors.phone ? t(errors.phone.message ?? '') : undefined
  // Gate on the live values, not formState.isValid: with mode 'onChange' isValid
  // lags a render behind the first async (zod) validation of a late field.
  const canContinue = phoneComplete && !phoneTaken
    && passwordValue.length >= MIN_PASSWORD && confirmValue === passwordValue

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}>
        <View style={{ paddingTop: insets.top + Spacing.xl, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.lg }}>
          <WizardProgress current={1} total={4} />
          <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: 'left' }}>
            {step === 'details' ? t('captain.auth.accountTitle') : t('auth.otpTitle')}
          </Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
            {step === 'details' ? t('captain.auth.accountSubtitle') : t('auth.otpSubtitle', { phone })}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg }}>
            {step === 'details' && (
              <>
                <View style={{ gap: Spacing.sm }}>
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field: { onChange, value } }) => (
                      <PhoneField
                        label={t('auth.phone')}
                        value={value}
                        onChangeText={(v) => onChange(toAsciiDigits(v).replace(/\D/g, ''))}
                        placeholder={t('auth.phonePlaceholder')}
                        autoFocus={!draft.phone}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        error={phoneError}
                        trailing={
                          phoneComplete && phoneCheck.isFetching ? <ActivityIndicator size="small" color={colors.subtle} />
                          : phoneFree ? <Icon name="checkmark-circle" size={20} color={colors.success} />
                          : undefined
                        }
                      />
                    )}
                  />
                  {phoneTaken && (
                    // The way out sits right under the problem: same number, on to login.
                    <TouchableOpacity
                      onPress={() => router.replace({ pathname: '/(auth)/login', params: { phone: normalizePhone(phoneValue) } })}
                      activeOpacity={0.7} hitSlop={8} accessibilityRole="button"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}
                    >
                      <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold', textAlign: 'left' }}>
                        {t('captain.auth.loginInstead')}
                      </Text>
                      <Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={14} color={colors.tint} />
                    </TouchableOpacity>
                  )}
                </View>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <PasswordField
                      ref={passwordRef}
                      onBlur={onBlur}
                      label={t('auth.password')}
                      value={value}
                      onChangeText={(v) => {
                        onChange(v)
                        // Re-check the confirm field so its mismatch error tracks edits here.
                        if (getValues('confirmPassword')) trigger('confirmPassword')
                      }}
                      placeholder={t('captain.auth.newPasswordPlaceholder')}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmRef.current?.focus()}
                      // "Too short" on the first keystroke reads as a scolding: wait
                      // until they leave the field (or try to continue).
                      error={errors.password && (touchedFields.password || isSubmitted)
                        ? t(errors.password.message ?? '')
                        : undefined}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, value } }) => (
                    <PasswordField
                      ref={confirmRef}
                      label={t('captain.auth.confirmPassword')}
                      value={value}
                      onChangeText={onChange}
                      placeholder={t('captain.auth.confirmPasswordPlaceholder')}
                      returnKeyType="done"
                      onSubmitEditing={canContinue ? handleSubmit((v) => continueMutation.mutate(v)) : undefined}
                      // Don't flag a mismatch while they're still typing the confirmation.
                      error={errors.confirmPassword && (isSubmitted || value.length >= passwordValue.length)
                        ? t(errors.confirmPassword.message ?? '')
                        : undefined}
                    />
                  )}
                />
              </>
            )}

            {step === 'otp' && (
              <>
                <TouchableOpacity activeOpacity={1} onPress={() => codeRef.current?.focus()}>
                  <OtpBoxes value={code} />
                </TouchableOpacity>
                <TextInput
                  selectionColor={colors.tint}
                  ref={codeRef}
                  value={code}
                  onChangeText={(v) => setCode(toAsciiDigits(v).replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
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
          </View>

          <View style={{ flex: 1 }} />
          <FormError message={apiError} />

          {step === 'details' && (
            <Button label={t('common.continue')} loading={continueMutation.isPending} disabled={!canContinue}
              onPress={handleSubmit((v) => continueMutation.mutate(v))}
              trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
          )}
          {step === 'otp' && (
            <Button label={t('auth.verify')} loading={verifying} disabled={code.length !== 6}
              onPress={() => { autoSubmitted.current = code; verify(code) }}
              trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
          )}

          {/* On the code page "back" means "that's the wrong number". */}
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={{ alignSelf: 'center', paddingVertical: Spacing.sm }}>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
              {step === 'otp' ? t('captain.auth.changeNumber') : t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
