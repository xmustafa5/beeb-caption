// app/(auth)/register/documents.tsx
// Document upload. Two entry points:
//  - Onboarding (onboarding=1, from the register wizard): a PENDING captain
//    uploads docs before the status screen, because an admin can only approve
//    after the 5 docs exist. Finishes on /(auth)/status. Authorized by the
//    onboarding-scoped captain JWT that /api/captains/register now returns.
//  - Profile (no flag): an approved/pending captain re-uploads; returns back.
import { useState } from 'react'
import { View, Text, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { DocumentRow, type DocState } from '@/components/captain/document-row'
import { DOC_TYPES, uploadDocument, type DocType } from '@/services/captain-documents'
import { useAuthStore } from '@/store/auth-store'

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
  // Onboarding entry (from the register wizard) finishes on the status screen;
  // the profile entry (no flag) returns where it came from.
  const onboarding = useLocalSearchParams<{ onboarding?: string }>().onboarding === '1'
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
          <View style={{ gap: Spacing.xs, alignSelf: 'stretch' }}>
            <Text style={{ ...Typography['heading-lg'], color: colors.text, fontSize: 28, lineHeight: 34, textAlign: 'left' }}>
              {t('captain.register.documentsTitle')}
            </Text>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
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
            onPress={() => (onboarding ? router.replace('/(auth)/status') : router.back())}
          />
        </View>
      </ScrollView>
    </View>
  )
}
