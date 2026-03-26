import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div
      className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-1 shadow-sm dark:border-0 dark:bg-slate-800/90"
      role="group"
      aria-label="主题切换"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-pressed={theme === 'light'}
        className={clsx(
          'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
          theme === 'light'
            ? 'bg-white text-primary-600 shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-400 dark:text-slate-900 dark:ring-slate-400/50'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/70',
        )}
      >
        明亮
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-pressed={theme === 'dark'}
        className={clsx(
          'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
          theme === 'dark'
            ? 'bg-slate-600 text-white shadow-sm ring-1 ring-slate-500/60 dark:bg-slate-400 dark:text-white dark:ring-slate-300/50'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/70',
        )}
      >
        暗夜
      </button>
    </div>
  )
}
