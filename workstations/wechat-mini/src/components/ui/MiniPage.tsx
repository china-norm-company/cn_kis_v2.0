import { ReactNode } from 'react'
import { View, Text } from '@tarojs/components'

interface MiniPageProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function MiniPage({ title, subtitle, children }: MiniPageProps) {
  return (
    <View className='mini-page'>
      <Text className='mini-page__title'>{title}</Text>
      {subtitle ? <Text className='mini-page__subtitle'>{subtitle}</Text> : null}
      {children}
    </View>
  )
}
