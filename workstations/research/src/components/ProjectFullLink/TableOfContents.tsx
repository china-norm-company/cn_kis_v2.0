/**
 * 左侧目录（与 KIS 一致）
 * 点击滚动到对应区块，滚动时高亮当前项
 */
import { useEffect, useState } from 'react'

export interface TableOfContentsItem {
  id: string
  title: string
  visible?: boolean
}

export interface TableOfContentsProps {
  items: TableOfContentsItem[]
  className?: string
}

export function TableOfContents({ items, className = '' }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState('')

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => setActiveId(id), 100)
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY + 150
      let current = ''
      for (const item of items) {
        if (item.visible === false) continue
        const el = document.getElementById(item.id)
        if (el && scrollY >= el.offsetTop) current = item.id
        else break
      }
      if (current) setActiveId(current)
    }
    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [items])

  const visible = items.filter((i) => i.visible !== false)
  if (visible.length === 0) return null

  return (
    <div className={`sticky top-20 ${className}`}>
      <div className="border border-slate-200 rounded-lg bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">目录</h3>
        <nav className="space-y-1 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToElement(item.id)}
              className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                activeId === item.id
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {item.title}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
