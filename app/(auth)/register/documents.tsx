// app/(auth)/register/documents.tsx
import { useState } from 'react'
import { View, Text, ScrollView, ActionSheetIOS, Alert, Platform, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/forms/form-error'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { DocumentRow, type DocState } from '@/components/captain/document-row'
import { DOC_TYPES, uploadDocument, type DocType } from '@/services/captain-documents'
import { requestOtp, verifyCaptainOtp } from '@/services/captain-auth'
import { useAuthStore } from '@/store/auth-store'
import { useRegistrationStore } from '@/store/registration-store'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL

type StateMap = Record<DocType, DocState>
const INITIAL: StateMap = {
  driver_license: 'empty',
  car_registration: 'empty',
  captain_selfie: 'empty',
  national_id_front: 'empty',
  national_id_back: 'empty',
}

export default function DocumentsStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const captainId = useAuthStore((s) => s.captain?.id ?? s.pendingCaptainId)
  const phone = useRegistrationStore((s) => s.phone)
  const [states, setStates] = useState<StateMap>(INITIAL)

  const uploadedCount = DOC_TYPES.filter((d) => states[d] === 'uploaded').length
  const allDone = uploadedCount === DOC_TYPES.length

  async function pickAndUpload(docType: DocType, fromCamera: boolean) {
    if (!captainId) return
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(t('captain.documents.permission'))
      return
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] })
    if (result.canceled || !result.assets?.[0]) return

    const uri = result.assets[0].uri
    setStates((s) => ({ ...s, [docType]: 'uploading' }))
    try {
      await uploadDocument(captainId, docType, uri)
      setStates((s) => ({ ...s, [docType]: 'uploaded' }))
    } catch {
      setStates((s) => ({ ...s, [docType]: 'failed' }))
    }
  }

  function chooseSource(docType: DocType) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t('captain.documents.takePhoto'),
            t('captain.documents.chooseLibrary'),
            t('common.cancel'),
          ],
          cancelButtonIndex: 2,
          title: t('captain.documents.sourceTitle'),
        },
        (i) => {
          if (i === 0) pickAndUpload(docType, true)
          else if (i === 1) pickAndUpload(docType, false)
        },
      )
    } else {
      Alert.alert(t('captain.documents.sourceTitle'), undefined, [
        { text: t('captain.documents.takePhoto'), onPress: () => pickAndUpload(docType, true) },
        { text: t('captain.documents.chooseLibrary'), onPress: () => pickAndUpload(docType, false) },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          <WizardProgress current={3} total={3} />
          <View style={{ gap: Spacing.xs, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: isRTL ? 'right' : 'left' }}>
              {t('captain.register.documentsTitle')}
            </Text>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
              {t('captain.documents.subtitle', { uploaded: uploadedCount, total: DOC_TYPES.length })}
            </Text>
          </View>
        </View>

        {token ? (
          <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.sm }}>
            {DOC_TYPES.map((d) => (
              <DocumentRow key={d} docType={d} state={states[d]} onPress={() => chooseSource(d)} />
            ))}
            <View style={{ flex: 1, minHeight: Spacing.lg }} />
            <Button
              label={
                allDone
                  ? t('captain.documents.submit')
                  : t('captain.documents.submitRemaining', { remaining: DOC_TYPES.length - uploadedCount })
              }
              disabled={!allDone}
              onPress={() => {
                useRegistrationStore.getState().reset()
                router.replace('/(auth)/status')
              }}
            />
          </View>
        ) : (
          <VerifyGate phone={phone} />
        )}
      </ScrollView>
    </View>
  )
}

/**
 * Shown when the captain has registered (pending id) but has no token yet.
 * Re-verifies OTP to mint the pending token so document upload can proceed.
 */
function VerifyGate({ phone }: { phone: string }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const verify = useMutation({
    mutationFn: () => verifyCaptainOtp(phone, code),
    onMutate: () => setError(null),
    onSuccess: (res) => {
      if (res.kind === 'authed') {
        useAuthStore.getState().setSession(res.token, res.captain)
      } else {
        setError(t('captain.auth.otpVerifyFailed'))
      }
    },
    onError: (err) => {
      const info = parseApiError(err)
      setError(
        t(
          info.isNetwork
            ? 'common.networkError'
            : info.status === 401
              ? 'captain.auth.otpWrong'
              : info.status === 429
                ? 'common.rateLimited'
                : 'captain.auth.otpVerifyFailed',
        ),
      )
    },
  })

  const resend = useMutation({ mutationFn: () => requestOtp(phone), onMutate: () => setError(null) })

  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 22,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing.xl,
          gap: Spacing.lg,
        }}
      >
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
          {t('captain.documents.verifyToContinue')}
        </Text>
        <Input
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          placeholder={t('auth.otpPlaceholder')}
          maxLength={6}
          autoFocus
        />
        <FormError message={error} />
        <Button
          label={t('captain.documents.verify')}
          loading={verify.isPending}
          disabled={code.length !== 6}
          onPress={() => verify.mutate()}
        />
        <Button label={t('auth.resend')} variant="ghost" onPress={() => resend.mutate()} />
      </View>
    </View>
  )
}
