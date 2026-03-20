import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Search, FileText, Bell, ExternalLink, ChevronRight } from 'lucide-react'
import { qualityApi } from '@cn-kis/api-client'

type TabKey = 'sop' | 'changes' | 'announcements'

export function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('sop')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch SOPs from quality module
  const { data: sopRes, isLoading: sopLoading } = useQuery({
    queryKey: ['quality', 'sops', searchQuery],
    queryFn: () => qualityApi.listSOPs({ keyword: searchQuery || undefined, page_size: 50 }),
    enabled: activeTab === 'sop',
  })

  const sops = ((sopRes as any)?.data?.items ?? []) as any[]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">知识库</h2>
        <p className="text-sm text-slate-500 mt-1">SOP 查阅、操作手册与变更通知</p>
      </div>

      {/* 搜索栏 */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 SOP、操作手册、检测方法..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {[
          { key: 'sop' as TabKey, label: 'SOP / 操作手册', icon: FileText },
          { key: 'changes' as TabKey, label: '变更通知', icon: Bell },
          { key: 'announcements' as TabKey, label: '系统公告', icon: BookOpen },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'sop' && (
        <div className="space-y-3">
          {sopLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
          ) : sops.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery ? `未找到与"${searchQuery}"相关的 SOP` : '暂无 SOP 文档'}
              </p>
            </div>
          ) : (
            sops.map((sop: any) => (
              <div key={sop.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-200 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      <p className="text-sm font-medium text-slate-800">{sop.title}</p>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                        sop.status === 'active' ? 'bg-green-100 text-green-700' :
                        sop.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {sop.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 ml-6">
                      {sop.sop_number ?? ''} · 版本 {sop.version ?? '-'} · {sop.category ?? ''}
                    </p>
                  </div>
                  <a
                    href={`/quality/sop/${sop.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'changes' && (
        <ChangeNotificationsTab />
      )}

      {activeTab === 'announcements' && (
        <AnnouncementsTab />
      )}
    </div>
  )
}

function ChangeNotificationsTab() {
  const { data: changesRes, isLoading } = useQuery({
    queryKey: ['quality', 'changes'],
    queryFn: () => qualityApi.listChangeRequests?.({ page_size: 20 }) ?? Promise.resolve({ data: { items: [] } }),
  })

  const changes = ((changesRes as any)?.data?.items ?? []) as any[]

  if (isLoading) {
    return <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
  }

  if (changes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">暂无变更通知</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {changes.map((change: any) => (
        <div key={change.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-200 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-slate-800">{change.title}</span>
            </div>
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              change.status === 'approved' ? 'bg-green-100 text-green-700' :
              change.status === 'pending' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {change.status === 'approved' ? '已批准' :
               change.status === 'pending' ? '待审批' :
               change.status === 'rejected' ? '已拒绝' : change.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 ml-6">{change.description?.slice(0, 100) ?? ''}</p>
          <div className="flex gap-4 mt-2 ml-6 text-xs text-slate-400">
            {change.change_type && <span>类型: {change.change_type}</span>}
            {change.created_at && <span>时间: {new Date(change.created_at).toLocaleDateString('zh-CN')}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function AnnouncementsTab() {
  const { data: announcementsRes, isLoading } = useQuery({
    queryKey: ['system', 'announcements'],
    queryFn: () => fetch('/api/v1/notification/announcements?page_size=20')
      .then(r => r.json())
      .catch(() => ({ data: { items: [] } })),
  })

  const announcements = ((announcementsRes as any)?.data?.items ?? []) as any[]

  if (isLoading) {
    return <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
  }

  if (announcements.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">暂无系统公告</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {announcements.map((ann: any, i: number) => (
        <div key={ann.id ?? i} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-slate-800">{ann.title}</span>
            {ann.is_important && (
              <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 rounded-full">重要</span>
            )}
          </div>
          <p className="text-xs text-slate-500 ml-6">{ann.content?.slice(0, 150) ?? ''}</p>
          {ann.published_at && (
            <p className="text-xs text-slate-400 ml-6 mt-1">{new Date(ann.published_at).toLocaleDateString('zh-CN')}</p>
          )}
        </div>
      ))}
    </div>
  )
}
