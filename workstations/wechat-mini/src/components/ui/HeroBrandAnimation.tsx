import { View, Image } from '@tarojs/components'
import './HeroBrandAnimation.scss'

/** 仅打包 GIF：APNG 约 700KB+，会导致微信小程序主包超过 2MB（错误码 80051） */
const HERO_GIF = '/assets/hero-brand.gif'

interface HeroBrandAnimationProps {
  compact?: boolean
  className?: string
}

export default function HeroBrandAnimation(props: HeroBrandAnimationProps) {
  const classes = ['hero-brand']
  if (props.compact) classes.push('hero-brand--compact')
  if (props.className) classes.push(props.className)

  return (
    <View className={classes.join(' ')}>
      <Image className='hero-brand__img hero-brand__img--show' src={HERO_GIF} mode='aspectFit' />
    </View>
  )
}
