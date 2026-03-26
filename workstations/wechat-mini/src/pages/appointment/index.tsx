import { useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, type MyAppointmentItem } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

const statusLabels: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
  completed: '已完成',
}

export default function AppointmentPage() {
  const [appointments, setAppointments] = useState<MyAppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newPurpose, setNewPurpose] = useState('')
  const [newVisitPoint, setNewVisitPoint] = useState('')

  useDidShow(() => {
    loadData()
  })

  async function loadData() {
    setLoading(true)
    const res = await subjectApi.getMyAppointments()
    const data = res.data as { items?: MyAppointmentItem[] } | null
    if (res.code === 200 && data?.items) {
      setAppointments(data.items)
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!newDate) {
      Taro.showToast({ title: '请选择日期', icon: 'none' })
      return
    }
    const res = await subjectApi.createMyAppointment({
      appointment_date: newDate,
      appointment_time: newTime || undefined,
      purpose: newPurpose || '常规到访',
      visit_point: newVisitPoint || undefined,
    })
    if (res.code === 200) {
      Taro.showToast({ title: '预约成功', icon: 'success' })
      setShowCreate(false)
      setNewDate('')
      setNewTime('')
      setNewPurpose('')
      setNewVisitPoint('')
      loadData()
    }
  }

  async function handleCancel(id: number) {
    const modal = await Taro.showModal({ title: '取消预约', content: '确定要取消这个预约吗？' })
    if (modal.confirm) {
      const res = await subjectApi.cancelMyAppointment(id)
      if (res.code === 200) {
        Taro.showToast({ title: '已取消', icon: 'success' })
        loadData()
      }
    }
  }

  return (
    <View className='appointment-page'>
      <View className='page-header'>
        <Text className='page-title'>我的预约</Text>
        <View className='create-btn' onClick={() => setShowCreate(true)}>
          <Text className='create-btn-text'>新建预约</Text>
        </View>
      </View>

      {loading ? (
        <View className='appointment-loading'>
          <Text className='appointment-loading__text'>加载中...</Text>
        </View>
      ) : appointments.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.appointment.empty.title}
          description={PAGE_COPY.appointment.empty.description}
          icon={PAGE_COPY.appointment.empty.icon}
          actionText={PAGE_COPY.appointment.empty.actionText}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <View className='list'>
          {appointments.map((item) => (
            <View key={item.id} className='list-item'>
              <View className='item-header'>
                <Text className='item-date'>{item.appointment_date}</Text>
                <Text className={`item-status status-${item.status}`}>
                  {statusLabels[item.status] || item.status}
                </Text>
              </View>
              {item.appointment_time && (
                <Text className='item-time'>时间: {item.appointment_time}</Text>
              )}
              <Text className='item-purpose'>目的: {item.purpose || '常规到访'}</Text>
              {item.status === 'pending' && (
                <View className='item-actions'>
                  <Text className='cancel-link' onClick={() => handleCancel(item.id)}>取消预约</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {showCreate && (
        <View className='modal-overlay'>
          <View className='modal-content'>
            <Text className='modal-title'>新建预约</Text>
            <View className='form-group'>
              <Text className='form-label'>预约日期</Text>
              <Picker mode='date' value={newDate} onChange={(e) => setNewDate(e.detail.value)}>
                <View className='picker-value'>{newDate || '选择日期'}</View>
              </Picker>
            </View>
            <View className='form-group'>
              <Text className='form-label'>预约时间</Text>
              <Picker mode='time' value={newTime} onChange={(e) => setNewTime(e.detail.value)}>
                <View className='picker-value'>{newTime || '选择时间（可选）'}</View>
              </Picker>
            </View>
            <View className='form-group'>
              <Text className='form-label'>到访目的</Text>
              <View className='picker-value' onClick={() => {
                Taro.showActionSheet({
                  itemList: ['常规到访', '复查', '取药', '其他'],
                }).then(res => {
                  setNewPurpose(['常规到访', '复查', '取药', '其他'][res.tapIndex])
                })
              }}>
                {newPurpose || '选择目的'}
              </View>
            </View>
            <View className='form-group'>
              <Text className='form-label'>访视点（可选）</Text>
              <View className='picker-value' onClick={() => {
                Taro.showActionSheet({
                  itemList: ['V0', 'V1', 'V2', '粗筛', '筛选', '基线', '其他', '不填'],
                }).then(res => {
                  const opts = ['V0', 'V1', 'V2', '粗筛', '筛选', '基线', '其他', '']
                  setNewVisitPoint(opts[res.tapIndex])
                })
              }}>
                {newVisitPoint || '选择访视点（可选）'}
              </View>
            </View>
            <View className='modal-actions'>
              <View className='btn-cancel' onClick={() => setShowCreate(false)}>
                <Text>取消</Text>
              </View>
              <View className='btn-confirm' onClick={handleCreate}>
                <Text>确认预约</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
