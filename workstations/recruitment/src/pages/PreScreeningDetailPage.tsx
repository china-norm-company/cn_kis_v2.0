import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { preScreeningApi } from '@cn-kis/api-client'
import type { PreScreeningRecord, PreScreeningDraftIn } from '@cn-kis/api-client'
import { Button, Card } from '@cn-kis/ui-kit'
import { ErrorAlert } from '../components/ErrorAlert'
import { HardExclusionChecklist, getDefaultChecks } from '../components/HardExclusionChecklist'
import type { HardExclusionCheck } from '../components/HardExclusionChecklist'
import { SkinAssessmentForm } from '../components/SkinAssessmentForm'
import { MedicalHistoryForm } from '../components/MedicalHistoryForm'
import type { MedicalHistoryData } from '../components/MedicalHistoryForm'
import { PreScreeningVerdict } from '../components/PreScreeningVerdict'
import { toast } from '../hooks/useToast'
import { ArrowLeft, ArrowRight, Save, CheckCircle2 } from 'lucide-react'

const STEPS = [
  { key: 'confirm', label: '受试者确认' },
  { key: 'exclusion', label: '硬性排除条件' },
  { key: 'skin', label: '专业评估' },
  { key: 'medical', label: '医学史采集' },
  { key: 'vitals', label: '体格/体征' },
  { key: 'verdict', label: '综合判定' },
] as const

type StepKey = (typeof STEPS)[number]['key']

const EMPTY_MEDICAL: MedicalHistoryData = {
  conditions: [],
  allergies: [],
  medications: [],
  lifestyle: { sun_exposure: '', skincare_habits: '', cosmetics_frequency: '' },
}

interface VitalSignsForm {
  height: string
  weight: string
  systolic: string
  diastolic: string
  heart_rate: string
  temperature: string
}

function computeBmi(height: string, weight: string): string {
  const h = parseFloat(height)
  const w = parseFloat(weight)
  if (!h || !w || h <= 0) return ''
  const bmi = w / ((h / 100) ** 2)
  return bmi.toFixed(1)
}

export default function PreScreeningDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [currentStep, setCurrentStep] = useState(0)
  const [identityConfirmed, setIdentityConfirmed] = useState(false)

  const [exclusionChecks, setExclusionChecks] = useState<HardExclusionCheck[]>(getDefaultChecks())
  const [skinAssessment, setSkinAssessment] = useState<Record<string, unknown> | null>(null)
  const [instruments, setInstruments] = useState<Record<string, unknown> | null>(null)
  const [medicalData, setMedicalData] = useState<MedicalHistoryData>(EMPTY_MEDICAL)
  const [vitals, setVitals] = useState<VitalSignsForm>({
    height: '', weight: '', systolic: '', diastolic: '', heart_rate: '', temperature: '',
  })

  const prevStepRef = useRef(currentStep)

  const recordQuery = useQuery({
    queryKey: ['pre-screening', 'detail', id],
    queryFn: async () => {
      const res = await preScreeningApi.getDetail(Number(id))
      if (!res?.data) throw new Error('获取粗筛详情失败')
      return res.data
    },
    enabled: !!id,
  })

  const record = recordQuery.data as PreScreeningRecord | undefined
  const isReadonly = !!record && record.result !== 'pending'

  useEffect(() => {
    if (!record) return
    if (record.hard_exclusion_checks?.length) {
      setExclusionChecks(record.hard_exclusion_checks)
    }
    if (record.skin_visual_assessment) {
      setSkinAssessment(record.skin_visual_assessment)
    }
    if (record.instrument_summary) {
      setInstruments(record.instrument_summary)
    }
    if (record.medical_summary) {
      const ms = record.medical_summary as Record<string, unknown>
      setMedicalData({
        conditions: (ms.conditions as MedicalHistoryData['conditions']) ?? [],
        allergies: (ms.allergies as MedicalHistoryData['allergies']) ?? [],
        medications: (ms.medications as MedicalHistoryData['medications']) ?? [],
        lifestyle: (ms.lifestyle as MedicalHistoryData['lifestyle']) ?? EMPTY_MEDICAL.lifestyle,
      })
    }
    if (record.lifestyle_summary) {
      const ls = record.lifestyle_summary as Record<string, string>
      setVitals({
        height: ls.height ?? '',
        weight: ls.weight ?? '',
        systolic: ls.systolic ?? '',
        diastolic: ls.diastolic ?? '',
        heart_rate: ls.heart_rate ?? '',
        temperature: ls.temperature ?? '',
      })
    }
  }, [record])

  const draftMutation = useMutation({
    mutationFn: (data: PreScreeningDraftIn) => preScreeningApi.saveDraft(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-screening', 'detail', id] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: (data: { result: string; fail_reasons?: string[]; notes?: string }) =>
      preScreeningApi.complete(Number(id), data),
    onSuccess: () => {
      toast.success('粗筛判定已提交')
      queryClient.invalidateQueries({ queryKey: ['pre-screening'] })
      navigate('/pre-screening')
    },
    onError: (err) => toast.error((err as Error).message || '提交判定失败'),
  })

  const buildDraftPayload = useCallback((): PreScreeningDraftIn => ({
    hard_exclusion_checks: exclusionChecks,
    skin_visual_assessment: skinAssessment ?? undefined,
    instrument_summary: instruments ?? undefined,
    medical_summary: {
      conditions: medicalData.conditions,
      allergies: medicalData.allergies,
      medications: medicalData.medications,
      lifestyle: medicalData.lifestyle,
    },
    lifestyle_summary: {
      height: vitals.height,
      weight: vitals.weight,
      bmi: computeBmi(vitals.height, vitals.weight),
      systolic: vitals.systolic,
      diastolic: vitals.diastolic,
      heart_rate: vitals.heart_rate,
      temperature: vitals.temperature,
    },
  }), [exclusionChecks, skinAssessment, instruments, medicalData, vitals])

  useEffect(() => {
    if (isReadonly || !id || prevStepRef.current === currentStep) return
    prevStepRef.current = currentStep
    draftMutation.mutate(buildDraftPayload())
  }, [currentStep])

  const handleSaveDraft = () => {
    draftMutation.mutate(buildDraftPayload())
    toast.success('草稿已保存')
  }

  const handleVerdict = (result: string, failReasons?: string[], notes?: string) => {
    completeMutation.mutate({ result, fail_reasons: failReasons, notes })
  }

  const bmi = computeBmi(vitals.height, vitals.weight)

  if (recordQuery.isLoading) {
    return (
      <div className="space-y-4" data-section="pre-screening-detail">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (recordQuery.error) {
    return (
      <div data-section="pre-screening-detail">
        <ErrorAlert message={(recordQuery.error as Error).message} onRetry={() => recordQuery.refetch()} />
      </div>
    )
  }

  if (!record) return null

  const stepKey = STEPS[currentStep].key

  return (
    <div className="space-y-6" data-section="pre-screening-detail">
      {/* Back + Title */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/pre-screening')} className="text-slate-400 hover:text-slate-600" title="返回列表">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            粗筛评估 — {record.subject_name}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{record.pre_screening_no} · {record.protocol_title}</p>
        </div>
        {isReadonly && (
          <span className="ml-auto text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
            只读模式
          </span>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentStep
          const isCurrent = idx === currentStep
          return (
            <div key={step.key} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => setCurrentStep(idx)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-500 group-hover:bg-slate-300'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                <span
                  className={`text-xs font-medium ${
                    isCurrent ? 'text-blue-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mt-[-18px] ${idx < currentStep ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {stepKey === 'confirm' && (
          <Card title="受试者信息确认" variant="bordered">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1">姓名</p>
                <p className="text-sm font-medium text-slate-800">{record.subject_name}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1">报名编号</p>
                <p className="text-sm font-medium text-slate-800">{record.registration_no}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1">受试者编号</p>
                <p className="text-sm font-medium text-slate-800">{record.subject_no || '-'}</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={identityConfirmed}
                onChange={(e) => setIdentityConfirmed(e.target.checked)}
                disabled={isReadonly}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">确认受试者身份无误</span>
            </label>
          </Card>
        )}

        {stepKey === 'exclusion' && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-700">硬性排除条件检查</h3>
            <HardExclusionChecklist
              checks={exclusionChecks}
              onChange={setExclusionChecks}
              readonly={isReadonly}
            />
          </div>
        )}

        {stepKey === 'skin' && (
          <SkinAssessmentForm
            assessment={skinAssessment}
            instruments={instruments}
            onChange={(a, ins) => {
              setSkinAssessment(a)
              setInstruments(ins)
            }}
            readonly={isReadonly}
          />
        )}

        {stepKey === 'medical' && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-700">医学史采集</h3>
            <MedicalHistoryForm
              data={medicalData}
              onChange={setMedicalData}
              readonly={isReadonly}
            />
          </div>
        )}

        {stepKey === 'vitals' && (
          <Card title="体格/体征" variant="bordered">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">身高 (cm)</label>
                <input
                  type="number"
                  value={vitals.height}
                  onChange={(e) => setVitals({ ...vitals, height: e.target.value })}
                  disabled={isReadonly}
                  placeholder="如 170"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">体重 (kg)</label>
                <input
                  type="number"
                  value={vitals.weight}
                  onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                  disabled={isReadonly}
                  placeholder="如 65"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">BMI（自动计算）</label>
                <input
                  type="text"
                  value={bmi}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600"
                  placeholder="自动计算"
                />
              </div>
              <div />
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">收缩压 (mmHg)</label>
                <input
                  type="number"
                  value={vitals.systolic}
                  onChange={(e) => setVitals({ ...vitals, systolic: e.target.value })}
                  disabled={isReadonly}
                  placeholder="如 120"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">舒张压 (mmHg)</label>
                <input
                  type="number"
                  value={vitals.diastolic}
                  onChange={(e) => setVitals({ ...vitals, diastolic: e.target.value })}
                  disabled={isReadonly}
                  placeholder="如 80"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">心率 (bpm)</label>
                <input
                  type="number"
                  value={vitals.heart_rate}
                  onChange={(e) => setVitals({ ...vitals, heart_rate: e.target.value })}
                  disabled={isReadonly}
                  placeholder="如 72"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">体温 (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={vitals.temperature}
                  onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                  disabled={isReadonly}
                  placeholder="如 36.5"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50"
                />
              </div>
            </div>
          </Card>
        )}

        {stepKey === 'verdict' && (
          <PreScreeningVerdict
            record={record}
            onSubmit={handleVerdict}
            readonly={isReadonly}
          />
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <Button
          variant="secondary"
          icon={<ArrowLeft className="w-4 h-4" />}
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((s) => s - 1)}
        >
          上一步
        </Button>

        <div className="flex items-center gap-3">
          {!isReadonly && (
            <Button
              variant="ghost"
              icon={<Save className="w-4 h-4" />}
              loading={draftMutation.isPending}
              onClick={handleSaveDraft}
            >
              保存草稿
            </Button>
          )}

          {currentStep < STEPS.length - 1 && (
            <Button
              variant="primary"
              icon={<ArrowRight className="w-4 h-4" />}
              iconPosition="right"
              onClick={() => setCurrentStep((s) => s + 1)}
            >
              下一步
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
