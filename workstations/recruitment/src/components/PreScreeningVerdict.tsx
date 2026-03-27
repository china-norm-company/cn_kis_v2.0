import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Activity, Microscope, Stethoscope, Heart } from 'lucide-react'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { ConfirmDialog } from './ConfirmDialog'
import type { PreScreeningRecord } from '@cn-kis/api-client'

interface PreScreeningVerdictProps {
  record: PreScreeningRecord
  onSubmit: (result: string, failReasons?: string[], notes?: string) => void
  readonly?: boolean
}

type VitalSigns = {
  height?: string
  weight?: string
  bmi?: string
  systolic?: string
  diastolic?: string
  heart_rate?: string
  temperature?: string
}

const RESULT_OPTIONS = [
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '不通过' },
  { value: 'refer', label: '待定 — 需PI复核' },
  { value: 'redirect', label: '推荐其他项目' },
]

function deriveRecommendation(record: PreScreeningRecord): { label: string; color: string; icon: typeof CheckCircle2 } {
  const checks = record.hard_exclusion_checks ?? []
  const allChecksMet = checks.length > 0 && checks.every((c) => c.met)
  const anyCheckFailed = checks.some((c) => !c.met)

  const skin = record.skin_visual_assessment as Record<string, string> | null
  const skinNormal = skin?.overall_condition === '正常'

  if (anyCheckFailed) {
    return { label: '建议不通过', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle }
  }
  if (allChecksMet && skinNormal) {
    return { label: '建议通过', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 }
  }
  return { label: '需人工判断', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: AlertTriangle }
}

function SummaryItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Activity
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
      <Icon className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
        <div className="text-sm text-slate-700">{children}</div>
      </div>
    </div>
  )
}

export function PreScreeningVerdict({ record, onSubmit, readonly }: PreScreeningVerdictProps) {
  const [result, setResult] = useState('')
  const [failReasons, setFailReasons] = useState('')
  const [notes, setNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const checks = record.hard_exclusion_checks ?? []
  const metCount = checks.filter((c) => c.met).length
  const skin = record.skin_visual_assessment as Record<string, string> | null
  const instruments = record.instrument_summary as Record<string, string> | null
  const medical = record.medical_summary as Record<string, unknown> | null
  const lifestyle = record.lifestyle_summary as Record<string, string> | null

  const conditions = (medical?.conditions as unknown[]) ?? []
  const allergies = (medical?.allergies as unknown[]) ?? []
  const medications = (medical?.medications as unknown[]) ?? []

  const vitals: VitalSigns = {}
  if (lifestyle) {
    Object.assign(vitals, lifestyle)
  }

  const recommendation = deriveRecommendation(record)
  const RecommendIcon = recommendation.icon

  const handleSubmit = () => {
    if (!result) return
    const reasons = failReasons.trim()
      ? failReasons.split('\n').filter((l) => l.trim())
      : undefined
    onSubmit(result, reasons, notes.trim() || undefined)
    setShowConfirm(false)
  }

  const needReasons = result === 'fail' || result === 'refer'

  return (
    <div className="space-y-6">
      <Card title="前序步骤汇总" variant="bordered">
        <div className="grid grid-cols-2 gap-3">
          <SummaryItem icon={CheckCircle2} label="硬性条件">
            {checks.length > 0 ? (
              <span className={metCount === checks.length ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                {metCount}/{checks.length} 项满足
              </span>
            ) : (
              <span className="text-slate-400">未填写</span>
            )}
          </SummaryItem>

          <SummaryItem icon={Microscope} label="皮肤评估">
            {skin ? (
              <div className="space-y-0.5">
                <p>整体状况：{skin.overall_condition || '-'}</p>
                <p>Fitzpatrick：{skin.fitzpatrick || '-'}</p>
              </div>
            ) : (
              <span className="text-slate-400">未填写</span>
            )}
          </SummaryItem>

          <SummaryItem icon={Activity} label="仪器数据">
            {instruments ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {instruments.corneometer_left && <Badge>水分L:{instruments.corneometer_left}</Badge>}
                {instruments.corneometer_right && <Badge>水分R:{instruments.corneometer_right}</Badge>}
                {instruments.mexameter_melanin && <Badge>黑色素:{instruments.mexameter_melanin}</Badge>}
                {instruments.tewameter && <Badge>TEWL:{instruments.tewameter}</Badge>}
                {!instruments.corneometer_left && !instruments.mexameter_melanin && <span className="text-slate-400">暂无关键数值</span>}
              </div>
            ) : (
              <span className="text-slate-400">未填写</span>
            )}
          </SummaryItem>

          <SummaryItem icon={Stethoscope} label="医学史">
            <div className="space-y-0.5">
              <p>病史 {conditions.length} 条、过敏 {allergies.length} 条、用药 {medications.length} 条</p>
            </div>
          </SummaryItem>

          <SummaryItem icon={Heart} label="体征数据">
            {vitals.height || vitals.weight || vitals.systolic ? (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {vitals.height && <span>身高 {vitals.height}cm</span>}
                {vitals.weight && <span>体重 {vitals.weight}kg</span>}
                {vitals.bmi && <span>BMI {vitals.bmi}</span>}
                {vitals.systolic && vitals.diastolic && <span>血压 {vitals.systolic}/{vitals.diastolic}</span>}
                {vitals.heart_rate && <span>心率 {vitals.heart_rate}</span>}
                {vitals.temperature && <span>体温 {vitals.temperature}°C</span>}
              </div>
            ) : (
              <span className="text-slate-400">未填写</span>
            )}
          </SummaryItem>
        </div>
      </Card>

      {/* 系统建议 */}
      <div className={`rounded-lg border-2 p-5 text-center ${recommendation.color}`}>
        <RecommendIcon className="w-10 h-10 mx-auto mb-2" />
        <p className="text-xl font-bold">{recommendation.label}</p>
      </div>

      {/* 人工判定 */}
      {!readonly && (
        <Card title="最终判定" variant="bordered">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">判定结果</label>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                title="判定结果"
              >
                <option value="">请选择判定结果</option>
                {RESULT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {needReasons && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {result === 'fail' ? '不通过原因' : '待定原因'}
                </label>
                <textarea
                  value={failReasons}
                  onChange={(e) => setFailReasons(e.target.value)}
                  rows={3}
                  placeholder="每行一条原因..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">备注</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="补充说明..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!result || (needReasons && !failReasons.trim())}
                onClick={() => setShowConfirm(true)}
              >
                提交判定
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="确认提交判定"
        message={`确定要将初筛结果设为「${RESULT_OPTIONS.find((o) => o.value === result)?.label ?? result}」吗？提交后不可直接修改。`}
        variant="danger"
        confirmLabel="确认提交"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  )
}
