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
