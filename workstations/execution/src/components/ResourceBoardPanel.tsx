/**
 * 资源占用看板
 *
 * 样式与设计稿一致：
 * - 顶部 10 个 Tab（每日测试list、VISIA、3D设备、探头设备、其他图像、评估人员、技术人员、行政人员、房间B+D、房间A）
 * - 表格：资源名称 | 占用（数量/时长）| 周一…周日 + 日期，数量为整数、时长为小数
 */
import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  ClipboardList,
  Camera,
  Box,
  Gauge,
  Image,
  MessageSquare,
  Wrench,
  User,
  Building,
  Building2,
} from 'lucide-react'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
/** 进度条阈值：低于为绿色，达到或超过为红色（单位：小时） */
const PROGRESS_THRESHOLD_HOURS = 7
/** 进度条满格对应的最大值：时长行按小时(8)，数量行按数量(15) */
const PROGRESS_MAX_DURATION = 8
const PROGRESS_MAX_QUANTITY = 15

type ResourceBoardTabId =
  | 'daily_test'
  | 'visia'
  | 'equip_3d'
  | 'equip_probe'
  | 'equip_image'
  | 'person_eval'
  | 'person_tech'
  | 'person_admin'
  | 'room_bd'
  | 'room_a'

const TABS: { id: ResourceBoardTabId; label: string; icon: React.ReactNode }[] = [
  { id: 'daily_test', label: '每日测试list', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'visia', label: 'VISIA资源负荷', icon: <Camera className="w-4 h-4" /> },
  { id: 'equip_3d', label: '3D设备资源负荷', icon: <Box className="w-4 h-4" /> },
  { id: 'equip_probe', label: '探头设备资源负荷', icon: <Gauge className="w-4 h-4" /> },
  { id: 'equip_image', label: '其他图像设备资源负荷', icon: <Image className="w-4 h-4" /> },
  { id: 'person_eval', label: '评估人员资源负荷', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'person_tech', label: '技术人员资源负荷', icon: <Wrench className="w-4 h-4" /> },
  { id: 'person_admin', label: '行政人员资源负荷', icon: <User className="w-4 h-4" /> },
  { id: 'room_bd', label: '房间(B+D)资源负荷', icon: <Building className="w-4 h-4" /> },
  { id: 'room_a', label: '房间(A)资源负荷', icon: <Building2 className="w-4 h-4" /> },
]

/** 3D设备资源负荷 行：与设计稿一致 */
const ROWS_3D: { name: string; occupy: '数量' | '时长' }[] = [
  { name: '项目-询期', occupy: '数量' },
  { name: '项目-正式', occupy: '数量' },
  { name: '项目-新开', occupy: '数量' },
  { name: '项目-回访', occupy: '数量' },
  { name: '图像-Primos 3D 1', occupy: '时长' },
  { name: '图像-Primos 3D 2', occupy: '时长' },
  { name: '图像-Antera3D 1', occupy: '时长' },
  { name: '图像-Antera3D 2', occupy: '时长' },
  { name: '图像-EVA-Face', occupy: '时长' },
]

/** 其他 Tab 暂用相同行结构，后续可按类型扩展 */
function getRowsForTab(tabId: ResourceBoardTabId): { name: string; occupy: '数量' | '时长' }[] {
  if (tabId === 'equip_3d') return ROWS_3D
  return ROWS_3D
}

type CellValue = number

interface WeekBlock {
  dates: string[]
  cells: CellValue[][]
}

function buildMockWeekBlocks(count: number, rowCount: number): WeekBlock[] {
  const blocks: WeekBlock[] = []
  const start = new Date(2026, 2, 4)
  for (let w = 0; w < count; w++) {
    const dates: string[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      dates.push(date.toISOString().slice(0, 10))
    }
    const cells: CellValue[][] = Array.from({ length: rowCount }, (_, ri) => {
      if (ri === 0) return [1, 1, 1, 1, 1, 1, 1]
      if (ri === 1) return [10, 10, 11, 13, 7, 12, 13]
      if (ri === 2) return [7, 8, 7, 7, 3, 8, 7]
      if (ri === 3) return [0, 0, 0, 2, 2, 2, 4]
      return [0.0, 2.5, 3.9, 1.4, 6.3, 1.6, 0.0].map((v) => Math.round((v + w * 0.5 + ri * 0.1) * 10) / 10)
    })
    blocks.push({ dates, cells })
  }
  return blocks
}

/** 单元格内容：数值 + 进度条（阈值 7：以下绿色，以上红色） */
function CellWithProgress({
  value,
  isDuration,
  isDark,
}: {
  value: number
  isDuration: boolean
  isDark: boolean
}) {
  const max = isDuration ? PROGRESS_MAX_DURATION : PROGRESS_MAX_QUANTITY
  const pct = Math.min(100, (value / max) * 100)
  const isOverThreshold = value >= PROGRESS_THRESHOLD_HOURS
  const display = isDuration ? value.toFixed(1) : String(value)
  return (
    <div className="flex flex-col gap-0.5 w-full">
      <span className="text-xs font-medium tabular-nums">{display}</span>
      <div
        className={clsx(
          'w-full h-1.5 rounded-full overflow-hidden',
          isDark ? 'bg-slate-600' : 'bg-slate-200'
        )}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={clsx('h-full rounded-full transition-all', isOverThreshold ? 'bg-red-500' : 'bg-green-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function ResourceBoardPanel() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [activeTab, setActiveTab] = useState<ResourceBoardTabId>('equip_3d')
  const rows = useMemo(() => getRowsForTab(activeTab), [activeTab])
  const [weekCount] = useState(4)
  const weekBlocks = useMemo(() => buildMockWeekBlocks(weekCount, rows.length), [weekCount, rows.length])

  return (
    <div className={clsx('rounded-xl overflow-hidden', isDark ? 'bg-slate-800' : 'bg-white border border-slate-200')}>
      {/* 顶部 10 个 Tab：图标+文案，选中为蓝色底边 + 略深灰底 */}
      <div className="flex gap-0 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600 bg-slate-100 dark:bg-slate-700 dark:border-primary-500 dark:text-primary-400 dark:bg-slate-700'
                : 'border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm border-collapse">
          <thead>
            <tr className={clsx(isDark ? 'bg-slate-700/50' : 'bg-slate-50')}>
              <th
                className={clsx(
                  'sticky left-0 z-10 w-32 py-2 px-2 text-left font-medium border-b border-r',
                  isDark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
                )}
              >
                资源名称
              </th>
              <th
                className={clsx(
                  'sticky left-[8rem] z-10 w-16 py-2 px-2 text-left font-medium border-b border-r',
                  isDark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
                )}
              >
                占用
              </th>
              {weekBlocks.map((block, bi) => (
                <th key={bi} colSpan={7} className={clsx('border-b px-0', isDark ? 'border-slate-600' : 'border-slate-200')}>
                  <div className="flex">
                    {block.dates.map((date, di) => (
                      <div
                        key={di}
                        className={clsx(
                          'flex-1 min-w-[88px] py-1 px-1 text-center border-r last:border-r-0',
                          isDark ? 'border-slate-600' : 'border-slate-200'
                        )}
                      >
                        <div className={clsx('text-xs font-medium', isDark ? 'text-slate-400' : 'text-slate-500')}>
                          {WEEKDAY_LABELS[di]}
                        </div>
                        <div className={clsx('text-xs', isDark ? 'text-slate-300' : 'text-slate-600')}>{date}</div>
                      </div>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={clsx('border-b', isDark ? 'border-slate-700/50' : 'border-slate-100')}>
                <td
                  className={clsx(
                    'sticky left-0 z-10 py-1.5 px-2 font-medium border-r',
                    isDark ? 'border-slate-600 bg-slate-800/80 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                  )}
                >
                  {row.name}
                </td>
                <td
                  className={clsx(
                    'sticky left-[8rem] z-10 py-1.5 px-2 border-r',
                    isDark ? 'border-slate-600 bg-slate-800/80 text-slate-400' : 'border-slate-200 bg-white text-slate-600'
                  )}
                >
                  {row.occupy}
                </td>
                {weekBlocks.flatMap((block, bi) =>
                  block.dates.map((_, di) => {
                    const val = block.cells[ri]?.[di] ?? 0
                    const isDuration = row.occupy === '时长'
                    return (
                      <td
                        key={`${bi}-${di}`}
                        className={clsx(
                          'min-w-[88px] py-1.5 px-1.5 border-r align-middle',
                          isDark ? 'border-slate-700/50 text-slate-300' : 'border-slate-100 text-slate-700'
                        )}
                      >
                        <CellWithProgress value={val} isDuration={isDuration} isDark={isDark} />
                      </td>
                    )
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
