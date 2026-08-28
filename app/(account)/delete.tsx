import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/forms/input'
import { FormError } from '@/components/forms/form-error'
import { deleteAccount } from '@/services/captain-auth'
import { parseApiError, isWrongPasswordError } from '@/lib/api'
import { useAuthStore } from '@/store/auth-store'

// Stable for the session — forceRTL flips require a restart anyway.
const isRTL = I18nManager.isRTL

const schema = z.object({
  password: z.string().min(1, 'captain.auth.passwordRequired'),
})
type FormData = z.infer<typeof schema>

/**
 * Password-confirmed account deletion. The password is re-verified server-side
 * (DELETE /api/captain/me with a `{ password }` body) — nothing is deleted on a
 * client-side check alone. Response handling, per the shared contract:
 *   401 + `{"error":"wrong_password"}` → the typed password was rejected: inline
 *     error on the field, the captain STAYS signed in
 *   401 anything else → the token is dead, not the password: sign out normally
 *   409 → an active trip is blocking the delete
 *   204 / 404 → the account is gone: drop the session and land on the signed-out screen
 *
 * The two 401s are indistinguishable by status, so the branch reads the body's
 * machine code. It must never collapse back into "401 means wrong password" —
 * that is what used to strand a captain with an expired token on this screen,
 * retyping a correct password against a "wrong password" error forever.
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const qc = useQueryClient()
  // Banner errors (409 / network / unknown) vs. the field-level wrong-password error.
  const [apiError, setApiError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [show, setShow] = useState(false)

  const { control, handleSubmit, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
    mode: 'onChange',
  })

  // The session is over — either the account is gone (204/404) or the token is
  // dead (a non-wrong_password 401). Drop the local session, which lets the
  // AuthGate route to login, and wipe the query cache so none of this captain's
  // earnings/queue data survives into the next sign-in.
  const signOut = () => {
    qc.clear()
    useAuthStore.getState().clear()
  }

  const mutation = useMutation({
    mutationFn: (v: FormData) => deleteAccount(v.password),
    onMutate: () => {
      setApiError(null)
      setPasswordError(null)
    },
    onSuccess: signOut,
    onError: (err) => {
      const info = parseApiError(err)
      // 404 = already deleted. Same end state as 204, so sign out too.
      if (info.status === 404) return signOut()
      // The only 401 the session survives: the server rejected the typed password.
      if (isWrongPasswordError(err)) return setPasswordError(t('profile.deleteAccountWrongPassword'))
      // Any other 401 is an expired or revoked token — nothing the captain can
      // fix by retyping. Sign out as anywhere else in the app; lib/api.ts has
      // already dropped the token, this also clears the cache and routes to login.
      if (info.status === 401) return signOut()
      setApiError(
        t(
          info.isNetwork
            ? 'common.networkError'
            : info.status === 409
              ? 'profile.deleteAccountActiveTrip'
              : // The password runs through the SAME throttled gate as login, so
                // five wrong tries here lock the captain out of LOGIN as well.
                // "Try again" would be the one thing that cannot work.
                info.status === 429
                ? 'common.rateLimited'
                : // Blocked: refused before the password is read, and retrying
                  // never clears it.
                  info.status === 403
                  ? 'captain.status.blockedBody'
                  : 'profile.deleteAccountFailed',
        ),
      )
    },
  })

  const effects = [
    t('profile.deleteAccountEffectAnonymized'),
    t('profile.deleteAccountEffectSignIn'),
    t('profile.deleteAccountEffectFreed'),
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: Spacing.md,
          paddingHorizontal: Spacing.md,
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Back glyph: icons don't auto-flip, so swap it in AR. */}
          <Icon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ ...Typography['heading-sm'], color: colors.text }}>
          {t('profile.deleteAccount')}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ── What deletion actually does ── */}
          <View
            style={{
              backgroundColor: `${colors.destructive}14`,
              borderRadius: 16,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: `${colors.destructive}33`,
              padding: Spacing.lg,
              gap: Spacing.md,
            }}
          >
            {/* native forceRTL mirrors this row in AR — no manual flip */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <Icon name="warning-outline" size={20} color={colors.destructive} />
              <Text
                style={{
                  ...Typography['body-md'],
                  color: colors.destructive,
                  flex: 1,
                  // Reading-start: visual left in EN, visual right in AR.
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t('profile.deleteAccountConfirm')}
              </Text>
            </View>

            <View style={{ gap: Spacing.sm }}>
              {effects.map((line) => (
                // native forceRTL mirrors this row in AR — no manual flip
                <View key={line} style={{ flexDirection: 'row', gap: Spacing.md }}>
                  <View style={{ paddingTop: 6 }}>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
                        backgroundColor: colors.destructive,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      ...Typography.caption,
                      color: colors.text,
                      flex: 1,
                      lineHeight: 21,
                      // Keeps the line hugging its bullet in AR instead of drifting.
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                  >
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Password confirmation ── */}
          <View style={{ gap: Spacing.md }}>
            <Text
              style={{
                ...Typography.body,
                color: colors.subtle,
                fontSize: 15,
                lineHeight: 22,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {t('profile.deleteAccountPasswordPrompt')}
            </Text>

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <Input
                  label={t('auth.password')}
                  value={value}
                  onChangeText={(v) => {
                    // A wrong-password error is stale the moment they retype.
                    if (passwordError) setPasswordError(null)
                    onChange(v)
                  }}
                  placeholder={t('auth.passwordPlaceholder')}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  leading={<Icon name="lock-closed-outline" size={20} color={colors.subtle} />}
                  trailing={
                    <TouchableOpacity onPress={() => setShow((s) => !s)} hitSlop={10} activeOpacity={0.7}>
                      <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.subtle} />
                    </TouchableOpacity>
                  }
                  error={
                    passwordError ??
                    (errors.password ? t(errors.password.message ?? '') : undefined)
                  }
                />
              )}
            />
          </View>

          <FormError message={apiError} />

          <Button
            label={t('profile.deleteAccountCta')}
            variant="destructive"
            loading={mutation.isPending}
            disabled={!isValid}
            onPress={handleSubmit((v) => mutation.mutate(v))}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
