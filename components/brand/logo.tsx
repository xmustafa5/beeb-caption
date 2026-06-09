import { Image } from 'expo-image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'dark' | 'white'
}

const HEIGHTS = {
  sm: 22,
  md: 32,
  lg: 48,
  xl: 72,
} as const

const ASPECT = 220 / 75

export function Logo({ size = 'md', variant = 'dark' }: LogoProps) {
  const h = HEIGHTS[size]
  return (
    <Image
      source={
        variant === 'white'
          ? require('@/assets/images/logo-white.png')
          : require('@/assets/images/logo.png')
      }
      style={{ height: h, width: h * ASPECT }}
      contentFit="contain"
    />
  )
}
