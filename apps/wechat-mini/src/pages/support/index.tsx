import { useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, type MySupportTicketItem } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

const statusLabels: Record<string, string> = {
  open: '待回复',
  replied: '已回复',
  closed: '已关闭',
}

const categoryLabels: Record<string, string> = {
  question: '咨询',
  complaint: '投诉',
  suggestion: '建议',
  other: '其他',
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<MySupportTicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('question')

  useDidShow(() => {
    loadData()
  })

  async function loadData() {
    setLoading(true)
    const res = await subjectApi.getMySupportTickets()
    const sData = res.data as { items?: MySupportTicketItem[] } | null
    if (res.code === 200 && sData?.items) {
      setTickets(sData.items)
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!newTitle.trim()) {
      Taro.showToast({ title: '请输入标题', icon: 'none' })
      return
    }
    if (!newContent.trim()) {
      Taro.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    const res = await subjectApi.createMySupportTicket({
      title: newTitle,
      content: newContent,
      category: newCategory,
    })
    if (res.code === 200) {
      Taro.showToast({ title: '提交成功', icon: 'success' })
      setShowCreate(false)
      setNewTitle('')
      setNewContent('')
      loadData()
    }
  }

  return (
    <View className='support-page'>
      <View className='page-header'>
        <Text className='page-title'>客服咨询</Text>
        <View className='create-btn' onClick={() => setShowCreate(true)}>
          <Text className='create-btn-text'>新建工单</Text>
        </View>
      </View>

      {loading ? (
        <MiniEmpty
          title={PAGE_COPY.support.loading.title}
          description={PAGE_COPY.support.loading.description}
          icon={PAGE_COPY.support.loading.icon}
        />
      ) : tickets.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.support.empty.title}
          description={PAGE_COPY.support.empty.description}
          icon={PAGE_COPY.support.empty.icon}
          actionText={PAGE_COPY.support.empty.actionText}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <View className='list'>
          {tickets.map((item) => (
            <View key={item.id} className='list-item'>
              <View className='item-header'>
                <Text className='item-category'>{categoryLabels[item.category] || item.category}</Text>
                <Text className={`item-status status-${item.status}`}>
                  {statusLabels[item.status] || item.status}
                </Text>
              </View>
              <Text className='item-title'>{item.title}</Text>
              <Text className='item-no'>{item.ticket_no} | {item.create_time?.slice(0, 10)}</Text>
              {item.reply && (
                <View className='reply-box'>
                  <Text className='reply-label'>客服回复:</Text>
                  <Text className='reply-text'>{item.reply}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {showCreate && (
        <View className='modal-overlay'>
          <View className='modal-content'>
            <Text className='modal-title'>新建咨询工单</Text>
            <View className='form-group'>
              <Text className='form-label'>分类</Text>
              <View className='category-selector'>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <View
                    key={k}
                    className={`category-tag ${newCategory === k ? 'category-active' : ''}`}
                    onClick={() => setNewCategory(k)}
                  >
                    <Text>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='form-group'>
              <Text className='form-label'>标题</Text>
              <Input
                value={newTitle}
                onInput={(e) => setNewTitle(e.detail.value)}
                placeholder='请简要描述您的问题'
                className='form-input'
              />
            </View>
            <View className='form-group'>
              <Text className='form-label'>详细内容</Text>
              <Textarea
                value={newContent}
                onInput={(e) => setNewContent(e.detail.value)}
                placeholder='请详细描述您的问题或建议'
                className='form-textarea'
                maxlength={500}
              />
            </View>
            <View className='modal-actions'>
              <View className='btn-cancel' onClick={() => setShowCreate(false)}>
                <Text>取消</Text>
              </View>
              <View className='btn-confirm' onClick={handleCreate}>
                <Text>提交</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
