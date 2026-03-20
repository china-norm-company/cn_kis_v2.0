/**
 * EDC 数据采集页
 *
 * CRF 模板管理 + CRF 记录查看
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { edcApi } from '@cn-kis/api-client'
import type { CRFTemplate, CRFRecord } from '@cn-kis/api-client'
import { Badge, Empty, Tabs, Modal } from '@cn-kis/ui-kit'
import { FileText, Database, Download, X } from 'lucide-react'

export default function EDCPage() {
  const [activeTab, setActiveTab] = useState('templates')
  const [selectedRecord, setSelectedRecord] = useState<CRFRecord | null>(null)

  const { data: templatesRes, isLoading: tplLoading } = useQuery({
    queryKey: ['edc', 'templates'],
    queryFn: () => edcApi.listTemplates({ is_active: true, page: 1, page_size: 50 }),
  })

  const { data: recordsRes, isLoading: recLoading } = useQuery({
    queryKey: ['edc', 'records'],
    queryFn: () => edcApi.listRecords({ page: 1, page_size: 50 }),
    enabled: activeTab === 'records',
  })

  const templates = templatesRes?.data?.items ?? []
  const records = recordsRes?.data?.items ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">EDC 数据采集</h2>
        <p className="text-sm text-slate-500 mt-1">CRF 模板管理与数据记录</p>
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'templates', label: 'CRF 模板' },
          { value: 'records', label: '数据记录' },
        ]}
      />

      {activeTab === 'templates' && (
        <div className="bg-white rounded-xl border border-slate-200">
          {tplLoading ? (
            <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
          ) : templates.length === 0 ? (
            <div className="p-6"><Empty message="暂无 CRF 模板" /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {templates.map((tpl: CRFTemplate) => (
                <div key={tpl.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{tpl.name}</div>
                      <div className="text-xs text-slate-400">v{tpl.version} | {tpl.description || '无描述'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={tpl.is_active ? 'success' : 'default'}>
                      {tpl.is_active ? '激活' : '停用'}
                    </Badge>
                    <button className="p-1 text-slate-400 hover:text-slate-600" title="下载模板">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <div className="bg-white rounded-xl border border-slate-200">
          {recLoading ? (
            <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
          ) : records.length === 0 ? (
            <div className="p-6"><Empty message="暂无数据记录" /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((rec: CRFRecord) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedRecord(rec)}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {rec.template_name || `CRF #${rec.template_id}`}
                      </div>
                      <div className="text-xs text-slate-400">
                        工单 #{rec.work_order_id} | {new Date(rec.create_time).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant={
                    rec.status === 'submitted' ? 'success' :
                    rec.status === 'locked' ? 'primary' :
                    rec.status === 'draft' ? 'default' : 'warning'
                  }>
                    {rec.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* CRF 记录详情 Modal */}
      <Modal isOpen={!!selectedRecord} onClose={() => setSelectedRecord(null)} title="CRF 记录详情">
        {selectedRecord && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">模板：</span>
                <span className="text-slate-700">{selectedRecord.template_name || `CRF #${selectedRecord.template_id}`}</span>
              </div>
              <div>
                <span className="text-slate-400">状态：</span>
                <Badge variant={
                  selectedRecord.status === 'submitted' ? 'success' :
                  selectedRecord.status === 'locked' ? 'primary' :
                  selectedRecord.status === 'draft' ? 'default' : 'warning'
                }>
                  {selectedRecord.status}
                </Badge>
              </div>
              <div>
                <span className="text-slate-400">工单 ID：</span>
                <span className="text-slate-700">#{selectedRecord.work_order_id}</span>
              </div>
              <div>
                <span className="text-slate-400">创建时间：</span>
                <span className="text-slate-700">{new Date(selectedRecord.create_time).toLocaleString()}</span>
              </div>
              {selectedRecord.submitted_at && (
                <div>
                  <span className="text-slate-400">提交时间：</span>
                  <span className="text-slate-700">{new Date(selectedRecord.submitted_at).toLocaleString()}</span>
                </div>
              )}
              {selectedRecord.sdv_status && (
                <div>
                  <span className="text-slate-400">SDV 状态：</span>
                  <Badge variant={selectedRecord.sdv_status === 'verified' ? 'success' : 'default'}>
                    {selectedRecord.sdv_status}
                  </Badge>
                </div>
              )}
            </div>
            {selectedRecord.data && typeof selectedRecord.data === 'object' && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">数据字段</h4>
                <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                  {Object.entries(selectedRecord.data as Record<string, unknown>).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{key}</span>
                      <span className="text-slate-700 font-mono text-xs">{String(val ?? '-')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedRecord.validation_errors && Array.isArray(selectedRecord.validation_errors) && selectedRecord.validation_errors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-red-600 mb-2">验证错误</h4>
                <ul className="list-disc list-inside text-sm text-red-500 space-y-1">
                  {selectedRecord.validation_errors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
