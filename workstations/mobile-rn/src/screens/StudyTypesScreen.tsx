import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

const STUDY_TYPES = [
  {
    name: '干预性研究',
    description: '研究者主动给予受试者某种干预措施（如药物、器械、手术等），观察其效果和安全性。',
  },
  {
    name: '观察性研究',
    description: '不施加干预，仅观察和记录受试者的自然状态、暴露因素与结局的关系。',
  },
  {
    name: '诊断性研究',
    description: '评估新的诊断方法或技术的准确性，与金标准进行比较。',
  },
  {
    name: '流行病学研究',
    description: '研究疾病在人群中的分布、影响因素及预防控制策略。',
  },
]

export function StudyTypesScreen() {
  useAuth()

  return (
    <RNPage title="研究类型说明">
      <Text style={styles.intro}>
        临床研究根据设计和方法可分为多种类型，以下为常见分类：
      </Text>
      {STUDY_TYPES.map((item, i) => (
        <RNCard key={i}>
          <Text style={styles.typeName}>{item.name}</Text>
          <Text style={styles.typeDesc}>{item.description}</Text>
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
  typeName: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  typeDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    lineHeight: 22,
  },
})
