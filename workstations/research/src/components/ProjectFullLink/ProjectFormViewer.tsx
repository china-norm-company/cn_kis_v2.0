/**
 * 方案解析结果表单展示/编辑（与 KIS 一致的结构与区块）
 * 场地计划、样品计划、招募计划、耗材计划、访视计划、设备计划、评估计划、辅助测量计划、特殊要求
 */
import { useState, useEffect } from 'react'
import { Card, Input, Button, Badge } from '@cn-kis/ui-kit'
import {
  MapPin,
  Package,
  Users,
  Beaker,
  CalendarCheck,
  Monitor,
  ClipboardList,
  Wrench,
  AlertTriangle,
  Trash2,
  Plus,
} from 'lucide-react'

type JSONValue = string | number | boolean | null | JSONObject | JSONValue[]
interface JSONObject {
  [key: string]: JSONValue
}

const getValue = (obj: JSONObject | undefined, key: string): string => {
  if (!obj) return ''
  const v = obj[key]
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 将字符串中的 \n 转为前端换行（支持字面量 "\\n" 与真实换行符），展示时配合 whitespace-pre-line 使用 */
const toDisplayMultiline = (s: string): string => (s || '').replace(/\\n/g, '\n')

export interface ProjectFormViewerProps {
  data: JSONObject
  editable?: boolean
  onSave?: (updatedData: JSONObject) => void
}

export function ProjectFormViewer({ data, editable = true, onSave }: ProjectFormViewerProps) {
  const [formData, setFormData] = useState<JSONObject>(data)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (!hasChanges) setFormData(data)
  }, [data, hasChanges])

  const getArray = (key: string): JSONValue[] => {
    const v = formData[key]
    return Array.isArray(v) ? v : []
  }

  const updateObjectField = (objectKey: string, field: string, value: string) => {
    const cur = (formData[objectKey] as JSONObject) || {}
    setFormData((prev) => ({ ...prev, [objectKey]: { ...cur, [field]: value } }))
    setHasChanges(true)
  }

  const updateArrayItem = (key: string, index: number, field: string, value: string | boolean) => {
    const arr = getArray(key) as JSONObject[]
    const next = arr.map((item, i) => (i === index ? { ...(item as JSONObject), [field]: value } : item))
    setFormData((prev) => ({ ...prev, [key]: next }))
    setHasChanges(true)
  }

  const addArrayItem = (key: string, template: JSONObject) => {
    setFormData((prev) => ({
      ...prev,
      [key]: [...getArray(key), { ...template }],
    }))
    setHasChanges(true)
  }

  const deleteArrayItem = (key: string, index: number) => {
    setFormData((prev) => ({
      ...prev,
      [key]: getArray(key).filter((_, i) => i !== index),
    }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onSave?.(formData)
    setHasChanges(false)
  }

  const sitePlan = formData.site_plan as JSONObject | undefined
  const samplePlan = getArray('sample_plan')
  const recruitmentPlan = getArray('recruitment_plan')
  const consumablesPlan = getArray('consumables_plan')
  const visitPlan = getArray('visit_plan')
  const equipmentPlan = getArray('equipment_plan')
  const evaluationPlan = getArray('evaluation_plan')
  const auxiliaryPlan = getArray('auxiliary_measurement_plan')
  const specialReqs = formData.special_requirements as JSONObject | undefined

  const Field = ({
    label,
    value,
    onChange,
    className = '',
  }: {
    label: string
    value: string
    onChange?: (v: string) => void
    className?: string
  }) => (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {editable && onChange ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="待填写" className="text-sm" />
      ) : (
        <div className="px-3 py-2 border border-slate-200 rounded-md bg-white text-sm min-h-[38px] whitespace-pre-line">{toDisplayMultiline(value || '待填写')}</div>
      )}
    </div>
  )

  const TextField = ({
    label,
    value,
    onChange,
    className = '',
  }: {
    label: string
    value: string
    onChange?: (v: string) => void
    className?: string
  }) => (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {editable && onChange ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="待填写"
          rows={3}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm min-h-[80px]"
        />
      ) : (
        <div className="px-3 py-2 border border-slate-200 rounded-md bg-white text-sm min-h-[80px] whitespace-pre-line">{toDisplayMultiline(value || '待填写')}</div>
      )}
    </div>
  )

  // 新建项模板（与 KIS 项目全链路新建功能字段一致）
  const sampleTemplate: JSONObject = {
    sample_type: 'test',
    sample_name: '', sample_code: '', formula_no: '', batch_no: '',
    physical_state: '', color: '', specification: '', quantity: '',
    production_date: '', expiry_date: '', arrival_time: '',
    storage_requirements: '', usage_requirements: '', visit_points: '',
    compliance_requirements: '',
  }
  const recruitmentTemplate: JSONObject = {
    group_name: '', sample_size: '', age_range: '', age_quota: '',
    gender_requirement: '', gender_quota: '', skin_type: '', skin_type_quota: '',
    backup_count: '', inclusion_criteria: '', exclusion_criteria: '',
    subject_visit_notes: '',
  }
  const consumablesTemplate: JSONObject = {
    consumable_name: '', quantity: '', special_requirements: '',
    visit_points: '', usage_scenario: '', usage_requirements: '',
  }
  const visitTemplate: JSONObject = {
    group_name: '', visit_time_point: '', test_time_point: '',
    visit_sequence: '', visit_type: '', allowed_window_deviation: '',
    is_interim_delivery: false, process_steps: '',
  }
  const equipmentTemplate: JSONObject = {
    test_indicator: '', test_equipment: '', test_location: '',
    test_point: '', measurement_frequency: '', parameters: '',
    visit_time_point: '',
  }
  const evaluationTemplate: JSONObject = {
    evaluator_category: '', evaluation_category: '',
    evaluation_indicator: '', visit_time_point: '',
  }
  const auxiliaryTemplate: JSONObject = {
    operation_name: '', operation_location: '',
    operation_method: '', visit_time_point: '',
  }

  return (
    <div className="space-y-6">
      {/* 1. 场地计划（与 KIS 图1 一致：场地要求 + 场地环境要求-温度/湿度/暗室） */}
      <Card id="site-plan" className="p-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5" /> 场地计划
        </h3>
        <div className="space-y-4">
          <Field
            label="场地要求"
            value={getValue(sitePlan, 'site_requirements')}
            onChange={editable ? (v) => updateObjectField('site_plan', 'site_requirements', v) : undefined}
          />
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
            <h4 className="text-sm font-medium text-slate-700 mb-3">场地环境要求</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field
                label="温度"
                value={getValue(sitePlan, 'temperature')}
                onChange={editable ? (v) => updateObjectField('site_plan', 'temperature', v) : undefined}
              />
              <Field
                label="湿度"
                value={getValue(sitePlan, 'humidity')}
                onChange={editable ? (v) => updateObjectField('site_plan', 'humidity', v) : undefined}
              />
              <Field
                label="暗室"
                value={getValue(sitePlan, 'dark_room')}
                onChange={editable ? (v) => updateObjectField('site_plan', 'dark_room', v) : undefined}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 2. 样品计划（与 KIS 新建字段一致） */}
      <Card id="sample-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5" /> 样品计划
            {samplePlan.length > 0 && <Badge variant="secondary">{samplePlan.length} 个样品</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('sample_plan', sampleTemplate)}>
              新建
            </Button>
          )}
        </div>
        {samplePlan.length > 0 ? (
          <ul className="space-y-4">
            {(samplePlan as JSONObject[]).map((s, idx) => (
              <li key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-800">样品 {idx + 1}</span>
                  {editable && (
                    <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('sample_plan', idx)} />
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">样品类型</label>
                    {editable ? (
                      <select
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        value={getValue(s as JSONObject, 'sample_type') || 'test'}
                        onChange={(e) => updateArrayItem('sample_plan', idx, 'sample_type', e.target.value)}
                      >
                        <option value="test">测试样品</option>
                        <option value="auxiliary">辅助样品</option>
                      </select>
                    ) : (
                      <div className="px-3 py-2 border border-slate-200 rounded-md bg-white text-sm min-h-[38px]">{getValue(s as JSONObject, 'sample_type') === 'auxiliary' ? '辅助样品' : '测试样品'}</div>
                    )}
                  </div>
                  <Field label="样品名称" value={getValue(s as JSONObject, 'sample_name')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'sample_name', v) : undefined} />
                  <Field label="样品代码" value={getValue(s as JSONObject, 'sample_code')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'sample_code', v) : undefined} />
                  <Field label="配方号" value={getValue(s as JSONObject, 'formula_no')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'formula_no', v) : undefined} />
                  <Field label="批号" value={getValue(s as JSONObject, 'batch_no')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'batch_no', v) : undefined} />
                  <Field label="物态" value={getValue(s as JSONObject, 'physical_state')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'physical_state', v) : undefined} />
                  <Field label="颜色" value={getValue(s as JSONObject, 'color')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'color', v) : undefined} />
                  <Field label="规格" value={getValue(s as JSONObject, 'specification')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'specification', v) : undefined} />
                  <Field label="数量" value={getValue(s as JSONObject, 'quantity')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'quantity', v) : undefined} />
                  <Field label="生产日期" value={getValue(s as JSONObject, 'production_date')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'production_date', v) : undefined} />
                  <Field label="保质期/有效日期" value={getValue(s as JSONObject, 'expiry_date')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'expiry_date', v) : undefined} />
                  <Field label="到样时间" value={getValue(s as JSONObject, 'arrival_time')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'arrival_time', v) : undefined} />
                  <Field label="储存要求" value={getValue(s as JSONObject, 'storage_requirements')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'storage_requirements', v) : undefined} />
                  <Field label="用量要求" value={getValue(s as JSONObject, 'usage_requirements')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'usage_requirements', v) : undefined} />
                  <Field label="使用访视点" value={getValue(s as JSONObject, 'visit_points')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'visit_points', v) : undefined} />
                  <div className="md:col-span-4">
                    <TextField label="依从性管理要求" value={getValue(s as JSONObject, 'compliance_requirements')} onChange={editable ? (v) => updateArrayItem('sample_plan', idx, 'compliance_requirements', v) : undefined} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无样品计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 3. 招募计划（与 KIS 新建字段一致） */}
      <Card id="recruitment-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Users className="h-5 w-5" /> 招募计划
            {recruitmentPlan.length > 0 && <Badge variant="secondary">{recruitmentPlan.length} 个样本组</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('recruitment_plan', recruitmentTemplate)}>
              新建
            </Button>
          )}
        </div>
        {recruitmentPlan.length > 0 ? (
          <ul className="space-y-4">
            {(recruitmentPlan as JSONObject[]).map((r, idx) => (
              <li key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-800">样本组别 {idx + 1}</span>
                  {editable && <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('recruitment_plan', idx)} />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Field label="样本组别" value={getValue(r as JSONObject, 'group_name')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'group_name', v) : undefined} />
                  <Field label="样本数量" value={getValue(r as JSONObject, 'sample_size')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'sample_size', v) : undefined} />
                  <Field label="年龄范围" value={getValue(r as JSONObject, 'age_range')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'age_range', v) : undefined} />
                  <Field label="年龄配额" value={getValue(r as JSONObject, 'age_quota')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'age_quota', v) : undefined} />
                  <Field label="性别要求" value={getValue(r as JSONObject, 'gender_requirement')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'gender_requirement', v) : undefined} />
                  <Field label="性别配额" value={getValue(r as JSONObject, 'gender_quota')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'gender_quota', v) : undefined} />
                  <Field label="肤质类型" value={getValue(r as JSONObject, 'skin_type')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'skin_type', v) : undefined} />
                  <Field label="肤质配额" value={getValue(r as JSONObject, 'skin_type_quota')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'skin_type_quota', v) : undefined} />
                  <Field label="备份数量" value={getValue(r as JSONObject, 'backup_count')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'backup_count', v) : undefined} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <TextField label="入组标准" value={getValue(r as JSONObject, 'inclusion_criteria')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'inclusion_criteria', v) : undefined} />
                  <TextField label="排除标准" value={getValue(r as JSONObject, 'exclusion_criteria')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'exclusion_criteria', v) : undefined} />
                </div>
                <div className="mt-3">
                  <TextField label="受试者来访注意事项" value={getValue(r as JSONObject, 'subject_visit_notes')} onChange={editable ? (v) => updateArrayItem('recruitment_plan', idx, 'subject_visit_notes', v) : undefined} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无招募计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 4. 耗材计划（与 KIS 新建字段一致） */}
      <Card id="consumables-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Beaker className="h-5 w-5" /> 耗材计划
            {consumablesPlan.length > 0 && <Badge variant="secondary">{consumablesPlan.length} 种耗材</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('consumables_plan', consumablesTemplate)}>
              新建
            </Button>
          )}
        </div>
        {consumablesPlan.length > 0 ? (
          <ul className="space-y-4">
            {(consumablesPlan as JSONObject[]).map((c, idx) => (
              <li key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-800">耗材 {idx + 1}</span>
                  {editable && <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('consumables_plan', idx)} />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Field label="耗材名称" value={getValue(c as JSONObject, 'consumable_name')} onChange={editable ? (v) => updateArrayItem('consumables_plan', idx, 'consumable_name', v) : undefined} />
                  <Field label="数量" value={getValue(c as JSONObject, 'quantity')} onChange={editable ? (v) => updateArrayItem('consumables_plan', idx, 'quantity', v) : undefined} />
                  <Field label="特殊要求" value={getValue(c as JSONObject, 'special_requirements')} onChange={editable ? (v) => updateArrayItem('consumables_plan', idx, 'special_requirements', v) : undefined} />
                  <Field label="使用访视点" value={getValue(c as JSONObject, 'visit_points')} onChange={editable ? (v) => updateArrayItem('consumables_plan', idx, 'visit_points', v) : undefined} />
                  <Field label="使用场景" value={getValue(c as JSONObject, 'usage_scenario')} className="md:col-span-2" onChange={editable ? (v) => updateArrayItem('consumables_plan', idx, 'usage_scenario', v) : undefined} />
                  <Field label="使用要求" value={getValue(c as JSONObject, 'usage_requirements')} className="md:col-span-2" onChange={editable ? (v) => updateArrayItem('consumables_plan', idx, 'usage_requirements', v) : undefined} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无耗材计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 5. 访视计划（与 KIS 新建字段一致） */}
      <Card id="visit-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" /> 访视计划
            {visitPlan.length > 0 && <Badge variant="secondary">{visitPlan.length} 个访视</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('visit_plan', visitTemplate)}>
              新建
            </Button>
          )}
        </div>
        {visitPlan.length > 0 ? (
          <ul className="space-y-4">
            {(visitPlan as JSONObject[]).map((v, idx) => {
              const vObj = v as JSONObject
              const isInterim = vObj.is_interim_delivery === true || vObj.is_interim_delivery === 'true'
              return (
                <li key={idx} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-slate-800">访视 {idx + 1}</span>
                    {editable && <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('visit_plan', idx)} />}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <Field label="样本组别" value={getValue(vObj, 'group_name')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'group_name', val) : undefined} />
                    <Field label="访视时间点" value={getValue(vObj, 'visit_time_point')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'visit_time_point', val) : undefined} />
                    <Field label="当日测试时间点" value={getValue(vObj, 'test_time_point')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'test_time_point', val) : undefined} />
                    <Field label="检测环节顺序" value={getValue(vObj, 'visit_sequence')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'visit_sequence', val) : undefined} />
                    <Field label="访视类型" value={getValue(vObj, 'visit_type')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'visit_type', val) : undefined} />
                    <Field label="允许超窗期" value={getValue(vObj, 'allowed_window_deviation')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'allowed_window_deviation', val) : undefined} />
                    <div className="flex items-center gap-2 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">中期交付</label>
                      {editable ? (
                        <input
                          type="checkbox"
                          checked={!!isInterim}
                          onChange={(e) => updateArrayItem('visit_plan', idx, 'is_interim_delivery', e.target.checked)}
                          className="rounded border-slate-300"
                        />
                      ) : (
                        <span className="text-sm">{isInterim ? '是' : '否'}</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <TextField label="检测环节名称/流程步骤" value={getValue(vObj, 'process_steps')} onChange={editable ? (val) => updateArrayItem('visit_plan', idx, 'process_steps', val) : undefined} />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无访视计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 6. 设备计划（与 KIS 新建字段一致） */}
      <Card id="equipment-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Monitor className="h-5 w-5" /> 设备计划
            {equipmentPlan.length > 0 && <Badge variant="secondary">{equipmentPlan.length} 个设备</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('equipment_plan', equipmentTemplate)}>
              新建
            </Button>
          )}
        </div>
        {equipmentPlan.length > 0 ? (
          <ul className="space-y-4">
            {(equipmentPlan as JSONObject[]).map((e, idx) => (
              <li key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-800">设备 {idx + 1}</span>
                  {editable && <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('equipment_plan', idx)} />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Field label="测试指标" value={getValue(e as JSONObject, 'test_indicator')} onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'test_indicator', v) : undefined} />
                  <Field label="测试设备" value={getValue(e as JSONObject, 'test_equipment')} onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'test_equipment', v) : undefined} />
                  <Field label="测试部位" value={getValue(e as JSONObject, 'test_location')} onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'test_location', v) : undefined} />
                  <Field label="测试点位" value={getValue(e as JSONObject, 'test_point')} onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'test_point', v) : undefined} />
                  <Field label="测量频次" value={getValue(e as JSONObject, 'measurement_frequency')} onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'measurement_frequency', v) : undefined} />
                  <Field label="访视时间点" value={getValue(e as JSONObject, 'visit_time_point')} onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'visit_time_point', v) : undefined} />
                  <Field label="参数" value={getValue(e as JSONObject, 'parameters')} className="md:col-span-3" onChange={editable ? (v) => updateArrayItem('equipment_plan', idx, 'parameters', v) : undefined} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无设备计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 7. 评估计划（与 KIS 新建字段一致） */}
      <Card id="evaluation-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> 评估计划
            {evaluationPlan.length > 0 && <Badge variant="secondary">{evaluationPlan.length} 项评估</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('evaluation_plan', evaluationTemplate)}>
              新建
            </Button>
          )}
        </div>
        {evaluationPlan.length > 0 ? (
          <ul className="space-y-4">
            {(evaluationPlan as JSONObject[]).map((e, idx) => (
              <li key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-800">评估 {idx + 1}</span>
                  {editable && <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('evaluation_plan', idx)} />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Field label="评估人员类别" value={getValue(e as JSONObject, 'evaluator_category')} onChange={editable ? (v) => updateArrayItem('evaluation_plan', idx, 'evaluator_category', v) : undefined} />
                  <Field label="评估指标类别" value={getValue(e as JSONObject, 'evaluation_category')} onChange={editable ? (v) => updateArrayItem('evaluation_plan', idx, 'evaluation_category', v) : undefined} />
                  <Field label="评估指标" value={getValue(e as JSONObject, 'evaluation_indicator')} onChange={editable ? (v) => updateArrayItem('evaluation_plan', idx, 'evaluation_indicator', v) : undefined} />
                  <Field label="访视时间点" value={getValue(e as JSONObject, 'visit_time_point')} onChange={editable ? (v) => updateArrayItem('evaluation_plan', idx, 'visit_time_point', v) : undefined} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无评估计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 8. 辅助测量计划（与 KIS 新建字段一致） */}
      <Card id="auxiliary-measurement-plan" className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Wrench className="h-5 w-5" /> 辅助测量计划
            {auxiliaryPlan.length > 0 && <Badge variant="secondary">{auxiliaryPlan.length} 项操作</Badge>}
          </h3>
          {editable && (
            <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => addArrayItem('auxiliary_measurement_plan', auxiliaryTemplate)}>
              新建
            </Button>
          )}
        </div>
        {auxiliaryPlan.length > 0 ? (
          <ul className="space-y-4">
            {(auxiliaryPlan as JSONObject[]).map((a, idx) => (
              <li key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-800">辅助操作 {idx + 1}</span>
                  {editable && <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteArrayItem('auxiliary_measurement_plan', idx)} />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Field label="辅助操作名称" value={getValue(a as JSONObject, 'operation_name')} onChange={editable ? (v) => updateArrayItem('auxiliary_measurement_plan', idx, 'operation_name', v) : undefined} />
                  <Field label="操作部位" value={getValue(a as JSONObject, 'operation_location')} onChange={editable ? (v) => updateArrayItem('auxiliary_measurement_plan', idx, 'operation_location', v) : undefined} />
                  <Field label="操作方法" value={getValue(a as JSONObject, 'operation_method')} onChange={editable ? (v) => updateArrayItem('auxiliary_measurement_plan', idx, 'operation_method', v) : undefined} />
                  <Field label="访视时间点" value={getValue(a as JSONObject, 'visit_time_point')} onChange={editable ? (v) => updateArrayItem('auxiliary_measurement_plan', idx, 'visit_time_point', v) : undefined} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无辅助测量计划{editable && '，点击「新建」添加'}</p>
        )}
      </Card>

      {/* 9. 特殊要求（与 KIS 一致：仅 3 个文本框） */}
      <Card id="special-requirements" className="p-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> 特殊要求
        </h3>
        <div className="space-y-4">
          <TextField
            label="比如特殊人员资质"
            value={getValue(specialReqs, 'special_personnel_qualifications')}
            onChange={editable ? (v) => updateObjectField('special_requirements', 'special_personnel_qualifications', v) : undefined}
          />
          <TextField
            label="客户设备"
            value={getValue(specialReqs, 'customer_equipment')}
            onChange={editable ? (v) => updateObjectField('special_requirements', 'customer_equipment', v) : undefined}
          />
          <TextField
            label="其他特殊要求"
            value={getValue(specialReqs, 'other_requirements')}
            onChange={editable ? (v) => updateObjectField('special_requirements', 'other_requirements', v) : undefined}
          />
        </div>
      </Card>
    </div>
  )
}
