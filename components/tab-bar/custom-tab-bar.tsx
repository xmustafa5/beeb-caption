import { View, TouchableOpacity, Text, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Icon } from '@/components/ui/icon'
import { Typography } from '@/constants/Typography'
import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'

type IoniconName = ComponentProps<typeof Ionicons>['name']

interface TabDef {
  name: string
  icon: IoniconName
  labelKey: string
}

const TAB_DEFS: TabDef[] = [
  { name: 'index',         icon: 'home',          labelKey: 'tabs.home'          },
  { name: 'trips',         icon: 'list',          labelKey: 'captain.queue.tabLabel' },
  { name: 'notifications', icon: 'cash',          labelKey: 'captain.earnings.tabLabel' },
  { name: 'profile',       icon: 'person',        labelKey: 'tabs.profile'       },
]

interface CustomTabBarProps {
  activeIndex: number
  onTabPress: (index: number) => void
  badges?: Partial<Record<number, number>>
}

export function CustomTabBar({ activeIndex, onTabPress, badges }: CustomTabBarProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      paddingBottom: insets.bottom || 12,
      paddingTop: 8,
      paddingHorizontal: 8,
      alignItems: 'flex-end',
      boxShadow: '0px -2px 12px rgba(0, 0, 0, 0.04)',
    }}>
      {TAB_DEFS.map((tab, i) => {
        const active = activeIndex === i
        const badge = badges?.[i]
        return (
          <TabItem
            key={tab.name}
            icon={tab.icon}
            label={t(tab.labelKey)}
            active={active}
            onPress={() => onTabPress(i)}
            colors={colors}
            isRTL={I18nManager.isRTL}
            badge={badge}
          />
        )
      })}
    </View>
  )
}

interface TabItemProps {
  icon: IoniconName
  label: string
  active: boolean
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  isRTL?: boolean
  badge?: number
}

function TabItem({ icon, label, active, onPress, colors, isRTL, badge }: TabItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 4,
        gap: 3,
      }}
    >
      <View style={{ position: 'relative' }}>
        <Icon
          name={active ? icon : `${icon}-outline` as IoniconName}
          size={24}
          color={active ? colors.text : colors.tabIconDefault}
        />
        {badge != null && badge > 0 && (
          <View style={{
            position: 'absolute',
            top: -6,
            ...(isRTL ? { left: -8 } : { right: -8 }),
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.destructive,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
            borderWidth: 1.5,
            borderColor: colors.card,
          }}>
            <Text style={{
              ...Typography.micro,
              color: '#FFFFFF',
              fontSize: 9,
              fontFamily: 'Poppins_600SemiBold',
              fontStyle: 'normal',
            }}>
              {badge > 99 ? '99+' : String(badge)}
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{
          ...Typography['caption-sm'],
          fontStyle: 'normal',
          fontSize: 11,
          fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
          color: active ? colors.text : colors.tabIconDefault,
        }}
      >
        {label}
      </Text>
      <View style={{
        height: 3,
        width: active ? 22 : 0,
        borderRadius: 2,
        backgroundColor: colors.tint,
        marginTop: 2,
      }} />
    </TouchableOpacity>
  )
}
