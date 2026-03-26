import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { buildSubjectEndpoints, type EcrfTemplate as CRFTemplate, type EcrfRecord as CRFRecord } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import MiniCRFField from '@/components/MiniCRFField'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './workorder-detail.scss'

interface WorkOrderDetail {
  id: number
  title: string
  description: string
  status: string
  work_order_type: string
  scheduled_date: string | null
  due_date: string | null
  subject_name?: string
  protocol_title?: string
  visit_node_name?: string
  activity_name?: string
  crf_template_id?: number
  crf_template_name?: string
  resources?: Array<{
    resource_name: string
    calibration_status: string
  }>
}

interface ChecklistItem {
  id: number
  item_text: string
  is_mandatory: boolean
  is_checked: boolean
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: '#94a3b8' },
  assigned: { label: '已分配', color: '#3b82f6' },
  in_progress: { label: '进行中', color: '#f59e0b' },
  completed: { label: '已完成', color: '#22c55e' },
  review: { label: '待审核', color: '#f59e0b' },
  approved: { label: '已批准', color: '#22c55e' },
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'status-badge--pending',
  assigned: 'status-badge--assigned',
  in_progress: 'status-badge--in-progress',
  completed: 'status-badge--completed',
  review: 'status-badge--review',
  approved: 'status-badge--approved',
}

export default function WorkOrderDetailPage() {
  const router = useRouter()
  const woId = Number(router.params.id)

  const [wo, setWo] = useState<WorkOrderDetail | null>(null)
  const [template, setTemplate] = useState<CRFTemplate | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [recordId, setRecordId] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [activeTab, setActiveTab] = useState<'info' | 'crf' | 'checklist'>('info')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!woId) return
    loadWorkOrder()
    loadChecklist()
  }, [woId])

  const loadWorkOrder = async () => {
    const res = await taroApiClient.get(`/workorder/${woId}`)
    const woData = res.data as WorkOrderDetail | null
    if (res.code === 200 && woData) {
      setWo(woData)
      if (woData.crf_template_id) {
        loadTemplate(woData.crf_template_id)
      }
    }
  }

  const loadTemplate = async (templateId: number) => {
    const res = await taroApiClient.get(`/edc/templates/${templateId}`)
    const tplData = res.data as CRFTemplate | null
    if (res.code === 200 && tplData) {
      setTemplate(tplData)
    }

    const recordRes = await subjectApi.getEcrfRecords({
      template_id: templateId,
      work_order_id: woId,
      status: 'draft',
    })
    const recData = recordRes.data as { items?: CRFRecord[] } | null
    if (recordRes.code === 200 && recData?.items?.length) {
      const draft = recData.items[0]
      setFormData((draft.data as Record<string, unknown>) || {})
      setRecordId(draft.id)
    }
  }

  const loadChecklist = async () => {
    const res = await taroApiClient.get(`/workorder/${woId}/checklists`)
    const clData = res.data as ChecklistItem[] | null
    if (res.code === 200 && clData) {
      setChecklist(clData)
    }
  }

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }, [errors])

  const handleSaveDraft = async () => {
    if (!template) return
    setSaving(true)
    try {
      if (recordId) {
        await subjectApi.updateEcrfRecord(recordId, { data: formData })
      } else {
        const res = await subjectApi.createEcrfRecord({
          template_id: template.id,
          work_order_id: woId,
          data: formData,
        })
        const newRec = res.data as { id?: number } | null
        if (res.code === 200 && newRec?.id) {
          setRecordId(newRec.id)
        }
      }
      Taro.showToast({ title: '已保存', icon: 'success', duration: 1000 })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleChecklist = async (item: ChecklistItem) => {
    try {
      await taroApiClient.post(`/workorder/${woId}/checklists/${item.id}/toggle`, {
        is_checked: !item.is_checked,
      })
      setChecklist(prev =>
        prev.map(c => c.id === item.id ? { ...c, is_checked: !c.is_checked } : c)
      )
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const handleStartWorkOrder = async () => {
    try {
      const res = await taroApiClient.post(`/workorder/${woId}/start`, {})
      if (res.code === 200) {
        Taro.showToast({ title: '已开始执行', icon: 'success' })
        loadWorkOrder()
      } else {
        Taro.showModal({ title: '无法开始', content: res.msg || '操作失败', showCancel: false })
      }
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const handleCompleteWorkOrder = async () => {
    const mandatoryUnchecked = checklist.filter(c => c.is_mandatory && !c.is_checked)
    if (mandatoryUnchecked.length > 0) {
      Taro.showModal({
        title: '无法完成',
        content: `还有 ${mandatoryUnchecked.length} 项必做检查未完成`,
        showCancel: false,
      })
      return
    }

    // Save CRF first
    if (template) {
      await handleSaveDraft()
    }

    try {
      const res = await taroApiClient.post(`/workorder/${woId}/complete`, {})
      if (res.code === 200) {
        Taro.showToast({ title: '工单已完成', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 1500)
      }
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  if (!wo) {
    return (
      <View className="wo-detail-page">
        <View className="loading-state"><Text>加载中...</Text></View>
      </View>
    )
  }

  const st = STATUS_MAP[wo.status] || { label: wo.status, color: '#94a3b8' }
  const statusClass = STATUS_CLASS[wo.status] || 'status-badge--pending'
  const canStart = ['assigned'].includes(wo.status)
  const canComplete = ['in_progress'].includes(wo.status)
  const isReadOnly = ['completed', 'approved', 'cancelled'].includes(wo.status)

  return (
    <View className="wo-detail-page">
      {/* Header */}
      <View className="detail-header">
        <View className="header-top">
          <Text className="wo-title">{wo.title}</Text>
          <View className={`status-badge ${statusClass}`}>
            <Text>{st.label}</Text>
          </View>
        </View>
        {wo.protocol_title && <Text className="header-info">项目: {wo.protocol_title}</Text>}
        {wo.subject_name && <Text className="header-info">受试者: {wo.subject_name}</Text>}
      </View>

      {/* Tabs */}
      <View className="tabs">
        <View className={`tab ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
          <Text>基本信息</Text>
        </View>
        {template && (
          <View className={`tab ${activeTab === 'crf' ? 'active' : ''}`} onClick={() => setActiveTab('crf')}>
            <Text>eCRF 录入</Text>
          </View>
        )}
        {checklist.length > 0 && (
          <View className={`tab ${activeTab === 'checklist' ? 'active' : ''}`} onClick={() => setActiveTab('checklist')}>
            <Text>Checklist</Text>
          </View>
        )}
      </View>

      <ScrollView scrollY className="content-scroll">
        {/* Info Tab */}
        {activeTab === 'info' && (
          <View className="info-section">
            <View className="info-card">
              <View className="info-row">
                <Text className="info-label">工单号</Text>
                <Text className="info-value">WO#{wo.id}</Text>
              </View>
              <View className="info-row">
                <Text className="info-label">类型</Text>
                <Text className="info-value">{wo.work_order_type || 'visit'}</Text>
              </View>
              <View className="info-row">
                <Text className="info-label">计划日期</Text>
                <Text className="info-value">{wo.scheduled_date || '--'}</Text>
              </View>
              <View className="info-row">
                <Text className="info-label">截止日期</Text>
                <Text className="info-value">{wo.due_date || '--'}</Text>
              </View>
              {wo.visit_node_name && (
                <View className="info-row">
                  <Text className="info-label">访视</Text>
                  <Text className="info-value">{wo.visit_node_name}</Text>
                </View>
              )}
              {wo.activity_name && (
                <View className="info-row">
                  <Text className="info-label">活动</Text>
                  <Text className="info-value">{wo.activity_name}</Text>
                </View>
              )}
            </View>

            {wo.description && (
              <View className="info-card">
                <Text className="card-title">描述</Text>
                <Text className="desc-text">{wo.description}</Text>
              </View>
            )}

            {wo.resources && wo.resources.length > 0 && (
              <View className="info-card">
                <Text className="card-title">所需仪器</Text>
                {wo.resources.map((r, i) => (
                  <View key={i} className="resource-row">
                    <Text className="resource-name">{r.resource_name}</Text>
                    <Text className={`calibration-status ${r.calibration_status === 'valid' ? 'valid' : 'warning'}`}>
                      {r.calibration_status === 'valid' ? '已校准' : '需校准'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* CRF Tab */}
        {activeTab === 'crf' && template && (
          <View className="crf-section">
            <View className="crf-header">
              <Text className="crf-title">{template.name}</Text>
            </View>
            {template.schema.questions.map((q) => (
              <MiniCRFField
                key={q.id}
                question={q}
                value={formData[q.id]}
                onChange={handleFieldChange}
                error={errors[q.id]}
                readOnly={isReadOnly}
              />
            ))}
            {!isReadOnly && (
              <View className="crf-actions">
                <View className={`btn-save ${saving ? 'disabled' : ''}`} onClick={!saving ? handleSaveDraft : undefined}>
                  <Text>{saving ? '保存中...' : '保存草稿'}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Checklist Tab */}
        {activeTab === 'checklist' && (
          <View className="checklist-section">
            {checklist.map((item) => (
              <View
                key={item.id}
                className={`checklist-item ${item.is_checked ? 'checked' : ''} ${item.is_mandatory ? 'mandatory' : ''}`}
                onClick={() => !isReadOnly && handleToggleChecklist(item)}
              >
                <View className={`check-box ${item.is_checked ? 'checked' : ''}`} />
                <Text className="check-text">{item.item_text}</Text>
                {item.is_mandatory && <Text className="mandatory-tag">必做</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      {!isReadOnly && (
        <View className="bottom-actions">
          {canStart && (
            <View className="btn-action start" onClick={handleStartWorkOrder}>
              <Text>开始执行</Text>
            </View>
          )}
          {canComplete && (
            <View className="btn-action complete" onClick={handleCompleteWorkOrder}>
              <Text>完成工单</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
