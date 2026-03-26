import { View, Text } from '@tarojs/components'
import { MiniPage } from '@/components/ui'
import './index.scss'

const STUDY_TYPES = [
  {
    title: '临床测试',
    desc: '在受控环境下验证药物、医疗器械或干预措施的安全性与有效性，遵循 GCP 规范，由研究者主导执行。',
  },
  {
    title: '消费者研究',
    desc: '面向普通消费者的产品体验研究，评估使用感受、偏好与满意度，通常为非干预性观察。',
  },
  {
    title: 'HUT（家庭使用测试）',
    desc: '受试者在真实家庭环境中使用产品，记录使用习惯与反馈，用于产品改进与市场验证。',
  },
  {
    title: 'RWS（真实世界研究）',
    desc: '在真实临床或日常场景中收集数据，用于补充临床试验证据，支持监管决策与临床实践。',
  },
]

export default function StudyTypesPage() {
  return (
    <MiniPage title='研究类型说明'>
      <View className='study-types-page'>
        <Text className='study-types-intro'>本平台支持多种研究类型，帮助您了解参与的研究性质与流程。</Text>
        <View className='study-types-list'>
          {STUDY_TYPES.map((item) => (
            <View key={item.title} className='study-types-card'>
              <Text className='study-types-card__title'>{item.title}</Text>
              <Text className='study-types-card__desc'>{item.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </MiniPage>
  )
}
