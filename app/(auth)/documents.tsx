// app/(auth)/documents.tsx — wizard step 4 of 4: the 5 required documents.
//
// The account already exists by now (the vehicle step created it and stored an
// onboarding-scoped captain JWT), so this screen is a place the captain can
// LEAVE and come back to: captains go off to find or photograph a paper, and
// Android may kill the app while the camera is open. So:
//   - it is the only (auth) screen while documents are owed (see
//     app/(auth)/_layout.tsx): every launch returns here until Submit;
//   - what is already uploaded is read from the server, never remembered
//     locally, so a relaunch shows the real progress;
//   - a photo taken while Android had killed the app is picked up on the way
//     back in (ImagePicker.getPendingResultAsync) and uploaded.
// Submit only flips `documentsPending` off; the guards then land on status.
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, ActionSheetIOS, Alert, AppState, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { DocumentRow, type DocState } from '@/components/captain/document-row'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { DOC_TYPES, getCompleteness, uploadDocument, type DocType } from '@/services/captain-documents'
import { useAuthStore } from '@/store/auth-store'
import { parseApiError } from '@/lib/api'

// Which document the camera/library was opened for. Written before the picker
// opens and removed when it returns, so if Android kills the app in between,
// the relaunch knows where the recovered photo belongs.
const PENDING_DOC_KEY = 'beeb.captain.pending-document'
const isDocType = (v: string | null): v is DocType => !!v && (DOC_TYPES as readonly string[]).includes(v)

/** What this session did to a document; anything absent is whatever the server says. */
type LocalStates = Partial<Record<DocType, DocState>>

export default function DocumentsStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const captainId = useAuthStore((s) => s.captain?.id)
  const [local, setLocal] = useState<LocalStates>({})
  const [error, setError] = useState<string | null>(null)

  const completenessKey = ['captain', captainId, 'documents', 'completeness'] as const
  const completeness = useQuery({
    queryKey: completenessKey,
    queryFn: () => getCompleteness(captainId as string),
    enabled: !!captainId,
    staleTime: 0,
  })
  const { refetch } = completeness

  // Back from the camera app, the gallery, or a day later: ask again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refetch()
    })
    return () => sub.remove()
  }, [refetch])

  const upload = useCallback(async (docType: DocType, uri: string) => {
    if (!captainId) return
    setError(null)
    setLocal((s) => ({ ...s, [docType]: 'uploading' }))
    try {
      await uploadDocument(captainId, docType, uri)
      setLocal((s) => ({ ...s, [docType]: 'uploaded' }))
    } catch {
      setLocal((s) => ({ ...s, [docType]: 'failed' }))
    }
  }, [captainId])

  // Android only: the activity can be destroyed while the camera is in front.
  // The photo is not lost; the picker hands it over on the next launch.
  useEffect(() => {
    if (process.env.EXPO_OS !== 'android') return
    let cancelled = false
    ;(async () => {
      const docType = await AsyncStorage.getItem(PENDING_DOC_KEY)
      if (!isDocType(docType)) return
      await AsyncStorage.removeItem(PENDING_DOC_KEY)
      const pending = await ImagePicker.getPendingResultAsync()
      if (cancelled || !pending || !('assets' in pending) || pending.canceled || !pending.assets?.[0]) return
      upload(docType, pending.assets[0].uri)
    })().catch(() => {})
    return () => { cancelled = true }
  }, [upload])

  const stateOf = (d: DocType): DocState =>
    local[d] ?? (completeness.data?.uploaded.includes(d) ? 'uploaded' : 'empty')
  const uploadedCount = DOC_TYPES.filter((d) => stateOf(d) === 'uploaded').length
  const remaining = DOC_TYPES.length - uploadedCount
  const allDone = remaining === 0
  const busy = DOC_TYPES.some((d) => stateOf(d) === 'uploading')

  async function pickAndUpload(docType: DocType, fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(t('captain.documents.permission'))
      return
    }
    await AsyncStorage.setItem(PENDING_DOC_KEY, docType).catch(() => {})
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] })
    await AsyncStorage.removeItem(PENDING_DOC_KEY).catch(() => {})
    if (result.canceled || !result.assets?.[0]) return
    upload(docType, result.assets[0].uri)
  }

  function chooseSource(docType: DocType) {
    if (process.env.EXPO_OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('captain.documents.takePhoto'), t('captain.documents.chooseLibrary'), t('common.cancel')],
          cancelButtonIndex: 2,
          title: t(`captain.documents.${docType}`),
        },
        (i) => {
          if (i === 0) pickAndUpload(docType, true)
          else if (i === 1) pickAndUpload(docType, false)
        },
      )
    } else {
      Alert.alert(t(`captain.documents.${docType}`), undefined, [
        { text: t('captain.documents.takePhoto'), onPress: () => pickAndUpload(docType, true) },
        { text: t('captain.documents.chooseLibrary'), onPress: () => pickAndUpload(docType, false) },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    }
  }

  // Submit asks the server one last time instead of trusting this screen: the
  // admin can only approve when all 5 are really on file.
  const submit = useMutation({
    mutationFn: () => getCompleteness(captainId as string),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      queryClient.setQueryData(completenessKey, result)
      if (result.complete) {
        // The (auth) guards swap this screen for "waiting for approval".
        useAuthStore.getState().setDocumentsPending(false)
        return
      }
      setLocal({}) // show exactly what the server has
      setError(t('captain.documents.notComplete'))
    },
    onError: (err) => setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'common.error')),
  })

  const onLogout = () => {
    Alert.alert(t('profile.logout'), t('captain.documents.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => useAuthStore.getState().clear() },
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={{ paddingTop: insets.top + Spacing.xl, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.lg }}>
          <WizardProgress current={4} total={4} />
          <View style={{ gap: Spacing.xs }}>
            <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: 'left' }}>
              {t('captain.register.documentsTitle')}
            </Text>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
              {t('captain.documents.intro')}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, gap: Spacing.sm }}>
          {completeness.isPending ? (
            <View style={{ paddingVertical: Spacing.xl * 2, alignItems: 'center' }}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <>
              <Text style={{ ...Typography['body-md'], color: allDone ? colors.success : colors.text, fontStyle: 'normal', textAlign: 'left', fontVariant: ['tabular-nums'] }}>
                {t('captain.documents.subtitle', { uploaded: uploadedCount, total: DOC_TYPES.length })}
              </Text>
              {DOC_TYPES.map((d) => (
                <DocumentRow key={d} docType={d} state={stateOf(d)} onPress={() => chooseSource(d)} />
              ))}
              {completeness.isError && (
                // The list above may be missing earlier uploads; say so and offer a retry.
                <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm }}>
                  <Icon name="refresh" size={16} color={colors.tint} />
                  <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', flex: 1, textAlign: 'left' }}>
                    {t('captain.documents.loadFailed')}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <View style={{ flex: 1, minHeight: Spacing.lg }} />
          <FormError message={error} />
          <Button
            label={allDone ? t('captain.documents.submit') : t('captain.documents.submitRemaining', { remaining })}
            disabled={!allDone || busy}
            loading={submit.isPending}
            onPress={() => submit.mutate()}
          />
          <Button label={t('profile.logout')} variant="ghost" onPress={onLogout} />
        </View>
      </ScrollView>
    </View>
  )
}
