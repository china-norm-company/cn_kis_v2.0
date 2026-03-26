import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, type EcrfTemplate as CRFTemplate, type EcrfRecord as CRFRecord } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'
import MiniCRFField from '../../components/MiniCRFField'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

interface ProjectBrief {
  id: number
  title: string
  product_category?: string
}

export default function QuestionnairePage() {
  const [projects, setProjects] = useState<ProjectBrief[]>([])
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [templates, setTemplates] = useState<CRFTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<CRFTemplate | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [recordId, setRecordId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useDidShow(() => {
    loadProjects()
  })

  const loadProjects = async () => {
    try {
      const userInfo = taroAuthProvider.getLocalUserInfo()
      if (!userInfo?.subjectId) return

      const res = await subjectApi.getProtocolList()
      const data = res.data as { items?: ProjectBrief[] } | null
      if (res.code === 200 && data?.items) {
        setProjects(data.items)
        if (data.items.length > 0 && !selectedProject) {
          setSelectedProject(data.items[0].id)
        }
      }
    } catch (e) {
      console.error('加载项目列表失败', e)
    }
  }

  useEffect(() => {
    if (selectedProject) {
      loadTemplates(selectedProject)
    }
  }, [selectedProject])

  const loadTemplates = async (projectId: number) => {
    try {
      const res = await subjectApi.getEcrfTemplates(projectId)
      const data = res.data as { items?: CRFTemplate[] } | null
      if (res.code === 200 && data?.items) {
        setTemplates(data.items)
        if (data.items.length > 0) {
          handleSelectTemplate(data.items[0])
        } else {
          setSelectedTemplate(null)
        }
      }
    } catch (e) {
      console.error('加载问卷模板失败', e)
    }
  }

  const handleSelectTemplate = async (template: CRFTemplate) => {
    setSelectedTemplate(template)
    setFormData({})
    setErrors({})
    setRecordId(null)

    try {
      const userInfo = taroAuthProvider.getLocalUserInfo()
      const res = await subjectApi.getEcrfRecords({
        template_id: template.id,
        subject_id: userInfo?.subjectId,
        status: 'draft',
      })
      const data = res.data as { items?: CRFRecord[] } | null
      if (res.code === 200 && data?.items?.length) {
        const draft = data.items[0]
        setFormData((draft.data as Record<string, unknown>) || {})
        setRecordId(draft.id)
      }
    } catch {
      // No draft found
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
    if (!selectedTemplate) return
    setSaving(true)
    try {
      if (recordId) {
        await subjectApi.updateEcrfRecord(recordId, { data: formData })
      } else {
        const res = await subjectApi.createEcrfRecord({
          template_id: selectedTemplate.id,
          data: formData,
        })
        const recData = res.data as { id?: number } | null
        if (res.code === 200 && recData?.id) {
          setRecordId(recData.id)
        }
      }
      Taro.showToast({ title: '已保存草稿', icon: 'success', duration: 1500 })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const validate = (): boolean => {
    if (!selectedTemplate) return false
    const newErrors: Record<string, string> = {}
    for (const q of selectedTemplate.schema.questions) {
      if (q.required) {
        const val = formData[q.id]
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          newErrors[q.id] = `${q.title}为必填项`
        }
      }
      if (q.type === 'number' && formData[q.id] !== undefined && formData[q.id] !== null) {
        const raw = formData[q.id]
        const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
        if (q.min !== undefined && num < q.min) newErrors[q.id] = `不能小于 ${q.min}`
        if (q.max !== undefined && num > q.max) newErrors[q.id] = `不能大于 ${q.max}`
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) {
      Taro.showToast({ title: '请完善必填项', icon: 'none' })
      return
    }

    const confirmed = await Taro.showModal({
      title: '提交确认',
      content: '提交后将无法修改，确认提交吗？',
    })
    if (!confirmed.confirm) return

    setSubmitting(true)
    try {
      // Save first
      await handleSaveDraft()

      if (recordId) {
        await subjectApi.submitEcrfRecord(recordId)
        Taro.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 1500)
      }
    } catch {
      Taro.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="questionnaire-page">
      {/* Project selector */}
      {projects.length > 1 && (
        <ScrollView scrollX className="project-tabs">
          {projects.map(p => (
            <View
              key={p.id}
              className={`project-tab ${selectedProject === p.id ? 'active' : ''}`}
              onClick={() => setSelectedProject(p.id)}
            >
              <Text>{p.title}</Text>
              {p.product_category && <Text className="category">{p.product_category}</Text>}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Template selector */}
      {templates.length > 1 && (
        <ScrollView scrollX className="template-tabs">
          {templates.map(t => (
            <View
              key={t.id}
              className={`template-tab ${selectedTemplate?.id === t.id ? 'active' : ''}`}
              onClick={() => handleSelectTemplate(t)}
            >
              <Text>{t.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Form */}
      {selectedTemplate ? (
        <ScrollView scrollY className="form-scroll">
          <View className="form-header">
            <Text className="form-title">{selectedTemplate.name}</Text>
            <Text className="form-tip">请仔细填写以下内容</Text>
          </View>

          <View className="form-body">
            {selectedTemplate.schema.questions.map((q) => (
              <MiniCRFField
                key={q.id}
                question={q}
                value={formData[q.id]}
                onChange={handleFieldChange}
                error={errors[q.id]}
              />
            ))}
          </View>

          {/* Actions */}
          <View className="form-actions">
            <View
              className={`btn-draft ${saving ? 'disabled' : ''}`}
              onClick={!saving ? handleSaveDraft : undefined}
            >
              <Text>{saving ? '保存中...' : '保存草稿'}</Text>
            </View>
            <View
              className={`btn-submit ${submitting ? 'disabled' : ''}`}
              onClick={!submitting ? handleSubmit : undefined}
            >
              <Text>{submitting ? '提交中...' : '提交'}</Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <View className="empty">
          <MiniEmpty
            title={PAGE_COPY.questionnaire.empty.title}
            description={PAGE_COPY.questionnaire.empty.description}
            icon={PAGE_COPY.questionnaire.empty.icon}
          />
        </View>
      )}
    </View>
  )
}
