// components/captain/box-photo-viewer.tsx
import { useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  type ViewToken,
} from 'react-native'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { boxPhotoCacheKey } from '@/services/box'
import { ltrIsolate } from '@/lib/bidi'

interface BoxPhotoViewerProps {
  /** Builds the stable cache key, so a re-signed URL never re-downloads. */
  tripId: string
  photoUrls: string[]
  /** Photo to open on; `null` keeps the viewer closed. */
  openIndex: number | null
  onClose: () => void
  /** Pass `'disk'` from surfaces that show many parcels (offers). */
  cachePolicy?: 'disk' | 'memory-disk'
}

/**
 * Full-screen viewer for a Box's item photos: swipe between them, close with
 * the button (or Android back). Shares the thumbnails' cache keys, so a photo
 * that is already on screen as a thumbnail opens instantly.
 */
export function BoxPhotoViewer({ tripId, photoUrls, openIndex, onClose, cachePolicy = 'memory-disk' }: BoxPhotoViewerProps) {
  const visible = openIndex != null && photoUrls.length > 0
  // The photo the body was opened on, kept after `openIndex` goes back to null:
  // iOS fades the modal out AFTER `visible` flips, and unmounting the body in
  // that same render would fade an empty modal (the photo just vanishes).
  // Cleared on `onDismiss` (iOS-only; Android's Modal drops its children itself).
  const [shownIndex, setShownIndex] = useState<number | null>(openIndex)
  if (openIndex != null && openIndex !== shownIndex) setShownIndex(openIndex)
  const bodyIndex = openIndex ?? shownIndex

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={() => setShownIndex(null)}
    >
      {/* Mounted per opening (keyed), so each one starts on the tapped photo. */}
      {bodyIndex != null && photoUrls.length > 0 && (
        <ViewerBody
          key={bodyIndex}
          tripId={tripId}
          photoUrls={photoUrls}
          initialIndex={Math.min(bodyIndex, photoUrls.length - 1)}
          onClose={onClose}
          cachePolicy={cachePolicy}
        />
      )}
    </Modal>
  )
}

interface ViewerBodyProps {
  tripId: string
  photoUrls: string[]
  initialIndex: number
  onClose: () => void
  cachePolicy: 'disk' | 'memory-disk'
}

function ViewerBody({ tripId, photoUrls, initialIndex, onClose, cachePolicy }: ViewerBodyProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [current, setCurrent] = useState(initialIndex)
  const count = photoUrls.length

  // Settled page via viewability (as the offer carousel does): correct under
  // native forceRTL too, where horizontal contentOffset math is mirrored.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current
  const onViewableItemsChanged = useRef((info: { viewableItems: ViewToken[] }) => {
    const idx = info.viewableItems[0]?.index
    if (idx != null) setCurrent(idx)
  }).current

  return (
    <View style={{ flex: 1, backgroundColor: colors.mediaBackdrop }}>
      <StatusBar style="light" />
      <FlatList
        data={photoUrls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollToIndexFailed={() => {}}
        keyExtractor={(_, index) => boxPhotoCacheKey(tripId, index)}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => (
          <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            {/* Sits under the image: visible while it loads, and if it fails. */}
            <ActivityIndicator color={colors.onMediaBackdrop} style={{ position: 'absolute' }} />
            <Image
              source={{ uri: item, cacheKey: boxPhotoCacheKey(tripId, index) }}
              cachePolicy={cachePolicy}
              contentFit="contain"
              transition={150}
              accessibilityLabel={t('captain.box.photos')}
              style={{ width, height }}
            />
          </View>
        )}
      />

      {/* Close — the leading edge, like a back button (native RTL moves it right in AR). */}
      <TouchableOpacity
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('captain.box.closePhoto')}
        style={{
          position: 'absolute',
          top: insets.top + Spacing.md,
          left: Spacing.lg,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.onMediaBackdrop + '26',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="close" size={24} color={colors.onMediaBackdrop} />
      </TouchableOpacity>

      {count > 1 && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: insets.top + Spacing.md, left: 0, right: 0, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* A counter of Western digits — LTR style (iOS) + isolate (Android) so "1 / 3" doesn't reorder under RTL. */}
          <Text
            style={{
              ...Typography['body-md'],
              color: colors.onMediaBackdrop,
              fontVariant: ['tabular-nums'],
              writingDirection: 'ltr',
              textAlign: 'center',
            }}
          >
            {ltrIsolate(`${current + 1} / ${count}`)}
          </Text>
        </View>
      )}
    </View>
  )
}
