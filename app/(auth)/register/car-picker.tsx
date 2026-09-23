// app/(auth)/register/car-picker.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, TouchableOpacity, BackHandler, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { useRegistrationStore } from '@/store/registration-store'
import {
  getBrands,
  getModels,
  searchVehicles,
  brandName,
  modelName,
  hitBrandName,
  type VehicleBrand,
  type VehicleModel,
  type VehicleSearchHit,
} from '@/services/vehicle-catalog'
import { contentLanguage } from '@/i18n/languages'

const isRTL = I18nManager.isRTL

/**
 * Popular-in-Iraq makes, pinned to the top of the browse list.
 *
 * These twelve names ARE the backend's own seeded `sort_order` ranks 1–12 — we
 * are not inventing a taste here, just restating the server's intent.
 *
 * Why restate it at all: `GET /api/vehicle-catalog/brands` currently runs
 * `ORDER BY sort_order DESC` over a rank where 1 = most common, so the order
 * arrives INVERTED — index 0 is "LYNK & CO" (rank 141) and Toyota (rank 1) is
 * dead last at index 140 of 141. See BACKEND_ISSUES.md #11.
 *
 * Deliberately NOT a reversal of the server array: a reversal silently breaks
 * the day the backend fixes its ORDER BY. Pinning by name degrades gracefully —
 * a name that doesn't match simply isn't pinned and still appears in "All makes"
 * below, and the whole thing stays correct in both the broken and fixed worlds.
 */
const POPULAR_BRANDS_EN = [
  'Toyota',
  'Soueast',
  'Mercedes-Benz',
  'Kia',
  'BYD',
  'GAC',
  'Nissan',
  'Jetour',
  'Mitsubishi',
  'Volkswagen',
  'Geely',
  'Hyundai',
] as const

const POPULAR_RANK = new Map(POPULAR_BRANDS_EN.map((n, i) => [n.toLowerCase(), i]))

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'brand'; key: string; brand: VehicleBrand }
  | { kind: 'model'; key: string; model: VehicleModel }
  | { kind: 'hit'; key: string; hit: VehicleSearchHit }

export default function CarPickerScreen() {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const setCar = useRegistrationStore((s) => s.setCar)
  // Catalog names come in en/ar only; Kurdish reads (and sorts) the Arabic ones.
  const lang = contentLanguage(i18n.language)

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // Step B of BROWSE: the brand whose models are on screen (null = brand list).
  const [openBrand, setOpenBrand] = useState<VehicleBrand | null>(null)

  // Debounced search term — same useRef<ReturnType<typeof setTimeout>> +
  // clearTimeout-in-cleanup idiom as components/trip/location-picker.tsx.
  // Staleness is handled by TanStack Query rather than a generation counter:
  // the debounced term is part of the queryKey, so an in-flight response for an
  // older term can never land in the newer term's cache entry.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebounced(query.trim()), 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query])

  const searching = debounced.length >= 2
  const browsingModels = !searching && !!openBrand

  const brands = useQuery({
    queryKey: ['vehicle-catalog', 'brands'],
    queryFn: getBrands,
    staleTime: 1000 * 60 * 60, // the catalog barely moves
    enabled: !searching && !openBrand,
  })

  const models = useQuery({
    queryKey: ['vehicle-catalog', 'models', openBrand?.id],
    queryFn: () => getModels(openBrand!.id),
    staleTime: 1000 * 60 * 60,
    enabled: browsingModels,
  })

  const hits = useQuery({
    queryKey: ['vehicle-catalog', 'search', debounced],
    queryFn: () => searchVehicles(debounced),
    staleTime: 1000 * 60 * 5,
    enabled: searching,
  })

  const rows = useMemo<Row[]>(() => {
    if (searching) {
      return (hits.data ?? []).map((h) => ({ kind: 'hit' as const, key: h.id, hit: h }))
    }
    if (openBrand) {
      return (models.data ?? []).map((m) => ({ kind: 'model' as const, key: m.id, model: m }))
    }
    const all = brands.data ?? []
    const popular = all
      .filter((b) => POPULAR_RANK.has(b.nameEn.trim().toLowerCase()))
      .sort(
        (a, b) =>
          (POPULAR_RANK.get(a.nameEn.trim().toLowerCase()) ?? 0) -
          (POPULAR_RANK.get(b.nameEn.trim().toLowerCase()) ?? 0),
      )
    const out: Row[] = []
    if (popular.length > 0) {
      out.push({ kind: 'header', key: 'h-popular', label: t('captain.register.commonMakes') })
      // Prefixed keys: a pinned brand also appears in "All makes", so the raw id
      // would collide as a FlatList key.
      for (const b of popular) out.push({ kind: 'brand', key: `p-${b.id}`, brand: b })
    }
    if (all.length > 0) {
      out.push({ kind: 'header', key: 'h-all', label: t('captain.register.allMakes') })
      // Sort by the LOCALIZED label, not by the server array. The server's order
      // arrives inverted (BACKEND_ISSUES.md #11) and, because every sort_order is
      // distinct, its documented "name_en ASC" tiebreak never applies — so without
      // this the 129 unpinned makes are in effectively random order with no letter
      // to scan for. Sorting client-side stays correct whether or not the backend
      // ever fixes its ORDER BY, and leaves the pinned popular section untouched.
      const sorted = [...all].sort((x, y) => brandName(x, lang).localeCompare(brandName(y, lang), lang))
      for (const b of sorted) out.push({ kind: 'brand', key: `a-${b.id}`, brand: b })
    }
    return out
  }, [searching, hits.data, openBrand, models.data, brands.data, t, lang])

  const active = searching ? hits : openBrand ? models : brands
  const isLoading = active.isLoading || active.isFetching
  const isError = active.isError

  const chooseModel = (m: VehicleModel, brandEn: string, brandLabel: string) => {
    setCar({
      carBrandId: m.brandId,
      carModelId: m.id,
      carBrandName: brandLabel,
      carModelName: modelName(m, lang),
      // car_make / car_model are STILL REQUIRED strings on the register call, and
      // the catalog ids do not replace them. Send the ENGLISH names so admins read
      // something sane and the server's free-text fuzzy match is a no-op.
      carMake: brandEn,
      carModel: m.nameEn || m.nameAr,
    })
    router.back()
  }

  // Android's hardware back (the primary navigation gesture for this audience)
  // otherwise pops the whole modal route, throwing away the captain's place in a
  // 141-row list. While a brand's models are on screen, back means "up one level".
  useEffect(() => {
    if (!browsingModels) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpenBrand(null)
      return true
    })
    return () => sub.remove()
  }, [browsingModels])

  const onBack = () => {
    // Inside BROWSE step B, "back" returns to the brand list; at the top level it
    // leaves the picker. The captain is never trapped: leaving the picker returns
    // to the vehicle step, which still offers the free-text fallback.
    if (browsingModels) {
      setOpenBrand(null)
      return
    }
    router.back()
  }

  const title = browsingModels ? brandName(openBrand!, lang) : t('captain.register.carPickerTitle')

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'header') {
      return (
        <Text
          style={{
            ...Typography['input-label'],
            color: colors.subtle,
            fontStyle: 'normal',
            textTransform: 'uppercase',
            fontSize: 11,
            letterSpacing: 0.6,
            textAlign: 'left',
            paddingHorizontal: Spacing.xl,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.sm,
          }}
        >
          {item.label}
        </Text>
      )
    }

    if (item.kind === 'brand') {
      const b = item.brand
      return (
        <RowButton onPress={() => setOpenBrand(b)} colors={colors}>
          <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1, textAlign: 'left' }} numberOfLines={1}>
            {brandName(b, lang)}
          </Text>
          {/* Chevron points toward the reading-direction end — swap glyph in AR. */}
          <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
        </RowButton>
      )
    }

    if (item.kind === 'model') {
      const m = item.model
      return (
        <RowButton
          onPress={() => chooseModel(m, openBrand!.nameEn || openBrand!.nameAr, brandName(openBrand!, lang))}
          colors={colors}
        >
          <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1, textAlign: 'left' }} numberOfLines={1}>
            {modelName(m, lang)}
          </Text>
        </RowButton>
      )
    }

    const h = item.hit
    return (
      <RowButton onPress={() => chooseModel(h, h.brandNameEn || h.brandNameAr, hitBrandName(h, lang))} colors={colors}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'left' }} numberOfLines={1}>
            {modelName(h, lang)}
          </Text>
          <Text
            style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}
            numberOfLines={1}
          >
            {hitBrandName(h, lang)}
          </Text>
        </View>
      </RowButton>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + Spacing.md, paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
        {/* native forceRTL mirrors this row in AR — no manual flip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} accessibilityRole="button" hitSlop={10}>
            {/* Back glyph points toward the reading start — swap glyph in AR. */}
            <Icon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ ...Typography['heading-md'], color: colors.text, flex: 1, textAlign: 'left' }} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {/* Search is the primary path — 141 makes is a lot to scroll — so it autofocuses. */}
        <Input
          value={query}
          onChangeText={(v) => {
            setQuery(v)
            // Typing takes over from BROWSE: drop the open brand so clearing the
            // search returns to the brand list (and the header stops naming a
            // brand whose models aren't what's on screen).
            if (v.length > 0) setOpenBrand(null)
          }}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          placeholder={t('captain.register.carSearchPlaceholder')}
          leading={<Icon name="search" size={18} color={colors.subtle} />}
          trailing={
            query.length > 0 ? (
              <TouchableOpacity
                onPress={() => setQuery('')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('captain.register.carSearchClear')}
                hitSlop={10}
              >
                <Icon name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            ) : undefined
          }
        />
      </View>

      {isError ? (
        <View style={{ padding: Spacing.xl, gap: Spacing.lg }}>
          <FormError message={t('captain.register.carCatalogFailed')} />
          <Button label={t('common.retry')} variant="secondary" size="md" onPress={() => active.refetch()} />
          {/* Never trap the captain: backing out reveals the free-text fallback. */}
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
            {t('captain.register.carCatalogFallbackHint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl, flexGrow: 1 }}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ paddingTop: Spacing.xl * 2 }}>
                <ActivityIndicator color={colors.tint} />
              </View>
            ) : (
              <View style={{ paddingTop: Spacing.xl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.sm }}>
                <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'left' }}>
                  {t('captain.register.carNoResults')}
                </Text>
                {/* An empty models array is a VALID backend answer, not an error —
                    point the captain back at the search box instead of failing. */}
                <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
                  {t('captain.register.carNoResultsHint')}
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  )
}

function RowButton({
  onPress,
  colors,
  children,
}: {
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.xl,
        backgroundColor: pressed ? colors.surface : 'transparent',
      })}
    >
      {children}
    </Pressable>
  )
}
