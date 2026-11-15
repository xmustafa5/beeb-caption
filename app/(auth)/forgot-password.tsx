// app/(auth)/forgot-password.tsx — a captain who forgot their password, in three pages:
//   phone:    the number is checked against captain accounts BEFORE any code is
//             sent, so a number with no captain account is told so here.
//   otp:      the 6-digit code; the sixth digit submits it. Verifying mints a
//             "reset" ticket.
//   password: new password + confirmation. Saving resets the CAPTAIN account and
//             signs in with it. Storing that session is the navigation: the
//             guards land an approved captain on (tabs), a pending one on the
//             documents or status screen. No router.replace() here.
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SchemeOverride, useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { AuthScaffold, PasswordField, PhoneField, OtpBoxes, authIsRTL as isRTL } from '@/components/auth/auth-scaffold'
import { isCaptainPhoneRegistered, resetCaptainPassword, sendOtp, verifyOtp } from '@/services/captain-auth'
import { parseApiError } from '@/lib/api'
import { contactSupport } from '@/lib/support'
import { toAsciiDigits } from '@/lib/digits'
import { toLocalPhoneInput } from '@/lib/phone'
import { otpSendErrorKey, otpVerifyErrorKey } from '@/lib/otp-errors'
import { useAuthStore } from '@/store/auth-store'

type Step = 'phone' | 'otp' | 'password'
const RESEND_SECONDS = 30
const PHONE_RE = /^0?7\d{9}$/
const MIN_PASSWORD = 8

const phoneSchema = z.object({ phone: z.string().regex(PHONE_RE, 'auth.phoneInvalid') })
const passwordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, 'captain.auth.passwordTooShort'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'captain.auth.passwordMismatch', path: ['confirmPassword'] })
type PhoneForm = z.infer<typeof phoneSchema>
type PasswordForm = z.infer<typeof passwordSchema>

/** The phone login hands over (`9647…` or `07…`) as the local `07…` the field shows. */
function localPhone(p: string | undefined): string {
  return toLocalPhoneInput(p ?? '')
}

// Same light-only art as the login screen it is opened from.
export default function CaptainForgotPasswordScreen() {
  return (
    <SchemeOverride scheme="light">
      <StatusBar style="dark" />
      <ForgotPasswordForm />
    </SchemeOverride>
  )
}

function ForgotPasswordForm() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ phone?: string }>()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [ticket, setTicket] = useState('')
  const [code, setCode] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [apiError, setApiError] = useState<string | null>(null)
  // 403 on reset: the account exists but may not sign in. Offer support, not a retry.
  const [refused, setRefused] = useState(false)
  const codeRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)
  // The last code auto-submitted, so a wrong code is not re-sent on every render.
  const autoSubmitted = useRef('')

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: localPhone(params.phone) },
    mode: 'onChange',
  })
  const phoneValue = phoneForm.watch('phone')

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onChange',
  })
  const passwordValue = passwordForm.watch('password')
  const confirmValue = passwordForm.watch('confirmPassword')
  const passwordErrors = passwordForm.formState.errors
  const passwordTouched = passwordForm.formState.touchedFields
  const passwordSubmitted = passwordForm.formState.isSubmitted

  const startCode = (p: string) => {
    setPhone(p)
    setCode('')
    autoSubmitted.current = ''
    setStep('otp')
    setSecondsLeft(RESEND_SECONDS)
  }

  const sendMutation = useMutation({
    // No code for a number that has no captain account: say so on this page.
    // Only a network failure of the lookup stops the send; any other failure
    // lets the reset itself answer (a 404 there spends nothing).
    mutationFn: async (p: string): Promise<'sent' | 'no-captain'> => {
      try {
        if (!(await isCaptainPhoneRegistered(p))) return 'no-captain'
      } catch (err) {
        if (parseApiError(err).isNetwork) throw err
      }
      await sendOtp(p)
      return 'sent'
    },
    onMutate: () => { setApiError(null); setRefused(false) },
    onSuccess: (outcome, p) => {
      if (outcome === 'no-captain') setApiError(t('captain.auth.noCaptainForPhone'))
      else startCode(p)
    },
    onError: (err) => setApiError(t(otpSendErrorKey(err))),
  })

  const verifyMutation = useMutation({
    mutationFn: (c: string) => verifyOtp(phone, c, 'reset'),
    onMutate: () => setApiError(null),
    onSuccess: ({ ticket: tk }) => {
      setTicket(tk)
      setCode('')
      setStep('password')
    },
    onError: (err) => {
      const key = otpVerifyErrorKey(err)
      setApiError(t(key))
      // Five wrong tries kill the code: clear it and let them resend at once.
      if (key === 'captain.auth.otpTooManyTries') { setCode(''); autoSubmitted.current = ''; setSecondsLeft(0) }
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
    onError: (err) => setApiError(t(otpSendErrorKey(err))),
  })

  const resetMutation = useMutation({
    mutationFn: (v: PasswordForm) => resetCaptainPassword(phone, v.password, ticket),
    onMutate: () => { setApiError(null); setRefused(false) },
    onSuccess: ({ token, captain, documentsPending }) => {
      useAuthStore.getState().setSession(token, captain, documentsPending)
    },
    onError: (err) => {
      const info = parseApiError(err)
      if (info.status === 401) {
        // The verified code expired (30 min) or was used: a new one is needed.
        setTicket('')
        setCode('')
        autoSubmitted.current = ''
        setSecondsLeft(0)
        setStep('otp')
        setApiError(t('captain.auth.codeExpiredResend'))
        return
      }
      if (info.status === 404) { setStep('phone'); setApiError(t('captain.auth.noCaptainForPhone')); return }
      if (info.status === 403) { setRefused(true); setApiError(t('captain.auth.resetRefused')); return }
      setApiError(t(info.isNetwork ? 'common.networkError' : info.status === 400 ? 'captain.auth.passwordTooShort' : 'captain.auth.resetFailed'))
    },
  })

  const onBack = () => {
    setApiError(null)
    setRefused(false)
    if (step === 'phone') router.back()
    // From the code: "that's the wrong number". From the new password: the code
    // is already used, so start over from the number, not from boxes that would fail.
    else { setStep('phone'); setCode(''); setTicket('') }
  }

  const canSave = passwordValue.length >= MIN_PASSWORD && confirmValue === passwordValue
  const save = passwordForm.handleSubmit((v) => resetMutation.mutate(v))

  const title = step === 'password' ? t('captain.auth.newPasswordTitle') : step === 'otp' ? t('auth.otpTitle') : t('captain.auth.forgotTitle')
  const subtitle =
    step === 'phone' ? t('captain.auth.forgotSubtitle')
      : step === 'otp' ? t('auth.otpSubtitle', { phone })
        : t('captain.auth.newPasswordSubtitle')

  return (
    <AuthScaffold title={title} subtitle={subtitle} onBack={onBack}>
      {step === 'phone' && (
        <>
          <Controller
            control={phoneForm.control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <PhoneField
                label={t('auth.phone')}
                value={value}
                onChangeText={(v) => { setApiError(null); onChange(toLocalPhoneInput(v)) }}
                placeholder={t('auth.phonePlaceholder')}
                autoFocus
                returnKeyType="done"
                error={phoneForm.formState.errors.phone && phoneValue.length >= 10 ? t(phoneForm.formState.errors.phone.message ?? '') : undefined}
              />
            )}
          />
          <FormError message={apiError} />
          <Button
            label={t('auth.sendOtp')}
            loading={sendMutation.isPending}
            disabled={!PHONE_RE.test(phoneValue)}
            onPress={phoneForm.handleSubmit((v) => sendMutation.mutate(v.phone))}
            trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />}
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
          <FormError message={apiError} />
          <Button
            label={t('auth.verify')}
            loading={verifying}
            disabled={code.length !== 6}
            onPress={() => { autoSubmitted.current = code; verify(code) }}
            trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />}
          />
        </>
      )}

      {step === 'password' && (
        <>
          <Controller
            control={passwordForm.control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <PasswordField
                label={t('captain.auth.newPassword')}
                value={value}
                onBlur={onBlur}
                onChangeText={(v) => {
                  onChange(v)
                  // Re-check the confirmation so its mismatch error tracks edits here.
                  if (passwordForm.getValues('confirmPassword')) passwordForm.trigger('confirmPassword')
                }}
                placeholder={t('captain.auth.newPasswordPlaceholder')}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                // "Too short" on the first keystroke reads as a scolding: wait until
                // they leave the field (or try to save).
                error={passwordErrors.password && (passwordTouched.password || passwordSubmitted)
                  ? t(passwordErrors.password.message ?? '')
                  : undefined}
              />
            )}
          />
          <Controller
            control={passwordForm.control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <PasswordField
                ref={confirmRef}
                label={t('captain.auth.confirmPassword')}
                value={value}
                onChangeText={onChange}
                placeholder={t('captain.auth.confirmPasswordPlaceholder')}
                returnKeyType="done"
                onSubmitEditing={canSave ? save : undefined}
                // Don't flag a mismatch while they're still typing the confirmation.
                error={passwordErrors.confirmPassword && (passwordSubmitted || value.length >= passwordValue.length)
                  ? t(passwordErrors.confirmPassword.message ?? '')
                  : undefined}
              />
            )}
          />
          <FormError message={apiError} />
          {refused ? (
            <Button
              label={t('support.contact')}
              onPress={contactSupport}
              trailing={<Icon name="call" size={18} color={colors.onTint} />}
            />
          ) : (
            <Button
              label={t('captain.auth.savePassword')}
              loading={resetMutation.isPending}
              disabled={!canSave}
              onPress={save}
              trailing={<Icon name="checkmark" size={20} color={colors.onTint} />}
            />
          )}
        </>
      )}
    </AuthScaffold>
  )
}
