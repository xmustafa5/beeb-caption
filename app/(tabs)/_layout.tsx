import { useRef, useState, useCallback, useEffect } from 'react'
import { View, I18nManager } from 'react-native'
import PagerView from 'react-native-pager-view'
import { usePathname } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { CustomTabBar } from '@/components/tab-bar/custom-tab-bar'
import { ActivateSheet } from '@/components/captain/activate-sheet'
import { useTabStore } from '@/store/tab-store'
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
      <CustomTabBar
        activeIndex={activeIndex}
        onTabPress={goToTab}
        onActivatePress={() => setShowActivate(true)}
      />
      <ActivateSheet visible={showActivate} onClose={() => setShowActivate(false)} />
    </View>
  )
}
