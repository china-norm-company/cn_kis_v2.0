/**
 * 访视计划预览弹窗（与 KIS 一致）
 */
import { Modal } from '@cn-kis/ui-kit'
import { CalendarCheck, Monitor, User } from 'lucide-react'
import type { VisitPlanItem } from '../../utils/visitPlanConverter'

export interface VisitPlanPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  visitPlan: VisitPlanItem[]
  protocolName?: string
  projectName?: string
}

export function VisitPlanPreviewDialog({
  open,
  onOpenChange,
  visitPlan,
  protocolName,
  projectName,
}: VisitPlanPreviewDialogProps) {
  const totalVisits = visitPlan.length
  const totalEquipments = new Set(visitPlan.flatMap((v) => v.equipments.map((e) => e.equipmentName))).size
  const totalEvaluatorTypes = new Set(visitPlan.flatMap((v) => v.evaluators.map((e) => e.evaluationType))).size

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="访视计划预览"
      size="xl"
      footer={null}
    >
      <div className="space-y-4">
        {(protocolName || projectName) && (
          <p className="text-sm text-slate-600">
            {protocolName && <span className="font-medium">{protocolName}</span>}
            {projectName && <span className="ml-2">| {projectName}</span>}
            <span className="ml-2">| 共 {totalVisits} 个访视点</span>
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <CalendarCheck className="h-5 w-5 text-blue-600" />
            <div>
              <div className="text-xs text-blue-600">访视点</div>
              <div className="text-lg font-bold text-blue-700">{totalVisits}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
            <Monitor className="h-5 w-5 text-purple-600" />
            <div>
              <div className="text-xs text-purple-600">设备类型</div>
              <div className="text-lg font-bold text-purple-700">{totalEquipments}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-100">
            <User className="h-5 w-5 text-green-600" />
            <div>
              <div className="text-xs text-green-600">评估类别</div>
              <div className="text-lg font-bold text-green-700">{totalEvaluatorTypes}</div>
            </div>
          </div>
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[50vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-700">序号</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-700">访视点</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-700">组别</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-700">测试时间点</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-700">设备</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-700">评估</th>
                </tr>
              </thead>
              <tbody>
                {visitPlan.map((v, i) => (
                  <tr key={v.visitId} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{v.visitName || v.visitCode}</td>
                    <td className="px-3 py-2">{v.groupName || '-'}</td>
                    <td className="px-3 py-2">{v.testTimePoint || '-'}</td>
                    <td className="px-3 py-2">{v.equipments.map((e) => e.equipmentName).join(', ') || '-'}</td>
                    <td className="px-3 py-2">{v.evaluators.map((e) => e.evaluationType).join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
