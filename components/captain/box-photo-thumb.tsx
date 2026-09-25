// components/captain/box-photo-thumb.tsx
import { View, Text, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Icon } from '@/components/ui/icon'
import { boxPhotoCacheKey } from '@/services/box'
import { ltrIsolate } from '@/lib/bidi'

interface BoxPhotoThumbProps {
  tripId: string
  /** Position in the sender's photo list — half of the stable cache key. */
  index: number
  /** Presigned GET; omitted → the cube placeholder alone. */
  uri?: string
  size: number
  /** Photos beyond this one that aren't shown; renders a "+N" badge when > 0. */
  moreCount?: number
  onPress?: () => void
  /** Screen-reader text; defaults to "Photos" / "No photos". */
  accessibilityLabel?: string
  /**
   * `'disk'` for offer cards: a captain scrolls past many offers and shouldn't
   * keep every parcel photo decoded in memory. The live-trip card keeps the
   * default `'memory-disk'` for its few photos. The cacheKey is the same either way.
   */
  cachePolicy?: 'disk' | 'memory-disk'
}

/**
 * One Box item photo as a rounded square. The cube glyph sits UNDER the image,
 * so it doubles as the loading state, the no-photo state and the failed-load
 * state (e.g. a signed URL that lapsed) without any extra bookkeeping.
 */
export function BoxPhotoThumb({
  tripId,
  index,
  uri,
  size,
  moreCount = 0,
  onPress,
  accessibilityLabel,
  cachePolicy = 'memory-disk',
}: BoxPhotoThumbProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'imagebutton' : 'image'}
      accessibilityLabel={accessibilityLabel ?? (uri ? t('captain.box.photos') : t('captain.box.noPhoto'))}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: 12,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name="cube-outline" size={Math.round(size * 0.4)} color={colors.subtle} />
      {uri && (
        <Image
          source={{ uri, cacheKey: boxPhotoCacheKey(tripId, index) }}
          cachePolicy={cachePolicy}
          contentFit="cover"
          transition={150}
          style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }}
        />
      )}
      {moreCount > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            minWidth: 24,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 8,
            borderCurve: 'continuous',
            backgroundColor: colors.mediaBackdrop + '99',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              ...Typography.micro,
              fontFamily: 'Poppins_600SemiBold',
              fontStyle: 'normal',
              color: colors.onMediaBackdrop,
              fontVariant: ['tabular-nums'],
              // Western-only "+N": keep the sign in front under RTL (iOS style +
              // the isolate below for Android, which ignores writingDirection).
              writingDirection: 'ltr',
            }}
          >
            {ltrIsolate(`+${moreCount}`)}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
