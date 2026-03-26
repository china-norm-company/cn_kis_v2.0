import { ReactNode } from 'react'
import { View, Text } from '@tarojs/components'

interface MiniButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

export default function MiniButton({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
}: MiniButtonProps) {
  const cls = `mini-btn mini-btn--${variant}${disabled ? ' mini-btn--disabled' : ''}`
  return (
    <View className={cls} onClick={disabled ? undefined : onClick}>
      <Text className='mini-btn__text'>{children}</Text>
    </View>
  )
}
