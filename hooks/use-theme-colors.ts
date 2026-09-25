import { createContext, createElement, useContext, type ReactNode } from 'react'
import { Colors, type ThemeColors } from '@/constants/Colors'
import { useThemeStore } from '@/store/theme-store'

type Scheme = keyof typeof Colors

// Pins a subtree to one scheme regardless of the user's preference — for screens
// drawn over fixed artwork (the auth background) whose contrast only works one way.
const SchemeOverrideContext = createContext<Scheme | null>(null)

export function SchemeOverride({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return createElement(SchemeOverrideContext.Provider, { value: scheme }, children)
}

export function useThemeColors(): ThemeColors {
  const override = useContext(SchemeOverrideContext)
  const scheme = useThemeStore((s) => s.scheme)
  return Colors[override ?? scheme]
}
