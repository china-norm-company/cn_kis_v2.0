/**
 * D3: 知识库
 *
 * 全文搜索 + 标签筛选 + 类型筛选 + 知识条目列表
 */
import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Badge, Empty, Card, Button, Modal, Input } from '@cn-kis/ui-kit'
import type { BadgeVariant } from '@cn-kis/ui-kit'
import {
  Search, Plus, ChevronDown, ChevronUp, Tag, BookOpen,
  FileText, ClipboardList, Lightbulb, HelpCircle, Scale, Beaker,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KnowledgeEntry {
  id: number
  title: string
  type: string
  tags: string[]
  summary: string
  content: string
  created_at: string
  [key: string]: unknown
}

interface TagItem {
  name: string
  count: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<string, { label: string; variant: BadgeVariant; icon: React.ReactNode }> = {
  regulation: { label: '法规', variant: 'error', icon: <Scale className="w-3.5 h-3.5" /> },
  sop: { label: 'SOP', variant: 'primary', icon: <ClipboardList className="w-3.5 h-3.5" /> },
  template: { label: '方案模板', variant: 'info', icon: <FileText className="w-3.5 h-3.5" /> },
  method: { label: '方法参考', variant: 'success', icon: <Beaker className="w-3.5 h-3.5" /> },
  lesson: { label: '经验教训', variant: 'warning', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  faq: { label: 'FAQ', variant: 'default', icon: <HelpCircle className="w-3.5 h-3.5" /> },
}

const TYPE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'regulation', label: '法规' },
  { key: 'sop', label: 'SOP' },
  { key: 'template', label: '方案模板' },
  { key: 'method', label: '方法参考' },
  { key: 'lesson', label: '经验教训' },
  { key: 'faq', label: 'FAQ' },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // Create form state
  const [createForm, setCreateForm] = useState({
    title: '',
    type: 'sop',
    tags: '',
    summary: '',
    content: '',
  })

  // Debounced search — 用 ref 保持 timer，避免内存泄漏
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300)
  }, [])

  /* ----- Queries ----- */

  const useSearch = !!debouncedQuery.trim()

  const { data: listRes, isLoading: listLoading } = useQuery({
    queryKey: ['knowledge', 'entries', 'list', selectedType],
    queryFn: () =>
      api.get<{ items: KnowledgeEntry[] }>(
        '/knowledge/entries/list',
        {
          params: {
            ...(selectedType !== 'all' ? { type: selectedType } : {}),
          },
        },
      ),
    enabled: !useSearch,
  })

  const { data: searchRes, isLoading: searchLoading } = useQuery({
    queryKey: ['knowledge', 'entries', 'search', debouncedQuery],
    queryFn: () =>
      api.get<{ items: KnowledgeEntry[] }>(
        '/knowledge/entries/search',
        { params: { query: debouncedQuery } },
      ),
    enabled: useSearch,
  })

  const { data: tagsRes } = useQuery({
    queryKey: ['knowledge', 'tags'],
    queryFn: () => api.get<{ items: TagItem[] }>('/knowledge/tags/list'),
  })

  /* ----- Mutations ----- */

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string
      type: string
      tags: string[]
      summary: string
      content: string
    }) => api.post('/knowledge/entries/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] })
      setShowCreate(false)
      setCreateForm({ title: '', type: 'sop', tags: '', summary: '', content: '' })
    },
  })

  /* ----- Derived data ----- */

  const rawEntries = useSearch
    ? (searchRes?.data?.items ?? [])
    : (listRes?.data?.items ?? [])
  const isLoading = useSearch ? searchLoading : listLoading
  const allTags = tagsRes?.data?.items ?? []

  const entries = useMemo(() => {
    let filtered = rawEntries
    if (selectedType !== 'all' && useSearch) {
      filtered = filtered.filter((e) => e.type === selectedType)
    }
    if (selectedTags.length > 0) {
      filtered = filtered.filter((e) =>
        selectedTags.every((tag) => e.tags.includes(tag)),
      )
    }
    return filtered
  }, [rawEntries, selectedType, selectedTags, useSearch])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  /* ----- Render ----- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">知识库</h2>
          <p className="mt-1 text-sm text-slate-500">搜索和管理研究知识资产</p>
        </div>
        <PermissionGuard permission="research.knowledge.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            创建条目
          </Button>
        </PermissionGuard>
      </div>

      {/* Search bar */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="全文搜索知识条目..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500 mr-1">类型：</span>
        {TYPE_FILTERS.map((tf) => (
          <button
            key={tf.key}
            onClick={() => setSelectedType(tf.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedType === tf.key
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4 text-slate-400 mr-1" />
          {allTags.map((tag) => (
            <button
              key={tag.name}
              onClick={() => toggleTag(tag.name)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedTags.includes(tag.name)
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tag.name}
              <span className="ml-1 text-slate-400">{tag.count}</span>
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="text-xs text-slate-400 hover:text-slate-600 ml-1"
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* Entry list */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
      ) : entries.length === 0 ? (
        <Empty
          title="暂无知识条目"
          description={useSearch ? '尝试使用不同的搜索词' : '点击"创建条目"添加新知识'}
          icon={<BookOpen className="w-16 h-16" />}
          action={
            <PermissionGuard permission="research.knowledge.create">
              <Button variant="secondary" onClick={() => setShowCreate(true)}>
                创建条目
              </Button>
            </PermissionGuard>
          }
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const typeConfig = TYPE_CONFIG[entry.type] ?? {
              label: entry.type,
              variant: 'default' as BadgeVariant,
              icon: <FileText className="w-3.5 h-3.5" />,
            }
            const isExpanded = expandedId === entry.id

            return (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow"
              >
                {/* Entry header */}
                <div
                  className="flex items-start gap-4 p-5 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold text-slate-800 truncate">
                        {entry.title}
                      </h3>
                      <Badge variant={typeConfig.variant} size="sm">
                        <span className="flex items-center gap-1">
                          {typeConfig.icon}
                          {typeConfig.label}
                        </span>
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2">{entry.summary}</p>
                    <div className="flex items-center gap-3 mt-2">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="text-xs text-slate-400 ml-auto">
                        {new Date(entry.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  <button className="p-1 text-slate-400 hover:text-slate-600 flex-shrink-0 mt-1">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <div className="prose prose-sm prose-slate max-w-none text-sm text-slate-700 whitespace-pre-wrap">
                      {entry.content}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create entry modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="创建知识条目"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">标题 *</label>
            <Input
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="输入知识条目标题"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型 *</label>
            <select
              value={createForm.type}
              onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
              title="知识条目类型"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">标签</label>
            <Input
              value={createForm.tags}
              onChange={(e) => setCreateForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="多个标签用逗号分隔，如：GCP,合规"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">摘要</label>
            <textarea
              className="w-full h-20 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              value={createForm.summary}
              onChange={(e) => setCreateForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="简要描述知识条目内容"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">正文内容 *</label>
            <textarea
              className="w-full h-40 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              value={createForm.content}
              onChange={(e) => setCreateForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="输入知识条目的完整内容"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  title: createForm.title,
                  type: createForm.type,
                  tags: createForm.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                  summary: createForm.summary,
                  content: createForm.content,
                })
              }
              disabled={!createForm.title.trim() || !createForm.content.trim()}
              loading={createMutation.isPending}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
