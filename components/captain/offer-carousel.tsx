// components/captain/offer-carousel.tsx
import { useEffect, useRef } from 'react'
import { View, FlatList, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
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

  // Keep the list scrolled to the active card (covers auto-advance + external changes).
  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < count) {
      listRef.current?.scrollToIndex({ index: activeIndex, animated: true })
    }
  }, [activeIndex, count])

  const barStyle = useAnimatedStyle(() => ({ width: `${(1 - progress.value) * 100}%` }))

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width)
    if (idx !== activeIndex && idx >= 0 && idx < count) onIndexChange(idx)
  }

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
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
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
