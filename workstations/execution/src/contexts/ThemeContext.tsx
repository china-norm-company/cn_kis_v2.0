import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'execution-theme'
const DARK_STYLE_ID = 'execution-dark-theme-inline'

export type Theme = 'light' | 'dark'

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
    // 强制注入样式，确保整页变暗（不依赖 Tailwind 是否生效）
    let el = document.getElementById(DARK_STYLE_ID)
    if (!el) {
      el = document.createElement('style')
      el.id = DARK_STYLE_ID
      document.head.appendChild(el)
    }
    el.textContent = `
      html, body, #root, #root > * { background-color: #0F121C !important; color: #94a3b8 !important; }
      [class*="bg-slate-50"], [class*="bg-white"] { background-color: #0F121C !important; }
      [class*="text-slate-800"], [class*="text-slate-700"], [class*="text-slate-600"], [class*="text-slate-500"] { color: #94a3b8 !important; }
      select, select option { color: #0f172a !important; background-color: #ffffff !important; }
      [class*="bg-green-"]:not([class*="bg-green-9"]), [class*="bg-emerald-50"], [class*="bg-sky-50"], [class*="bg-blue-50"], [class*="bg-amber-"], [class*="bg-yellow-"] { color: #0f172a !important; }
      /* 暗夜：浅色 border/divide 在深色底上会呈「白线」，统一压成深灰（与 tailwind dark:border-[#3b434e] 一致） */
      html.dark [class*="border-slate-100"], html.dark [class*="border-slate-200"], html.dark [class*="border-slate-300"] { border-color: #3b434e !important; }
      html.dark [class*="border-gray-100"], html.dark [class*="border-gray-200"], html.dark [class*="border-gray-300"] { border-color: #3b434e !important; }
      html.dark [class*="border-neutral-200"], html.dark [class*="border-neutral-300"] { border-color: #3b434e !important; }
      html.dark [class*="divide-slate-100"], html.dark [class*="divide-slate-200"] { --tw-divide-opacity: 1 !important; border-color: #3b434e !important; }
      html.dark [class*="divide-gray-100"], html.dark [class*="divide-gray-200"] { --tw-divide-opacity: 1 !important; border-color: #3b434e !important; }
      /* 焦点环：ring-slate-* 在暗夜仍偏亮 */
      html.dark [class*="ring-slate-200"] { --tw-ring-color: rgb(59 67 78 / 0.55) !important; }
      html.dark [class*="ring-slate-300"] { --tw-ring-color: rgb(71 85 105 / 0.5) !important; }
      /* 资源需求列表 .cnkis-project-list：表格内白线彻底关闭（覆盖上文 border 统一色） */
      html.dark .cnkis-project-list table, html.dark .cnkis-project-list thead, html.dark .cnkis-project-list tbody, html.dark .cnkis-project-list tfoot, html.dark .cnkis-project-list tr, html.dark .cnkis-project-list th, html.dark .cnkis-project-list td {
        border-color: transparent !important; border-style: none !important; border-width: 0 !important; outline: none !important; box-shadow: none !important;
      }
      html.dark .cnkis-project-list tr::before, html.dark .cnkis-project-list tr::after, html.dark .cnkis-project-list th::before, html.dark .cnkis-project-list th::after, html.dark .cnkis-project-list td::before, html.dark .cnkis-project-list td::after {
        display: none !important; border: none !important; content: none !important; box-shadow: none !important;
      }
      html.dark .cnkis-project-list .divide-y > :not([hidden]) ~ :not([hidden]) { border-top-width: 0 !important; border-color: transparent !important; }
      html.dark .cnkis-project-list .cnkis-datatable-desktop-wrap { border-color: transparent !important; border-width: 0 !important; box-shadow: none !important; }
      html.dark .cnkis-project-list .cnkis-datatable-mobile-stack > div { border-color: transparent !important; border-width: 0 !important; box-shadow: none !important; }
      /* 表头：统一深色底与字色（覆盖上文对 text-slate-* 的全局字色，避免浅底 th） */
      html.dark thead, html.dark thead tr { background-color: #141414 !important; }
      html.dark th { background-color: #141414 !important; color: #e5e7eb !important; }
    `
  } else {
    root.classList.remove('dark')
    const el = document.getElementById(DARK_STYLE_ID)
    if (el) el.remove()
  }
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch (_) {}
  }, [])

  useEffect(() => {
    const stored = readTheme()
    setThemeState(stored)
    applyTheme(stored)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div
        className={theme === 'dark' ? 'dark' : ''}
        style={{
          minHeight: '100%',
          ...(theme === 'dark' ? { backgroundColor: '#0F121C' } : {}),
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
