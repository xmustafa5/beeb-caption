// components/captain/offer-carousel.tsx
import { useEffect, useRef } from 'react'
import { View, FlatList, useWindowDimensions, type ViewToken } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, cancelAnimation, runOnJS, Easing } from 'react-native-reanimated'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Spacing } from '@/constants/Spacing'
import { OfferCard } from '@/components/captain/offer-card'
import type { CaptainOffer } from '@/services/captain-queue'
import type { LatLng } from '@/hooks/use-current-location'

const ADVANCE_MS = 30000

interface OfferCarouselProps {
  offers: CaptainOffer[]
  activeIndex: number
  onIndexChange: (index: number) => void
  captainLocation: LatLng | null
  onAccept: (offer: CaptainOffer) => void
  accepting: boolean
}

export function OfferCarousel({ offers, activeIndex, onIndexChange, captainLocation, onAccept, accepting }: OfferCarouselProps) {
  const colors = useThemeColors()
  const { width } = useWindowDimensions()
  const listRef = useRef<FlatList<CaptainOffer>>(null)
  const progress = useSharedValue(0)
  const count = offers.length

  // The index the LIST has actually settled on. Lets the programmatic scroll fire
  // only for auto-advance / external changes — never to echo a manual swipe (which
  // otherwise causes a scroll⇄report feedback loop = the janky / "infinite" swipe).
  const settledIndex = useRef(activeIndex)
  // Refs so the (stable) viewability callback always reads fresh values without being
  // recreated — RN forbids changing onViewableItemsChanged between renders.
  const activeIndexRef = useRef(activeIndex)
  const onIndexChangeRef = useRef(onIndexChange)
  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])
  useEffect(() => { onIndexChangeRef.current = onIndexChange }, [onIndexChange])

  // Countdown + auto-advance. Resets whenever the active offer or the count changes
  // (a manual swipe updates activeIndex → this effect re-runs → timer restarts).
  useEffect(() => {
    if (count <= 1) return
    progress.value = 0
    progress.value = withTiming(1, { duration: ADVANCE_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onIndexChange)((activeIndex + 1) % count)
    })
    return () => cancelAnimation(progress)
  }, [activeIndex, count, progress, onIndexChange])

  // Scroll the list to the active card ONLY when the change came from outside the
  // list (auto-advance / clamp) — i.e. the list hasn't already settled there.
  useEffect(() => {
    if (activeIndex !== settledIndex.current && activeIndex >= 0 && activeIndex < count) {
      settledIndex.current = activeIndex
      try {
        listRef.current?.scrollToIndex({ index: activeIndex, animated: true })
      } catch {
        // list not laid out yet — getItemLayout makes this rare; ignore.
      }
    }
  }, [activeIndex, count])

  const barStyle = useAnimatedStyle(() => ({ width: `${(1 - progress.value) * 100}%` }))

  // Settled-card detection via viewability — reports the actual visible item's data
  // index, so it is correct under both LTR and native forceRTL (no contentOffset math,
  // which is mirrored/unreliable in RTL). Stable identity via refs.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current
  const onViewableItemsChanged = useRef((info: { viewableItems: ViewToken[] }) => {
    const idx = info.viewableItems[0]?.index
    if (idx == null) return
    settledIndex.current = idx
    if (idx !== activeIndexRef.current) onIndexChangeRef.current(idx)
  }).current

  return (
    <View style={{ gap: Spacing.sm }}>
      {/* 30s countdown bar — only when there is more than one offer to rotate through */}
      {count > 1 && (
        <View style={{ height: 3, marginHorizontal: Spacing.xl, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
          <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: colors.tint }, barStyle]} />
        </View>
      )}

      <FlatList
        ref={listRef}
        data={offers}
        keyExtractor={(o) => `${o.offerType}-${o.id}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: Spacing.xl }}>
            <OfferCard
              offer={item}
              captainLocation={captainLocation}
              onAccept={() => onAccept(item)}
              accepting={accepting}
            />
          </View>
        )}
      />
    </View>
  )
}
