import { ScrollView, View, Text, TouchableOpacity, I18nManager, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { useAuthStore } from '@/store/auth-store'
import { useThemeStore } from '@/store/theme-store'
import { changeLanguage } from '@/i18n'

const isRTL = I18nManager.isRTL

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const captain = useAuthStore((s) => s.captain)
  const lang = i18n.language as 'en' | 'ar'
  const themePref = useThemeStore((s) => s.preference)
  const setThemePref = useThemeStore((s) => s.setPreference)

  if (!captain) return null

  const initials = captain.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const languageLabel = lang === 'ar' ? 'العربية' : 'English'
  const car = [captain.carColor, `${captain.carMake} ${captain.carModel}`].filter(Boolean).join(' · ')

  const onLogout = () => {
    Alert.alert(
      t('profile.logout'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logout'), style: 'destructive', onPress: () => useAuthStore.getState().clear() },
      ],
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: Spacing.xl * 2,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {/* ── Hero: avatar + name, no colored header ── */}
        <View style={{ alignItems: 'center', gap: Spacing.md }}>
          <View style={{
            width: 104,
            height: 104,
            borderRadius: 36,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{ ...Typography['heading-lg'], fontSize: 38, color: colors.tint }}>
              {initials}
            </Text>
          </View>

          <Text style={{ ...Typography['heading-lg'], fontSize: 24, color: colors.text, alignSelf: 'stretch', textAlign: isRTL ? 'right' : 'left' }} numberOfLines={1}>
            {captain.name || '—'}
          </Text>
          <Text
            selectable
            // Phone is Western digits — lock LTR so it reads left-to-right even under native forceRTL
            style={{ ...Typography.body, color: colors.subtle, fontVariant: ['tabular-nums'], writingDirection: 'ltr', marginTop: -4 }}
          >
            {captain.phone}
          </Text>

          {/* Inline chips: language + status */}
          {/* native forceRTL mirrors this row in AR — no manual flip */}
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs }}>
            <Chip icon="language-outline" label={languageLabel} onPress={() => changeLanguage(lang === 'en' ? 'ar' : 'en')} colors={colors} />
            <StatusChip status={captain.status} colors={colors} />
          </View>
        </View>

        {/* ── Stats: rating + trips ── */}
        <View style={{
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          marginTop: Spacing.xl,
          backgroundColor: colors.card,
          borderRadius: 18,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: Spacing.lg,
        }}>
          <Stat value={captain.avgRating ? captain.avgRating.toFixed(1) : '—'} label={t('profile.ratingStat')} icon="star" iconColor={colors.accent} colors={colors} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <Stat value={String(captain.tripCount ?? 0)} label={t('profile.tripsStat')} icon="car-sport" iconColor={colors.tint} colors={colors} />
        </View>

        {/* ── Vehicle card ── */}
        <View style={{ marginTop: Spacing.lg }}>
          <Text style={sectionLabel(colors)}>{t('profile.vehicleTitle')}</Text>
          <View style={{
            // native forceRTL mirrors this row in AR — no manual flip
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            backgroundColor: colors.card,
            borderRadius: 16,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing.lg,
          }}>
            <View style={{
              width: 44, height: 44, borderRadius: 12, borderCurve: 'continuous',
              backgroundColor: colors.tint + '1A',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="car-sport" size={22} color={colors.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }} numberOfLines={1}>
                {car || '—'}
              </Text>
              {/* Plate is a Western-digit ID — lock LTR so it isn't reordered under native forceRTL */}
              <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'], writingDirection: 'ltr', textAlign: isRTL ? 'right' : 'left' }} selectable>
                {captain.carPlate}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Theme switch ── */}
        <View style={{ marginTop: Spacing.xl }}>
          <ThemeRow
            value={themePref}
            onChange={setThemePref}
            options={[
              { value: 'system', icon: 'phone-portrait-outline', label: t('profile.themeSystem') },
              { value: 'light', icon: 'sunny-outline', label: t('profile.themeLight') },
              { value: 'dark', icon: 'moon-outline', label: t('profile.themeDark') },
            ]}
            label={t('profile.theme')}
            colors={colors}
          />
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity
          onPress={onLogout}
          activeOpacity={0.85}
          style={{
            // native forceRTL mirrors this row in AR — no manual flip
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            marginTop: Spacing.lg,
            backgroundColor: colors.card,
            borderRadius: 16,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing.lg,
          }}
        >
          <View style={{
            width: 36, height: 36, borderRadius: 10, borderCurve: 'continuous',
            backgroundColor: colors.destructive + '1A',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="log-out-outline" size={18} color={colors.destructive} />
          </View>
          <Text style={{ ...Typography['body-md'], color: colors.destructive, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
            {t('profile.logout')}
          </Text>
        </TouchableOpacity>

        <Text style={{ ...Typography.micro, color: colors.muted, fontStyle: 'normal', textAlign: 'center', marginTop: Spacing.lg }}>
          Beeb Captain · 1.0.0
        </Text>
      </ScrollView>
    </View>
  )
}

function sectionLabel(colors: ReturnType<typeof useThemeColors>) {
  return {
    ...Typography['input-label'],
    color: colors.subtle,
    fontStyle: 'normal' as const,
    textTransform: 'uppercase' as const,
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
  }
}

interface ChipProps {
  icon: React.ComponentProps<typeof Icon>['name']
  label: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
}

function Chip({ icon, label, onPress, colors }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surface,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Icon name={icon} size={15} color={colors.subtle} />
      <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>{label}</Text>
    </TouchableOpacity>
  )
}

function StatusChip({ status, colors }: { status: string; colors: ReturnType<typeof useThemeColors> }) {
  const tone = status === 'approved' ? colors.success : status === 'pending' ? colors.accent : colors.destructive
  return (
    <View style={{
      // native forceRTL mirrors this row in AR — no manual flip
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tone + '1A',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: tone }} />
      <Text style={{ ...Typography['caption-sm'], color: tone, fontStyle: 'normal', textTransform: 'capitalize' }}>{status}</Text>
    </View>
  )
}

interface StatProps {
  value: string
  label: string
  icon: React.ComponentProps<typeof Icon>['name']
  iconColor: string
  colors: ReturnType<typeof useThemeColors>
}

function Stat({ value, label, icon, iconColor, colors }: StatProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={16} color={iconColor} />
        {/* Stat value is a Western number — lock LTR so digits stay ltr under native forceRTL */}
        <Text style={{ ...Typography['heading-md'], color: colors.text, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>{value}</Text>
      </View>
      <Text style={{ ...Typography.micro, color: colors.subtle, fontStyle: 'normal', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
    </View>
  )
}

interface ThemeRowProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; icon: React.ComponentProps<typeof Icon>['name']; label: string }[]
  colors: ReturnType<typeof useThemeColors>
}

function ThemeRow<T extends string>({ label, value, onChange, options, colors }: ThemeRowProps<T>) {
  const activeLabel = options.find((o) => o.value === value)?.label ?? ''
  return (
    <View style={{
      // native forceRTL mirrors this row in AR — no manual flip
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.lg,
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10, borderCurve: 'continuous',
        backgroundColor: colors.tint + '1A',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="contrast-outline" size={18} color={colors.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>{activeLabel}</Text>
      </View>
      <View style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}>
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                width: 38, height: 32, borderRadius: 999, borderCurve: 'continuous',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? colors.tint : 'transparent',
              }}
            >
              <Icon name={opt.icon} size={17} color={active ? colors.onTint : colors.subtle} />
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
