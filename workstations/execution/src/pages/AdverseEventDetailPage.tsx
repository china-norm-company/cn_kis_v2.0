import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { safetyApi, type AdverseEvent, type AEFollowUpCreateIn } from '@cn-kis/api-client'
import { Button, Card, Modal } from '@cn-kis/ui-kit'

const SEVERITY_LABELS: Record<string, string> = { mild: '轻度', moderate: '中度', severe: '重度' }
const STATUS_LABELS: Record<string, string> = {
  reported: '已上报', under_review: '审核中', approved: '已确认', following: '随访中', closed: '已关闭',
}
const RELATION_LABELS: Record<string, string> = {
  unrelated: '无关', possible: '可能有关', probable: '很可能有关', certain: '肯定有关',
}
const OUTCOME_LABELS: Record<string, string> = {
  recovered: '痊愈', recovering: '好转', not_recovered: '未好转',
  sequelae: '有后遗症', death: '死亡', unknown: '未知',
}

export default function AdverseEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ae, setAe] = useState<AdverseEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpForm, setFollowUpForm] = useState<AEFollowUpCreateIn>({
    followup_date: new Date().toISOString().split('T')[0],
    current_status: '',
  })

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await safetyApi.getAdverseEvent(Number(id))
      if (res.code === 200) setAe(res.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleAddFollowUp = async () => {
    if (!id || !followUpForm.current_status) return
    const res = await safetyApi.addFollowUp(Number(id), followUpForm)
    if (res.code === 200) {
      setShowFollowUpModal(false)
      setFollowUpForm({ followup_date: new Date().toISOString().split('T')[0], current_status: '' })
      fetchDetail()
    }
  }

  if (loading) return <div className="p-6 text-gray-500">加载中...</div>
  if (!ae) return <div className="p-6 text-red-500">AE 记录不存在</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/adverse-events')}>← 返回列表</Button>
        <h1 className="text-2xl font-bold">AE-{String(ae.id).padStart(4, '0')}</h1>
        {ae.is_sae && <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold">SAE</span>}
        <span className="ml-auto px-3 py-1 rounded bg-gray-100 text-sm">{STATUS_LABELS[ae.status]}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="事件信息">
          <dl className="space-y-3 text-sm">
            <div className="flex"><dt className="w-24 text-gray-500">事件描述</dt><dd>{ae.description}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">严重程度</dt><dd className={ae.severity === 'severe' ? 'text-red-600 font-semibold' : ''}>{SEVERITY_LABELS[ae.severity]}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">因果关系</dt><dd>{RELATION_LABELS[ae.relation]}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">转归</dt><dd>{OUTCOME_LABELS[ae.outcome] || ae.outcome}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">处理措施</dt><dd>{ae.action_taken || '暂无'}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">开始日期</dt><dd>{ae.start_date}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">上报日期</dt><dd>{ae.report_date}</dd></div>
          </dl>
        </Card>

        <Card title="关联信息">
          <dl className="space-y-3 text-sm">
            <div className="flex"><dt className="w-24 text-gray-500">入组 ID</dt><dd>{ae.enrollment_id}</dd></div>
            <div className="flex"><dt className="w-24 text-gray-500">工单 ID</dt><dd>{ae.work_order_id || '-'}</dd></div>
            {ae.deviation_id && (
              <div className="flex items-center gap-2">
                <dt className="w-24 text-gray-500">关联偏差</dt>
                <dd>
                  <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-xs">DEV-{ae.deviation_id}</span>
                </dd>
              </div>
            )}
            {ae.change_request_id && (
              <div className="flex items-center gap-2">
                <dt className="w-24 text-gray-500">关联变更</dt>
                <dd>
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs">CR-{ae.change_request_id}</span>
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <Card
        title="随访记录"
        extra={
          ae.status !== 'closed' && (
            <Button size="sm" onClick={() => setShowFollowUpModal(true)}>添加随访</Button>
          )
        }
      >
        {ae.follow_ups && ae.follow_ups.length > 0 ? (
          <div className="space-y-4">
            {ae.follow_ups.map((fu) => (
              <div key={fu.id} className="border-l-2 border-blue-400 pl-4 py-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>第{fu.sequence}次随访</span>
                  <span>{fu.followup_date}</span>
                  {fu.requires_further_followup
                    ? <span className="text-orange-600">需继续随访</span>
                    : <span className="text-green-600">随访完成</span>
                  }
                </div>
                <p className="mt-1 text-sm">{fu.current_status}</p>
                {fu.outcome_update && <p className="text-sm text-gray-600">转归更新: {fu.outcome_update}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">暂无随访记录</p>
        )}
      </Card>

      <Modal
        open={showFollowUpModal}
        title="添加随访记录"
        onClose={() => setShowFollowUpModal(false)}
        onConfirm={handleAddFollowUp}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">随访日期</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={followUpForm.followup_date}
              onChange={(e) => setFollowUpForm({ ...followUpForm, followup_date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">当前状态 *</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={3}
              value={followUpForm.current_status}
              onChange={(e) => setFollowUpForm({ ...followUpForm, current_status: e.target.value })}
              placeholder="描述受试者当前症状/状态..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">转归更新</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={followUpForm.outcome_update || ''}
              onChange={(e) => setFollowUpForm({ ...followUpForm, outcome_update: e.target.value })}
              placeholder="如有转归变化"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={followUpForm.requires_further_followup !== false}
              onChange={(e) => setFollowUpForm({ ...followUpForm, requires_further_followup: e.target.checked })}
            />
            <label className="text-sm">需要继续随访</label>
          </div>
          {followUpForm.requires_further_followup !== false && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">下次随访日期</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={followUpForm.next_followup_date || ''}
                onChange={(e) => setFollowUpForm({ ...followUpForm, next_followup_date: e.target.value })}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
