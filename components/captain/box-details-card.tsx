// components/captain/box-details-card.tsx
import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { BoxPhotoThumb } from '@/components/captain/box-photo-thumb'
import { BoxPhotoViewer } from '@/components/captain/box-photo-viewer'
import { formatPhoneDisplay, openDialer } from '@/lib/phone'
import type { BoxDetails } from '@/services/box'

const THUMB = 64
/** Descriptions run up to 500 chars; show a readable chunk, tap to read the rest. */
const COLLAPSED_LINES = 6

interface BoxDetailsCardProps {
  tripId: string
  details: BoxDetails | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  /** Where the box goes — the trip's dropoff name, when the backend has one. */
  dropoffAddress?: string
}

/**
 * The parcel on an accepted Box trip: what it is, its photos (tap for full
 * screen), and who receives it with a direct call button. The recipient is not
 * part of the masked-call session (that reaches the sender only), so this dials
 * their real number — the only place the captain ever sees it.
 */
export function BoxDetailsCard({ tripId, details, isLoading, isError, onRetry, dropoffAddress }: BoxDetailsCardProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [callFailed, setCallFailed] = useState(false)

  const phone = details?.recipientPhone ?? ''

  async function callRecipient() {
    setCallFailed(false)
    // No dialer (simulator, tablet) → say so instead of failing silently.
    setCallFailed(!(await openDialer(phone)))
  }

  const label = { ...Typography.micro, color: colors.subtle, fontStyle: 'normal', textAlign: 'left' } as const

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        padding: Spacing.lg,
        gap: Spacing.md,
      }}
    >
      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <Icon name="cube" size={18} color={colors.tint} />
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', textAlign: 'left', flex: 1 }}>
          {t('captain.box.title')}
        </Text>
      </View>

      {!details ? (
        isLoading || !isError ? (
          <View style={{ paddingVertical: Spacing.md, alignItems: 'center' }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            <Text selectable style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'left' }}>
              {t('captain.box.loadFailed')}
            </Text>
            <TouchableOpacity onPress={onRetry} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ ...Typography['body-md'], fontSize: 14, color: colors.tint, textAlign: 'left' }}>
                {t('common.retry')}
              </Text>
            </TouchableOpacity>
          </View>
        )
      ) : (
        <>
          {/* What is being sent */}
          <View style={{ gap: 2 }}>
            <Text style={label}>{t('captain.box.item')}</Text>
            <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
              <Text
                numberOfLines={expanded ? undefined : COLLAPSED_LINES}
                style={{ ...Typography.body, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'left' }}
              >
                {details.description}
              </Text>
            </Pressable>
          </View>

          {/* Photos — tap one to open the full-screen viewer on it */}
          {details.photoUrls.length > 0 ? (
            <View style={{ gap: Spacing.xs }}>
              <Text style={label}>{t('captain.box.photoCount', { count: details.photoUrls.length })}</Text>
              {/* native forceRTL mirrors this row in AR — no manual flip */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {details.photoUrls.map((uri, i) => (
                  <BoxPhotoThumb
                    key={i}
                    tripId={tripId}
                    index={i}
                    uri={uri}
                    size={THUMB}
                    onPress={() => setViewerIndex(i)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
              {t('captain.box.noPhoto')}
            </Text>
          )}

          <View style={{ height: 1, backgroundColor: colors.border }} />

          {/* Recipient: name, then the number on its OWN full-width line (it must
              never wrap), then where it goes, then a full-width call button. */}
          <View style={{ gap: Spacing.sm }}>
            <View style={{ gap: 1 }}>
              <Text style={label}>{t('captain.box.recipient')}</Text>
              {details.recipientName ? (
                <Text selectable numberOfLines={1} style={{ ...Typography['body-md'], color: colors.text, textAlign: 'left' }}>
                  {details.recipientName}
                </Text>
              ) : null}
              {/* A Latin-digit phone: LTR (style for iOS, isolate from formatPhoneDisplay
                  for Android) keeps "+964 770 …" in order inside the RTL screen;
                  textAlign 'left' still puts it at the reading start. */}
              <Text
                selectable
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  ...Typography['heading-sm'],
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                  writingDirection: 'ltr',
                  textAlign: 'left',
                }}
              >
                {formatPhoneDisplay(phone)}
              </Text>
            </View>
            {dropoffAddress ? (
              // native forceRTL mirrors this row in AR — no manual flip
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
                <View style={{ paddingTop: 2 }}>
                  <Icon name="location" size={15} color={colors.destructive} />
                </View>
                <Text numberOfLines={2} style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left', flex: 1 }}>
                  {dropoffAddress}
                </Text>
              </View>
            ) : null}
            <Button
              label={t('captain.box.callRecipient')}
              variant="secondary"
              size="md"
              disabled={!phone}
              leading={<Icon name="call" size={18} color={colors.tint} />}
              onPress={callRecipient}
            />
            {callFailed && (
              <Text selectable style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'left' }}>
                {t('captain.live.callUnavailable')}
              </Text>
            )}
          </View>

          <BoxPhotoViewer
            tripId={tripId}
            photoUrls={details.photoUrls}
            openIndex={viewerIndex}
            onClose={() => setViewerIndex(null)}
          />
        </>
      )}
    </View>
  )
}
