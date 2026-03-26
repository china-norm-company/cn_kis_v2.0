import { View, Text } from '@tarojs/components'
import { MiniPage } from '@/components/ui'
import './index.scss'

const FAQ_ITEMS = [
  {
    q: '如何参与研究项目？',
    a: '在首页或项目发现页浏览可参与项目，按流程完成报名、筛选与知情同意后即可入组。',
  },
  {
    q: '参与研究是否有补偿？',
    a: '根据项目设计，部分研究会提供交通补贴、时间补偿或产品试用等，具体以项目说明为准。',
  },
  {
    q: '可以中途退出吗？',
    a: '可以。您有权随时退出研究，无需说明理由，且不会影响您已获得的权益或后续医疗照护。',
  },
  {
    q: '个人信息如何保护？',
    a: '您的信息将严格保密，仅用于研究目的，并遵循相关法规。未经您同意不会向第三方披露。',
  },
  {
    q: '忘记预约时间怎么办？',
    a: '可在「访视」或「预约管理」中查看下次访视安排，也可联系客服或查看消息通知。',
  },
  {
    q: '如何联系客服？',
    a: '可通过「客服咨询」页面提交工单，或拨打项目提供的联系电话进行咨询。',
  },
]

export default function FaqPage() {
  return (
    <MiniPage title='常见问题'>
      <View className='faq-page'>
        <View className='faq-list'>
          {FAQ_ITEMS.map((item, idx) => (
            <View key={idx} className='faq-card'>
              <Text className='faq-card__q'>{item.q}</Text>
              <Text className='faq-card__a'>{item.a}</Text>
            </View>
          ))}
        </View>
      </View>
    </MiniPage>
  )
}
