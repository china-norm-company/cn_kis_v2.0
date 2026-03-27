/**
 * 仅用于验证 HeroBrandAnimation 组件 CSS 是否正确生成与显示
 * 不依赖登录、API，仅渲染组件本身
 */
import { View } from '@tarojs/components'
import HeroBrandAnimation from '@/components/ui/HeroBrandAnimation'
import './index.scss'

export default function DemoHeroPage() {
  return (
    <View className='demo-hero-page'>
      <View className='demo-hero-page__label'>大尺寸 (240rpx)</View>
      <HeroBrandAnimation />
      <View className='demo-hero-page__label'>紧凑尺寸 (132rpx)</View>
      <HeroBrandAnimation compact />
    </View>
  )
}
