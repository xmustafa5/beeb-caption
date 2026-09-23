import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { I18nManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { restartApp, consumeRestartFlag } from '@/lib/restart'
import { isAppLanguage, isRtlLanguage, type AppLanguage } from './languages'
import en from './en.json'
import ar from './ar.json'
import ckb from './ckb.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    ckb: { translation: ckb },
  },
  lng: 'ar',
  // A string missing from ckb.json falls back to Arabic (same script and direction) before English.
  fallbackLng: { ckb: ['ar', 'en'], default: ['en'] },
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
  const lang: AppLanguage = isAppLanguage(saved) ? saved : 'ar'
  const shouldBeRTL = isRtlLanguage(lang)

  if (I18nManager.isRTL !== shouldBeRTL && !justRestarted) {
    I18nManager.forceRTL(shouldBeRTL)
    restartApp()
    return new Promise<void>(() => {})
  }

  if (lang !== i18n.language) {
    i18n.changeLanguage(lang)
  }
})()

// Arabic ↔ Kurdish keeps the direction, so it switches live; only a change to or
// from English flips RTL and needs the restart.
export async function changeLanguage(lang: AppLanguage) {
  i18n.changeLanguage(lang)
  await AsyncStorage.setItem('language', lang)
  const shouldBeRTL = isRtlLanguage(lang)
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL)
    await restartApp()
  }
}

export default i18n
