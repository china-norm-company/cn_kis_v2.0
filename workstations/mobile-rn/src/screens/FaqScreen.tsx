import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

const FAQ_ITEMS = [
  {
    q: '如何报名参加临床研究？',
    a: '在「项目」页面浏览开放招募的研究，选择感兴趣的项目后点击「报名」，按提示完成信息填写和筛选流程。',
  },
  {
    q: '参与研究需要付费吗？',
    a: '不需要。符合条件参与研究的受试者通常可获得交通补贴、时间补偿等，具体以各项目说明为准。',
  },
  {
    q: '我可以中途退出吗？',
    a: '可以。您有权在任何时候退出研究，无需说明理由，且不会影响您获得应有的医疗照护。',
  },
  {
    q: '我的个人信息会保密吗？',
    a: '会。您的个人信息和健康数据将严格保密，仅用于研究目的，并符合相关法规要求。',
  },
  {
    q: '如何查看我的访视安排？',
    a: '在「访视」页面可查看您的访视时间线、预约记录和排程信息。',
  },
]

export function FaqScreen() {
  useAuth()
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  return (
    <RNPage title="常见问题">
      {FAQ_ITEMS.map((item, i) => {
        const isExpanded = expandedIndex === i
        return (
          <RNCard key={i}>
            <Pressable
              style={styles.accordionHeader}
              onPress={() => setExpandedIndex(isExpanded ? null : i)}
            >
              <Text style={styles.question}>{item.q}</Text>
              <Text style={styles.arrow}>{isExpanded ? '▼' : '▶'}</Text>
            </Pressable>
            {isExpanded && (
              <View style={styles.answerWrap}>
                <Text style={styles.answer}>{item.a}</Text>
              </View>
            )}
          </RNCard>
        )
      })}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touchMinHeight,
  },
  question: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    flex: 1,
  },
  arrow: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textMuted,
    marginLeft: theme.spacing.sm,
  },
  answerWrap: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.borderLight,
  },
  answer: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    lineHeight: 22,
  },
})
