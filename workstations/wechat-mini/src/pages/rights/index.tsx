import { View, Text } from '@tarojs/components'
import { MiniPage } from '@/components/ui'
import './index.scss'

const RIGHTS_ITEMS = [
  {
    title: '受试者权益',
    desc: '您有权充分了解研究目的、流程、风险与获益；有权在签署知情同意书前获得充分说明；有权随时向研究者或伦理委员会提出疑问与投诉。',
  },
  {
    title: '隐私保护',
    desc: '您的个人信息与健康数据将严格保密，仅用于研究目的，并遵循相关法规要求。未经您同意，不会向第三方披露可识别身份的信息。',
  },
  {
    title: '退出权',
    desc: '您有权在任何时候、以任何理由退出研究，无需承担任何责任。退出不会影响您已获得的医疗照护或后续权益。',
  },
]

export default function RightsPage() {
  return (
    <MiniPage title='受试者权益'>
      <View className='rights-page'>
        <Text className='rights-intro'>参与研究前，请了解您享有的基本权益与保障。</Text>
        <View className='rights-list'>
          {RIGHTS_ITEMS.map((item) => (
            <View key={item.title} className='rights-card'>
              <Text className='rights-card__title'>{item.title}</Text>
              <Text className='rights-card__desc'>{item.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </MiniPage>
  )
}
