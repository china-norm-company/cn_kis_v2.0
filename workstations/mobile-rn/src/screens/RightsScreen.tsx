import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

const RIGHTS = [
  {
    title: '知情同意权',
    description: '您有权在参与研究前充分了解研究目的、流程、风险与获益，并在自愿基础上签署知情同意书。',
  },
  {
    title: '随时退出权',
    description: '您有权在任何时候、无需说明理由退出研究，且不会影响您获得应有的医疗照护。',
  },
  {
    title: '隐私保护权',
    description: '您的个人信息和健康数据将严格保密，仅用于研究目的，并符合相关法规要求。',
  },
  {
    title: '获得补偿权',
    description: '完成研究相关任务后，您有权获得约定的补偿（如交通补贴、时间补偿等）。',
  },
  {
    title: '获得信息权',
    description: '您有权了解研究进展、自身检测结果及与研究相关的重大信息。',
  },
]

export function RightsScreen() {
  useAuth()

  return (
    <RNPage title="受试者权益">
      <Text style={styles.intro}>
        作为临床研究受试者，您享有以下基本权益：
      </Text>
      {RIGHTS.map((item, i) => (
        <RNCard key={i}>
          <Text style={styles.rightTitle}>{item.title}</Text>
          <Text style={styles.rightDesc}>{item.description}</Text>
        </RNCard>
      ))}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  intro: {
    fontSize: theme.fontSize.md,
    color: theme.color.textSecondary,
    lineHeight: 24,
    marginBottom: theme.spacing.md,
  },
  rightTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  rightDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    lineHeight: 22,
  },
})
