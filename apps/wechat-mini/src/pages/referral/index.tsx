import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints, type MyReferralItem } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'
import { MiniPage, MiniCard, MiniButton, MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

export default function ReferralPage() {
  const [referrals, setReferrals] = useState<MyReferralItem[]>([])
  const [loading, setLoading] = useState(true)
  const subjectNo = taroAuthProvider.getLocalUserInfo()?.subjectNo || ''

  useEffect(() => {
    subjectApi.getMyReferrals().then((res) => {
      const refData = res.data as { items?: MyReferralItem[] } | null
      if (res.code === 200 && refData?.items) {
        setReferrals(refData.items)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleCopyCode = () => {
    if (!subjectNo) {
      Taro.showToast({ title: '暂无推荐码', icon: 'none' })
      return
    }
    Taro.setClipboardData({
      data: subjectNo,
      success: () => Taro.showToast({ title: '已复制到剪贴板', icon: 'success' }),
    })
  }

  const handleShareToFriend = () => {
    Taro.showShareMenu({ withShareTicket: true })
  }

  const handleGeneratePoster = () => {
    Taro.showModal({
      title: '功能说明',
      content: '推荐海报入口当前已下线，请使用“分享给朋友”完成推荐。',
      showCancel: false,
      confirmText: '我知道了',
    })
  }

  return (
    <MiniPage title='推荐朋友'>
      <MiniCard className='referral-hero'>
        <Text className='referral-hero__hint'>
          我的推荐码
        </Text>
        <Text className='referral-hero__code'>
          {subjectNo || '--'}
        </Text>
        <View className='referral-hero__actions'>
          <View className='referral-hero__action-item'>
            <MiniButton variant='secondary' onClick={handleCopyCode}>复制推荐码</MiniButton>
          </View>
          <View className='referral-hero__action-item'>
            <MiniButton variant='secondary' onClick={handleShareToFriend}>分享给朋友</MiniButton>
          </View>
        </View>
        <View className='referral-hero__poster'>
          <MiniButton variant='secondary' onClick={handleGeneratePoster}>生成推荐海报</MiniButton>
        </View>
      </MiniCard>

      <Text className='referral-section-title'>
        推荐记录
      </Text>

      {loading ? (
        <View className='referral-loading'>
          <Text className='referral-loading__text'>加载中...</Text>
        </View>
      ) : referrals.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.referral.empty.title}
          description={PAGE_COPY.referral.empty.description}
          icon={PAGE_COPY.referral.empty.icon}
        />
      ) : (
        referrals.map((item) => (
          <MiniCard key={item.id}>
            <View className='referral-item__header'>
              <Text className='referral-item__name'>
                {item.referred_name || '受试者'}
              </Text>
              <Text className={`referral-item__status ${item.status === 'completed' ? 'referral-item__status--done' : ''}`}>
                {item.status === 'completed' ? '已入组' : item.status || '待入组'}
              </Text>
            </View>
            {item.reward_amount != null && item.reward_amount > 0 && (
              <Text className='referral-item__reward'>
                奖励: ¥{item.reward_amount}
              </Text>
            )}
          </MiniCard>
        ))
      )}
    </MiniPage>
  )
}
