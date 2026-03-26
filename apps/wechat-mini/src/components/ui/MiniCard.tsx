import { ReactNode } from 'react'
import { View } from '@tarojs/components'

interface MiniCardProps {
  children: ReactNode
  className?: string
}

export default function MiniCard({ children, className = '' }: MiniCardProps) {
  const cls = className ? `mini-card ${className}` : 'mini-card'
  return <View className={cls}>{children}</View>
}
