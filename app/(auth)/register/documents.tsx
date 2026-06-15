// app/(auth)/register/documents.tsx
// Document upload. Reached AFTER approval + login (a captain token is always
// present here): captain login is gated on approval, so there's no pre-approval
// token to upload with. Linked from the captain profile.
import { useState } from 'react'
import { View, Text, ScrollView, ActionSheetIOS, Alert, Platform, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { DocumentRow, type DocState } from '@/components/captain/document-row'
import { DOC_TYPES, uploadDocument, type DocType } from '@/services/captain-documents'
import { useAuthStore } from '@/store/auth-store'

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
  const captainId = useAuthStore((s) => s.captain?.id ?? s.pendingCaptainId)
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
          <View style={{ gap: Spacing.xs, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: isRTL ? 'right' : 'left' }}>
              {t('captain.register.documentsTitle')}
            </Text>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
              {t('captain.documents.subtitle', { uploaded: uploadedCount, total: DOC_TYPES.length })}
            </Text>
          </View>
        </View>

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
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </View>
  )
}
