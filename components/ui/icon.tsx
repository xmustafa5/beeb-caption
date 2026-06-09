import { Ionicons } from '@expo/vector-icons'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

interface IconProps {
  name: IoniconsName
  size?: number
  color?: string
}

export function Icon({ name, size = 24, color }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />
}
