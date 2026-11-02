import { Alert, Linking } from 'react-native'
import i18n from '@/i18n'

/** Beep support line, the same number for riders and captains. */
export const SUPPORT_PHONE = '+9647779446665'

export const SUPPORT_TEL_URL = `tel:${SUPPORT_PHONE}`
// wa.me opens the WhatsApp app when it is installed and the web page when it
// is not, without the LSApplicationQueriesSchemes entry whatsapp:// would need.
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE.slice(1)}`

/** Ask whether to call support or message it on WhatsApp, then open that app. */
export function contactSupport() {
  const t = i18n.t.bind(i18n)
  Alert.alert(
    t('support.title'),
    // LTR isolate keeps "+964 …" in order inside an Arabic/Kurdish sentence.
    t('support.message', { phone: `⁦${SUPPORT_PHONE}⁩` }),
    [
      { text: t('support.call'), onPress: () => Linking.openURL(SUPPORT_TEL_URL).catch(() => {}) },
      { text: t('support.whatsapp'), onPress: () => Linking.openURL(SUPPORT_WHATSAPP_URL).catch(() => {}) },
      { text: t('common.cancel'), style: 'cancel' },
    ],
  )
}
