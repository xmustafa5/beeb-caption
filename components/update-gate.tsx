import { useEffect } from 'react'
import { AppState, Linking, Modal, Platform, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Typography } from '@/constants/Typography'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { useAutoOta } from '@/hooks/use-auto-ota'
import { STORE_URLS, mustUpdate } from '@/lib/app-version'
import { getMinVersions, minVersionsQueryKey } from '@/services/app-version'

/**
 * Keeps the installed app current, mounted once at the root:
 * - OTA (JS) updates apply on their own on launch / foreground (useAutoOta).
 * - A store build below the server minimum gets a full-screen, undismissable
 *   "update to continue" screen whose only action opens the store.
 *
 * The installed version is app.json `version`. With the `appVersion` runtime
 * policy an OTA only ever runs on the store build of that same version, so this
 * is the native build's version even after OTAs.
 */
export function UpdateGate() {
  useAutoOta()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()

  const query = useQuery({
    queryKey: minVersionsQueryKey,
    queryFn: getMinVersions,
    staleTime: 0,
    retry: 1,
  })
  const { refetch } = query

  // React Query on native has no window focus: re-check on every return, so a
  // minimum raised while the app sat in the background still lands.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch()
    })
    return () => sub.remove()
  }, [refetch])

  const blocked = mustUpdate(Constants.expoConfig?.version, query.data, Platform.OS)
  const storeUrl = Platform.OS === 'android' ? STORE_URLS.android : STORE_URLS.ios

  return (
    <Modal
      visible={blocked}
      animationType="fade"
      // Android back must not dismiss it.
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View
        testID="update-gate"
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <Icon name="arrow-up-circle-outline" size={48} color={colors.tint} />
        </View>
        <Text style={{ ...Typography['heading-lg'], color: colors.text, textAlign: 'center' }}>
          {t('forceUpdate.title')}
        </Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center' }}>
          {t('forceUpdate.body')}
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
          <Button label={t('forceUpdate.button')} onPress={() => void Linking.openURL(storeUrl)} />
        </View>
      </View>
    </Modal>
  )
}
