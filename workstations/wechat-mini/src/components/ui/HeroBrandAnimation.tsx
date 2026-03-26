import { useState } from 'react'
import { View, Image } from '@tarojs/components'
import './HeroBrandAnimation.scss'

const HERO_APNG = '/assets/hero-brand.apng'
const HERO_GIF = '/assets/hero-brand.gif'

interface HeroBrandAnimationProps {
  compact?: boolean
  className?: string
}

export default function HeroBrandAnimation(props: HeroBrandAnimationProps) {
  const [apngFailed, setApngFailed] = useState(false)
  const classes = ['hero-brand']
  if (props.compact) classes.push('hero-brand--compact')
  if (props.className) classes.push(props.className)

  return (
    <View className={classes.join(' ')}>
      {!apngFailed && (
        <Image
          className='hero-brand__img'
          src={HERO_APNG}
          mode='aspectFit'
          onError={() => setApngFailed(true)}
        />
      )}
      <Image
        className={`hero-brand__img hero-brand__img--fallback ${apngFailed ? 'hero-brand__img--show' : ''}`}
        src={HERO_GIF}
        mode='aspectFit'
      />
    </View>
  )
}
