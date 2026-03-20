/**
 * SOP 快捷查看侧滑面板
 *
 * 执行过程中随时可打开的 SOP 文档查看器。
 * 抽屉式从右侧滑入。
 */
import { XCircle, FileText, ExternalLink, BookOpen } from 'lucide-react'

interface SOPPanelProps {
  isOpen: boolean
  onClose: () => void
  sopReference?: string
  sopId?: number
  methodName?: string
  standardProcedure?: string
  environmentNotes?: string
}

export function SOPPanel({
  isOpen, onClose,
  sopReference, sopId, methodName,
  standardProcedure, environmentNotes,
}: SOPPanelProps) {
  if (!isOpen) return null

  let procedureSteps: { step: number; name: string; description: string; duration_minutes?: number }[] = []
  if (standardProcedure) {
    try {
      const parsed = JSON.parse(standardProcedure)
      if (Array.isArray(parsed)) procedureSteps = parsed
    } catch {
      // plain text fallback
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 遮罩层 */}
      <div className="flex-1 bg-black/30 transition-opacity" onClick={onClose} />

      {/* 侧滑面板 */}
      <div className="w-[420px] bg-white shadow-xl flex flex-col animate-slide-in-right">
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-800">SOP 文档</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 方法信息 */}
          {methodName && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">检测方法</h4>
              <p className="text-sm text-slate-600">{methodName}</p>
              {sopReference && (
                <p className="text-xs text-slate-400 mt-1">SOP 参考: {sopReference}</p>
              )}
            </div>
          )}

          {/* 环境要求 */}
          {environmentNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-amber-700 mb-1">环境要求</h4>
              <p className="text-sm text-amber-600">{environmentNotes}</p>
            </div>
          )}

          {/* 标准操作步骤 */}
          {procedureSteps.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">标准操作步骤</h4>
              <div className="space-y-3">
                {procedureSteps.map((ps, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {ps.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{ps.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ps.description}</p>
                      {ps.duration_minutes && (
                        <p className="text-xs text-slate-400 mt-0.5">预计 {ps.duration_minutes} 分钟</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : standardProcedure ? (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">操作说明</h4>
              <div className="text-sm text-slate-600 whitespace-pre-wrap">{standardProcedure}</div>
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">暂无 SOP 文档</p>
              <p className="text-xs mt-1">请联系质量管理员上传 SOP</p>
            </div>
          )}

          {/* 查看完整文档链接 */}
          {sopId && (
            <a
              href={`/quality/sop/${sopId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <ExternalLink className="w-4 h-4" />在质量台查看完整 SOP 文档
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
