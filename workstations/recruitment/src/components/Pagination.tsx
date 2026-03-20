interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-colors"
      >
        上一页
      </button>
      <span className="text-sm text-slate-500">
        第 {page} / {totalPages} 页，共 {total} 条
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50 transition-colors"
      >
        下一页
      </button>
    </div>
  )
}
