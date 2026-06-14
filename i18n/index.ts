import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { I18nManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { restartApp, consumeRestartFlag } from '@/lib/restart'
import en from './en.json'
import ar from './ar.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: 'ar',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

// Resolves once i18n language and I18nManager.isRTL are in sync.
// If a restart is needed (forceRTL changed), the promise never resolves — the app restarts instead.
export const languageReady: Promise<void> = (async () => {
  const [saved, justRestarted] = await Promise.all([
    AsyncStorage.getItem('language'),
    consumeRestartFlag(),
  ])
  // Default to Arabic (Iraqi captains) on first launch; respect a saved choice thereafter.
  const lang = (saved === 'ar' || saved === 'en') ? saved : 'ar'
  const shouldBeRTL = lang === 'ar'

  if (I18nManager.isRTL !== shouldBeRTL && !justRestarted) {
    I18nManager.forceRTL(shouldBeRTL)
    restartApp()
    return new Promise<void>(() => {})
  }

  if (lang !== i18n.language) {
    i18n.changeLanguage(lang)
  }
})()

export async function changeLanguage(lang: 'en' | 'ar') {
  i18n.changeLanguage(lang)
  await AsyncStorage.setItem('language', lang)
  const shouldBeRTL = lang === 'ar'
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL)
    await restartApp()
  }
}

export default i18n
