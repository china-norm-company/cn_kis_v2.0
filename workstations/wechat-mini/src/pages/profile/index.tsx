import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { AUTH_LEVEL, type AuthLevel } from '@cn-kis/subject-core'

function getAuthLevelLabel(authLevel: AuthLevel | string): string {
  const labels: Record<string, string> = {
    [AUTH_LEVEL.GUEST]: '未认证',
    [AUTH_LEVEL.PHONE_VERIFIED]: '手机已认证',
    [AUTH_LEVEL.IDENTITY_VERIFIED]: '实名已认证',
  }
  return labels[authLevel] || '未认证'
}
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'
import { useIdentityStatus, useProfileAuth } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'
import './index.scss'

interface MenuItem {
  id: string
  label: string
  desc?: string
  icon: string
  url?: string
  danger?: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'identity', label: '实名认证', desc: '身份证+人脸核验，解锁签署与礼金', icon: '🔐', url: '/pages/identity-verify/index' },
  { id: 'myqrcode', label: '我的二维码', desc: '现场核验与签到', icon: '🔲', url: '/pages/myqrcode/index' },
  { id: 'consent', label: '知情同意记录', desc: '查看签署状态', icon: '📋', url: '/pages/consent/index' },
  { id: 'visits', label: '访视记录', desc: '时间线与窗口期', icon: '📅', url: '/pages/visit/index' },
  { id: 'questionnaires', label: '问卷记录', desc: '填写与历史记录', icon: '📝', url: '/pages/questionnaire/index' },
  { id: 'appointment', label: '我的预约', desc: '预约与改期管理', icon: '📅', url: '/pages/appointment/index' },
  { id: 'payment', label: '我的礼金', desc: '补贴发放明细', icon: '💰', url: '/pages/payment/index' },
  { id: 'products', label: '我的产品', desc: '领用、使用、归还', icon: '🧴', url: '/pages/products/index' },
  { id: 'support', label: '客服咨询', desc: '问题咨询与反馈', icon: '💬', url: '/pages/support/index' },
  { id: 'ai-chat', label: 'AI 助手', desc: '异步智能问答', icon: '🤖', url: '/pages/ai-chat/index' },
  { id: 'register', label: '自助报名', desc: '新项目报名入口', icon: '✍️', url: '/pages/register/index' },
  { id: 'report', label: '不良反应上报', desc: '异常情况快速上报', icon: '⚠️', url: '/pages/report/index' },
  { id: 'sample-confirm', label: '样品签收', desc: '研究样品签收确认', icon: '📦', url: '/pages/sample-confirm/index' },
  { id: 'withdraw', label: '退出研究', icon: '🚪', danger: true },
]

const PRIMARY_ACTIONS: Array<{ id: string; label: string; sub: string; url: string }> = [
  { id: 'appointment', label: '预约管理', sub: '预约与改期', url: '/pages/appointment/index' },
  { id: 'products', label: '我的产品', sub: '领用与归还', url: '/pages/products/index' },
  { id: 'myqrcode', label: '现场签到', sub: '二维码与核验', url: '/pages/myqrcode/index' },
  { id: 'report', label: '情况反馈', sub: '不良反应与问题', url: '/pages/report/index' },
]

export default function ProfilePage() {
  const { loggedIn, userInfo, refresh, doLogout } = useProfileAuth(taroAuthProvider)
  const { status: identityStatus, loading: authLoading, error: authError, isL2, reload: reloadIdentity } = useIdentityStatus(taroApiClient)
  const [identityWarning, setIdentityWarning] = useState('')
  const authLevel = identityStatus?.auth_level || AUTH_LEVEL.GUEST

  useDidShow(() => {
    refresh()
    const localUser = taroAuthProvider.getLocalUserInfo()
    if (taroAuthProvider.isLoggedIn() && !localUser) {
      setIdentityWarning('登录态存在但身份信息缺失，请重新进入或刷新')
    } else {
      setIdentityWarning('')
    }
    if (taroAuthProvider.isLoggedIn()) {
      reloadIdentity()
    } else {
      // no-op
    }
  })

  const openPage = (url: string) => {
    const isTabPage =
      url === '/pages/index/index' ||
      url === '/pages/visit/index' ||
      url === '/pages/profile/index'
    const navTask = isTabPage ? Taro.switchTab({ url }) : Taro.navigateTo({ url })
    navTask.catch(() => {
      Taro.showToast({ title: '页面打开失败，请重试', icon: 'none' })
    })
  }

  const handleMenuTap = (item: MenuItem) => {
    if (item.id === 'withdraw') {
      Taro.showModal({
        title: '退出研究',
        content: '退出研究后将无法继续参与，确定要退出吗？',
        confirmColor: '#e53e3e',
        confirmText: '确定退出',
        cancelText: '取消',
      }).then(res => {
        if (res.confirm) {
          Taro.showToast({ title: '请联系研究医生办理退出手续', icon: 'none' })
        }
      })
      return
    }

    if (item.url) openPage(item.url)
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmColor: '#e53e3e',
    }).then(res => {
      if (res.confirm) {
        doLogout()
        Taro.showToast({ title: '已退出登录', icon: 'success' })
      }
    })
  }

  return (
    <View className='profile-page'>
      <View className='profile-top-card'>
        <View className='profile-avatar'>
          <Text className='profile-avatar__text'>{userInfo?.name?.charAt(0) || '?'}</Text>
        </View>
        <View className='profile-user'>
          <Text className='profile-user__name'>
            {loggedIn ? (userInfo?.name || '受试者') : '未登录'}
          </Text>
          <Text className='profile-user__org'>消费者综合研究服务平台</Text>
          {loggedIn && (
            <>
              <View className='profile-user__row'>
                <Text className='profile-user__label'>认证等级</Text>
                <Text className='profile-user__value'>
                  {authLoading ? '加载中…' : authError ? '--' : getAuthLevelLabel(authLevel)}
                </Text>
              </View>
              {authError ? (
                <View className='profile-user__row profile-user__row--error'>
                  <Text className='profile-user__error'>{authError}</Text>
                </View>
              ) : null}
              <View className='profile-user__row'>
                <Text className='profile-user__label'>编号</Text>
                <Text className='profile-user__value'>{userInfo?.subjectNo || '--'}</Text>
              </View>
              <View className='profile-user__row'>
                <Text className='profile-user__label'>入组日期</Text>
                <Text className='profile-user__value'>{userInfo?.enrollDate || '--'}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {loggedIn && !isL2 && !authLoading ? (
        <View
          className='profile-l2-cta'
          onClick={() => Taro.navigateTo({ url: '/pages/identity-verify/index' })}
        >
          <Text className='profile-l2-cta__title'>完成实名认证</Text>
          <Text className='profile-l2-cta__desc'>可解锁签署知情同意书与礼金发放</Text>
          <Text className='profile-l2-cta__btn'>去认证</Text>
        </View>
      ) : null}

      {loggedIn ? (
        <>
          <View className='profile-note-card'>
            <Text className='profile-note-card__title'>温馨提醒</Text>
            <Text className='profile-note-card__text'>
              请定期查看预约、访视和消息通知，确保研究参与节奏稳定。
            </Text>
          </View>

          <View className='profile-primary-actions'>
            {PRIMARY_ACTIONS.map((action) => (
              <View key={action.id} className='profile-primary-actions__item' onClick={() => openPage(action.url)}>
                <Text className='profile-primary-actions__label'>{action.label}</Text>
                <Text className='profile-primary-actions__sub'>{action.sub}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {identityWarning ? (
        <View className='profile-warning-card' onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
          <Text className='profile-warning-card__title'>身份信息待修复</Text>
          <Text className='profile-warning-card__text'>{identityWarning}</Text>
        </View>
      ) : null}

      {/* 菜单列表 */}
      {loggedIn && (
        <View className='menu-card'>
          {MENU_ITEMS.map((item) => (
            <View
              key={item.id}
              className={`menu-item ${item.danger ? 'menu-item-danger' : ''}`}
              onClick={() => handleMenuTap(item)}
            >
              <View className='menu-left'>
                <Text className='menu-icon'>{item.icon}</Text>
                <View className='menu-texts'>
                  <Text className={`menu-label ${item.danger ? 'text-danger' : ''}`}>
                    {item.label}
                  </Text>
                  {item.desc ? <Text className='menu-desc'>{item.desc}</Text> : null}
                </View>
              </View>
              <Text className='menu-arrow'>›</Text>
            </View>
          ))}
        </View>
      )}

      {!loggedIn && (
        <View className='menu-card'>
          <MiniEmpty
            title={PAGE_COPY.profile.guest.title}
            description={PAGE_COPY.profile.guest.description}
            icon={PAGE_COPY.profile.guest.icon}
            actionText={PAGE_COPY.profile.guest.actionText}
            onAction={() => Taro.switchTab({ url: '/pages/index/index' })}
          />
        </View>
      )}

      {/* 退出登录 */}
      {loggedIn && (
        <View className='logout-area'>
          <View className='logout-btn' onClick={handleLogout}>
            <Text className='logout-text'>退出登录</Text>
          </View>
        </View>
      )}

      {/* 版本信息 */}
      <View className='version-info'>
        <Text className='version-text'>UTest v1.0.0</Text>
      </View>
    </View>
  )
}
