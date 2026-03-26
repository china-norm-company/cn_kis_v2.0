import { View, Text } from '@tarojs/components'
import MiniButton from './MiniButton'

interface MiniEmptyProps {
  title: string
  description?: string
  icon?: string
  actionText?: string
  onAction?: () => void
}

export default function MiniEmpty({ title, description, icon = '🌿', actionText, onAction }: MiniEmptyProps) {
  return (
    <View className='mini-empty'>
      <Text className='mini-empty__icon'>{icon}</Text>
      <Text className='mini-empty__title'>{title}</Text>
      {description ? <Text className='mini-empty__desc'>{description}</Text> : null}
      {actionText ? (
        <View className='mini-empty__action'>
          <MiniButton variant='secondary' onClick={onAction}>{actionText}</MiniButton>
        </View>
      ) : null}
    </View>
  )
}
