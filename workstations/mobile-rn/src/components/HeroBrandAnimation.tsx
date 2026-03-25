import React from 'react'
import { Image, StyleSheet, View } from 'react-native'

interface HeroBrandAnimationProps {
  compact?: boolean
}

// RN <Image> 原生支持 GIF 动画（iOS 原生 / Android 需 Fresco animated-gif，已在 gradle.properties 启用）。
// APNG 在 RN <Image> 中仅渲染首帧，不播放动画，因此统一使用 GIF。
const HERO_GIF = require('../assets/hero-brand.gif')

export function HeroBrandAnimation({ compact = false }: HeroBrandAnimationProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Image source={HERO_GIF} resizeMode="contain" style={styles.image} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  containerCompact: {
    width: 66,
    height: 66,
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
