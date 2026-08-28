import { useRef, useState, useCallback, useEffect } from 'react'
import { View, Text, I18nManager } from 'react-native'
import PagerView from 'react-native-pager-view'
import { usePathname } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { CustomTabBar } from '@/components/tab-bar/custom-tab-bar'
import { ActivateSheet } from '@/components/captain/activate-sheet'
import { useTabStore } from '@/store/tab-store'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { useTranslation } from 'react-i18next'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useResumeActiveTrip } from '@/hooks/use-resume-active-trip'

import HomeScreen from './index'
import ProfileScreen from './profile'

const SCREENS = [HomeScreen, ProfileScreen]
const TAB_PATHS = ['/', '/profile']
const HOME_INDEX = 0 // Home = the live map; disable pager swipe so it doesn't fight the map gesture

// Stable for the session — forceRTL changes require a restart anyway
const isRTL = I18nManager.isRTL

export default function TabLayout() {
  const pagerRef = useRef<PagerView>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [rendered, setRendered] = useState(new Set<number>([0]))
  const [showActivate, setShowActivate] = useState(false)

  // If a trip is in flight, resume the captain into the live-trip screen on launch.
  useResumeActiveTrip()

  const pathname = usePathname()
  useEffect(() => {
    const idx = TAB_PATHS.indexOf(pathname)
    if (idx !== -1 && idx !== activeIndex) {
      pagerRef.current?.setPage(idx)
      setActiveIndex(idx)
      useTabStore.getState().setActiveTabIndex(idx)
      setRendered(prev => new Set([...prev, idx]))
    }
  }, [pathname])

  const goToTab = useCallback((index: number) => {
    pagerRef.current?.setPage(index)
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        scrollEnabled={activeIndex !== HOME_INDEX}
        layoutDirection={isRTL ? 'rtl' : 'ltr'}
        overdrag
        onPageSelected={(e) => {
          const page = e.nativeEvent.position
          setActiveIndex(page)
          useTabStore.getState().setActiveTabIndex(page)
          setRendered(prev => new Set([...prev, page]))
          if (process.env.EXPO_OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          }
        }}
      >
        {SCREENS.map((Screen, i) => (
          <View key={i} style={{ flex: 1 }}>
            {rendered.has(i) && <Screen />}
          </View>
        ))}
      </PagerView>
      <PresenceError />
      <CustomTabBar
        activeIndex={activeIndex}
        onTabPress={goToTab}
        onActivatePress={() => setShowActivate(true)}
      />
      <ActivateSheet visible={showActivate} onClose={() => setShowActivate(false)} />
    </View>
  )
}

/**
 * Why going online can't happen, shown directly above the switch that tried it.
 * The center button used to open a sheet that had room to explain itself; now it
 * toggles in place, so a denied location permission or a failed request would
 * otherwise leave the button silently snapping back to "Go online". Sits above
 * the tab bar rather than on the map so it is visible from any tab, and clears
 * itself on the next attempt (the provider resets `error` when one starts).
 */
function PresenceError() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { error } = useCaptainPresence()

  if (!error) return null

  return (
    <View
      style={{
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: colors.destructive + '1A',
        borderTopWidth: 0.5,
        borderTopColor: colors.destructive + '55',
      }}
    >
      <Text
        style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'center' }}
      >
        {t(`captain.online.${error}`)}
      </Text>
    </View>
  )
}
