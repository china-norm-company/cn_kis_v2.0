import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { executionApi, subjectApi, receptionApi } from '@cn-kis/api-client'
import type { Subject } from '@cn-kis/api-client'
import { Plus, Upload, FileSpreadsheet, Search, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'

const VISIT_POINT_OPTIONS = ['初筛', '复筛', '基线', 'V1', 'V2', 'V3', 'V4', '其他']
const PURPOSE_OPTIONS = ['初筛', '复筛', '常规访视', '其他']
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function notify(msg: string) {
  window.alert(msg)
}

/** 与后端 normalize_subject_phone 一致：取 11 位大陆手机号 */
function normalizeSubjectPhone11(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length >= 11) {
    const last = digits.slice(-11)
    if (last.length === 11 && last.startsWith('1')) return last
  }
  return ''
}

function subjectPhonesMatch(stored: string | undefined, input: string | undefined): boolean {
  const nStored = normalizeSubjectPhone11(stored || '')
  const nInput = normalizeSubjectPhone11(input || '')
  if (nStored && nInput) return nStored === nInput
  return (stored || '').trim() === (input || '').trim()
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map((part) => parseInt(part, 10))
  return { year, month, day }
}

function formatMonthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`
}

function formatMonthLabel(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`)
  return `${year}年${pad2(month)}月`
}

function firstDayOfMonth(monthKey: string) {
  return `${monthKey}-01`
}

function shiftMonth(monthKey: string, offset: number) {
  const { year, month } = parseDateKey(`${monthKey}-01`)
  const next = new Date(year, month - 1 + offset, 1)
  return formatMonthKey(next.getFullYear(), next.getMonth() + 1)
}

function buildMonthCells(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`)
  const firstDay = new Date(year, month - 1, 1)
  const weekdayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<{ date: string; day: number } | null> = []

  for (let i = 0; i < weekdayOffset; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: `${monthKey}-${pad2(day)}`, day })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

function formatDetailTime(value?: string | null) {
  if (!value) return '—'
  const raw = String(value).trim()
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) return raw.slice(0, 5)
  const dt = new Date(raw)
  if (!Number.isNaN(dt.getTime())) return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
  return raw
}

/**
 * 性别展示：受试者主档存的是 SubjectGender 英文码（male/female/other），接口会原样返回，故需转成中文；
 * 若为导入或手填的中文（男/女等）或其它非枚举值，则原样显示。
 */
function formatGenderCell(value: unknown): string {
  if (value === undefined || value === null) return '—'
  const s = String(value).trim()
  if (!s) return '—'
  const lower = s.toLowerCase()
  if (lower === 'male' || lower === 'm') return '男'
  if (lower === 'female' || lower === 'f') return '女'
  if (lower === 'other') return '其他'
  return s
}

export default function AppointmentsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [quickGender, setQuickGender] = useState('')
  const [quickAge, setQuickAge] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newPurpose, setNewPurpose] = useState('初筛')
  const [newVisitPoint, setNewVisitPoint] = useState('')
  const [newProjectCode, setNewProjectCode] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [newNamePinyinInitials, setNewNamePinyinInitials] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[]>([])
  const [importMeta, setImportMeta] = useState<{ projectCode: string; projectName: string; appointmentDate: string; visitPoint: string } | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)
  const [queueDate, setQueueDate] = useState(todayStr)
  const [queueListPage, setQueueListPage] = useState(1)
  const queueListPageSize = 10
  const [queueProjectFilter, setQueueProjectFilter] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(todayStr.slice(0, 7))
  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'appointments'],
    queryFn: async () => {
      const res = await subjectApi.list({ status: 'active', page_size: 400 })
      if (!res?.data) throw new Error('获取受试者列表失败')
      return res
    },
    enabled: showCreate,
    staleTime: 2 * 60 * 1000,
  })
  const todayQueueQuery = useQuery({
    queryKey: ['reception', 'today-queue', queueDate, queueListPage, queueProjectFilter.trim()],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queueDate,
        page: queueListPage,
        page_size: queueListPageSize,
        source: 'execution',
        ...(queueProjectFilter.trim() ? { project_code: queueProjectFilter.trim() } : {}),
      }),
  })
  const appointmentCalendarQuery = useQuery({
    queryKey: ['reception', 'appointment-calendar', visibleMonth],
    queryFn: () => receptionApi.appointmentCalendar(visibleMonth),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      let subjectId = selectedSubject
      if (!subjectId && (quickPhone.trim() || quickName.trim())) {
        const phoneRaw = quickPhone.trim()
        const name = quickName.trim()
        const phoneNorm = normalizeSubjectPhone11(phoneRaw)

        if (phoneNorm.length === 11) {
          try {
            const resolved = await subjectApi.resolveByPhone(phoneNorm)
            const sub = resolved.data as Subject | undefined
            if (sub?.id) subjectId = sub.id
          } catch {
            /* 无档案或无权限：走下方列表匹配 / 新建 */
          }
        }

        if (!subjectId) {
          let existing = allSubjects.find(
            (s) =>
              (phoneNorm && subjectPhonesMatch(s.phone, phoneNorm)) ||
              (!!phoneRaw && s.phone === phoneRaw) ||
              (!!phoneRaw && s.phone?.includes?.(phoneRaw)),
          )
          if (!existing && phoneNorm) {
            existing = allSubjects.find((s) => subjectPhonesMatch(s.phone, phoneNorm))
          }
          if (!existing && phoneRaw) {
            const listRes = await subjectApi.list({
              search: phoneNorm || phoneRaw,
              phone: phoneNorm || undefined,
              page_size: 80,
            })
            const items = listRes.data?.items ?? []
            existing = items.find(
              (s) =>
                subjectPhonesMatch(s.phone, phoneRaw) ||
                (phoneNorm ? subjectPhonesMatch(s.phone, phoneNorm) : false),
            )
          }
          if (!existing && name) {
            const listRes = await subjectApi.list({ search: name, page_size: 80 })
            existing = listRes.data?.items?.find((s) => s.name === name)
          }
          if (existing) subjectId = existing.id
        }

        if (!subjectId) {
          if (!name && !phoneRaw) throw new Error('请选择受试者或录入姓名、手机号')
          const ageNum = quickAge.trim() ? parseInt(quickAge.trim(), 10) : undefined
          const created = await subjectApi.create({
            name: name || '待补充',
            phone: phoneNorm || phoneRaw || '',
            gender: quickGender || undefined,
            age: Number.isFinite(ageNum) ? ageNum : undefined,
          })
          subjectId = created.data?.id
        }
      }
      if (!subjectId) throw new Error('请选择受试者或录入姓名、手机号快速新建')
      if (!newProjectCode.trim()) throw new Error('请填写项目编号')
      if (!newVisitPoint) throw new Error('请选择访视点')
      return executionApi.createAppointment(subjectId, {
        appointment_date: newDate,
        appointment_time: newTime || undefined,
        purpose: newPurpose,
        visit_point: newVisitPoint,
        project_code: newProjectCode.trim(),
        project_name: newProjectName || undefined,
        name_pinyin_initials: newNamePinyinInitials.trim() || undefined,
      })
    },
    onSuccess: () => {
      notify('预约创建成功')
      setShowCreate(false)
      setSelectedSubject(null)
      setQuickName('')
      setQuickPhone('')
      setQuickGender('')
      setQuickAge('')
      setNewDate('')
      setNewTime('')
      setNewPurpose('初筛')
      setNewVisitPoint('')
      setNewProjectCode('')
      setNewProjectName('')
      setNewNamePinyinInitials('')
      queryClient.invalidateQueries({ queryKey: ['subjects', 'appointments'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'appointment-calendar'] })
    },
    onError: (err) => notify((err as Error).message || '创建失败'),
  })

  const parseImportDate = (val: unknown): string => {
    if (val === undefined || val === null) return ''
    if (typeof val === 'string') {
      const raw = val.trim()
      const ymd = /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/.exec(raw)
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
      const slashYmd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw)
      if (slashYmd) return `${slashYmd[1]}-${slashYmd[2].padStart(2, '0')}-${slashYmd[3].padStart(2, '0')}`
      const s = raw.split('T')[0].slice(0, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
    }
    if (typeof val === 'number') {
      const d = new Date((val - 25569) * 86400 * 1000)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
      return ''
    }
    if (typeof val === 'object' && val !== null && 'date' in (val as object))
      return parseImportDate((val as { date: unknown }).date)
    const s = String(val).trim().split('T')[0].slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
  }

  const parseImportTime = (val: unknown): string => {
    if (val === undefined || val === null || val === '') return ''
    if (typeof val === 'number') {
      const h = Math.floor(val * 24)
      const m = Math.round((val * 24 - h) * 60)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return String(val).trim()
  }

  /** 预览表中日期/时间列显示为解析后的值，便于确认 Excel 序列号已正确转换 */
  const formatPreviewCell = (key: string, value: unknown): string => {
    if (value === undefined || value === null) return ''
    const timeKeys = ['时间段', '预约时间', '时间', 'time', 'appointment_time']
    const dateKeys = ['出生年月', '预约日期', '日期', 'date', '测试日期', 'appointment_date']
    if (timeKeys.includes(key)) return parseImportTime(value) || String(value)
    if (dateKeys.includes(key)) return parseImportDate(value) || String(value)
    return String(value)
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (importPreview.length === 0) throw new Error('请先上传并解析文件')
      const meta = importMeta
      const items = importPreview.map((row) => {
        const phone = String(
          row['手机号'] ?? row['phone'] ?? row['联系电话'] ?? row['电话'] ?? row['联系方式'] ?? row['手机号码'] ?? ''
        ).trim()
        const no = String(
          row['受试者编号'] ?? row['subject_no'] ?? row['编号'] ?? ''
        ).trim()
        const subjectName = String(
          row['姓名'] ?? row['受试者姓名'] ?? row['name'] ?? ''
        ).trim()
        const gender = String(
          row['性别'] ?? row['gender'] ?? ''
        ).trim()
        const ageVal = row['年龄'] ?? row['age'] ?? row['年龄段'] ?? ''
        const ageNum = typeof ageVal === 'number' ? ageVal : parseInt(String(ageVal).trim(), 10)
        const dateVal = row['预约日期'] ?? row['appointment_date'] ?? row['日期'] ?? row['date'] ?? row['测试日期'] ?? row['出生年月'] ?? ''
        const dateStr = parseImportDate(dateVal) || meta?.appointmentDate || new Date().toISOString().slice(0, 10)
        const timeVal = row['预约时间'] ?? row['appointment_time'] ?? row['时间'] ?? row['time'] ?? row['时间段'] ?? ''
        const timeStr = parseImportTime(timeVal)
        const purpose = String(row['访视目的'] ?? '常规到访').trim() || '常规到访'
        const visitPoint = String(row['访视点'] ?? row['visit_point'] ?? row['访视次数'] ?? '').trim() || (meta?.visitPoint ?? '')
        const projectCode = String(row['项目编号'] ?? row['project_code'] ?? row['方案编号'] ?? row['研究机构方案编号'] ?? '').trim() || (meta?.projectCode ?? '')
        const projectName = String(row['项目名称'] ?? row['project_name'] ?? row['研究名称'] ?? '').trim() || (meta?.projectName ?? '')
        const namePinyinInitials = String(
          row['首字母'] ?? row['拼音首字母'] ?? row['name_pinyin_initials'] ?? ''
        ).trim().toUpperCase().slice(0, 50) || undefined
        const liaison = String(row['联络员'] ?? row['liaison'] ?? '').trim().slice(0, 100) || undefined
        const scNumber = String(row['SC号'] ?? row['sc_number'] ?? row['sc号'] ?? '').trim() || undefined
        const rdNumber = String(row['RD号'] ?? row['rd_number'] ?? row['rd号'] ?? '').trim() || undefined
        return {
          subject_phone: phone || undefined,
          subject_no: no || undefined,
          subject_name: subjectName || undefined,
          name_pinyin_initials: namePinyinInitials,
          liaison,
          gender: gender || undefined,
          age: Number.isFinite(ageNum) ? ageNum : undefined,
          appointment_date: dateStr,
          appointment_time: timeStr || undefined,
          purpose,
          visit_point: visitPoint || undefined,
          project_code: projectCode || undefined,
          project_name: projectName || undefined,
          sc_number: scNumber,
          rd_number: rdNumber,
        }
      })
      return executionApi.importAppointments(items)
    },
    onSuccess: (res) => {
      const data = res?.data as { created?: number; errors?: Array<{ row: number; msg: string }> } | undefined
      const created = data?.created ?? 0
      const errors = data?.errors ?? []
      if (errors.length > 0) {
        const detail = errors.slice(0, 3).map((e) => `第${e.row}行：${e.msg}`).join('；')
        notify(`导入完成：成功 ${created} 条，失败 ${errors.length} 条。失败原因示例：${detail}`)
        if (created === 0 && errors.length > 0) {
          notify(`全部失败常见原因：\n1. 请至少填写手机号或受试者编号\n2. 手机号需为完整号码，不能是脱敏号\n3. 预约日期建议使用 YYYY-MM-DD 或 YYYY/M/D\n\n首条错误：${errors[0]?.msg ?? ''}`)
        }
      } else {
        notify(`成功导入 ${created} 条预约`)
      }
      if (created > 0 || errors.length === 0) {
        setShowImport(false)
        setImportFile(null)
        setImportPreview([])
        setImportMeta(null)
        setImportDragOver(false)
      }
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'appointment-calendar'] })
    },
    onError: (err) => notify((err as Error).message || '导入失败'),
  })

  const allSubjects: Subject[] = subjectsQuery.data?.data?.items ?? []
  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth])
  const appointmentCountMap = useMemo(() => {
    const items = appointmentCalendarQuery.data?.data?.items ?? []
    return new Map(items.map((item) => [item.date, item.total]))
  }, [appointmentCalendarQuery.data])
  const subjects = searchInput
    ? allSubjects.filter((s) => {
        const q = searchInput.trim()
        const qn = normalizeSubjectPhone11(q)
        if (qn)
          return (
            subjectPhonesMatch(s.phone, qn) ||
            Boolean(s.name?.includes(q)) ||
            Boolean(s.subject_no?.includes(q))
          )
        return (
          Boolean(s.name?.includes(q)) ||
          Boolean(s.subject_no?.includes(q)) ||
          Boolean(s.phone?.includes(q))
        )
      })
    : allSubjects

  const handleSelectQueueDate = (dateKey: string) => {
    setQueueDate(dateKey)
    setQueueListPage(1)
    setVisibleMonth(dateKey.slice(0, 7))
  }

  const handleChangeMonth = (offset: number) => {
    const nextMonth = shiftMonth(visibleMonth, offset)
    setVisibleMonth(nextMonth)
    setQueueDate(firstDayOfMonth(nextMonth))
    setQueueListPage(1)
  }

  const HEADER_MARKERS = ['序号', '时间段', '受访者姓名', '联系方式', '手机号码', '测试日期', '研究机构方案编号', '研究名称', '访视点']

  const findHeaderRow = (raw: string[][]): number => {
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const row = raw[i] || []
      const line = row.map((c) => String(c ?? '').trim()).join(' ')
      const matchCount = HEADER_MARKERS.filter((m) => line.includes(m)).length
      if (matchCount >= 2) return i
    }
    return 0
  }

  const parseTitleMeta = (raw: string[][], headerRowIndex: number) => {
    let projectCode = ''
    let projectName = ''
    let appointmentDate = ''
    let visitPoint = ''
    for (let i = 0; i < headerRowIndex; i++) {
      const row = raw[i] || []
      const cell0 = String(row[0] ?? '').trim()
      const cell1 = String(row[1] ?? '').trim()
      const cell2 = String(row[2] ?? '').trim()
      if (cell0.includes('研究机构方案编号') || cell1.includes('研究机构方案编号')) projectCode = (cell0.includes('研究机构方案编号') ? cell1 || cell2 : cell2 || cell1) || projectCode
      if (cell0.includes('研究名称') || cell1.includes('研究名称')) projectName = (cell0.includes('研究名称') ? cell1 || cell2 : cell2 || cell1) || projectName
      if (cell0.includes('测试日期') || cell1.includes('测试日期')) appointmentDate = parseImportDate(cell0.includes('测试日期') ? cell1 || cell2 : cell2 || cell1) || appointmentDate
      if (cell0.includes('访视点') || cell1.includes('访视点')) visitPoint = (cell0.includes('访视点') ? cell1 || cell2 : cell2 || cell1) || visitPoint
    }
    return { projectCode, projectName, appointmentDate, visitPoint }
  }

  const looksLikeSubheader = (row: string[]): boolean => {
    const t = row.map((c) => String(c ?? '').trim()).join(' ')
    return /手机号码|微信号|年龄段/.test(t) && !/\d{11}/.test(t)
  }

  const processImportFile = (file: File) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.name) || ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].includes(file.type)
    if (!ok) {
      notify('请上传 Excel (.xlsx/.xls) 或 CSV 文件')
      return
    }
    setImportFile(file)
    setImportMeta(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const first = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(first, { header: 1, defval: '' }) as string[][]
        if (!raw.length) {
          setImportPreview([])
          return
        }
        const headerRowIndex = findHeaderRow(raw)
        const headerCells = (raw[headerRowIndex] || []).map((c) => String(c ?? '').trim())
        let dataStart = headerRowIndex + 1
        if (raw[dataStart] && looksLikeSubheader(raw[dataStart])) {
          const sub = (raw[dataStart] || []).map((c) => String(c ?? '').trim())
          sub.forEach((s, j) => {
            if (s && (s === '手机号码' || s === '微信号' || s === '年龄段')) headerCells[j] = headerCells[j] || s
          })
          dataStart += 1
        }
        const headers = headerCells.map((c, j) => c || `列${j}`)
        const rows: Record<string, unknown>[] = []
        for (let i = dataStart; i < raw.length; i++) {
          const row = raw[i] || []
          const obj: Record<string, unknown> = {}
          headers.forEach((h, j) => {
            const v = row[j]
            if (v !== undefined && v !== null && String(v).trim() !== '') obj[h] = v
          })
          if (Object.keys(obj).length > 0) rows.push(obj)
        }
        const meta = parseTitleMeta(raw, headerRowIndex)
        if (meta.projectCode || meta.projectName || meta.appointmentDate || meta.visitPoint) {
          setImportMeta(meta)
        } else {
          setImportMeta(null)
        }
        setImportPreview(rows.slice(0, 500))
      } catch (err) {
        notify('文件解析失败，请确保为 Excel 或 CSV 格式')
        setImportPreview([])
        setImportMeta(null)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processImportFile(file)
    e.target.value = ''
  }

  const handleImportDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragOver(true)
  }
  const handleImportDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragOver(false)
  }
  const handleImportDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    processImportFile(file)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">预约管理</h2>
          <p className="text-sm text-slate-500 mt-1">新建预约、导入预约表</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> 新建预约
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Upload className="w-4 h-4" /> 导入预约表
          </button>
        </div>
      </div>

      {/* 新建预约弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[92vw] max-w-2xl my-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">新建预约</h3>
            <p className="text-sm text-slate-500 mb-3">可搜索选择已有受试者，或直接录入信息快速新建</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">受试者（搜索选择）</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="搜索姓名/编号/手机号"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg">
                  {subjectsQuery.isLoading ? (
                    <div className="px-3 py-4 text-center text-slate-500 text-sm">加载受试者列表…</div>
                  ) : subjects.length === 0 ? (
                    <div className="px-3 py-4 text-center text-slate-500 text-sm">暂无受试者，请使用下方快速录入</div>
                  ) : (
                    subjects.slice(0, 20).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSubject(s.id)}
                        className={`w-full text-left px-3 py-2 text-sm ${selectedSubject === s.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {s.name} {s.subject_no} {s.phone}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600 mb-2">
                  或快速录入（未选中受试者可在此填写）。填写手机号时将<strong className="font-medium">优先按规范化号码匹配已有主档</strong>
                  ，避免重复建档；无记录时再新建。
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">受试者姓名</label>
                    <input
                      type="text"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="姓名"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">手机号</label>
                    <input
                      type="tel"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value)}
                      placeholder="11位手机号"
                      maxLength={11}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">性别</label>
                    <select
                      value={quickGender}
                      onChange={(e) => setQuickGender((e.target.value as '' | 'M' | 'F') || '')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="">请选择</option>
                      <option value="M">男</option>
                      <option value="F">女</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">年龄（可选）</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      placeholder="岁"
                      value={quickAge}
                      onChange={(e) => setQuickAge(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预约日期</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预约时间（可选）</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访视目的</label>
                  <select
                    value={newPurpose}
                    onChange={(e) => setNewPurpose(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {PURPOSE_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访视点（必选）</label>
                  <select
                    value={newVisitPoint}
                    onChange={(e) => setNewVisitPoint(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">请选择</option>
                    {VISIT_POINT_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目编号（必填）</label>
                  <input
                    type="text"
                    value={newProjectCode}
                    onChange={(e) => setNewProjectCode(e.target.value)}
                    placeholder="如 M25076081"
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目名称（可选）</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="如 4周底妆产品"
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">拼音首字母（可选）</label>
                  <input
                    type="text"
                    value={newNamePinyinInitials}
                    onChange={(e) => setNewNamePinyinInitials(e.target.value.toUpperCase().slice(0, 50))}
                    placeholder="如 张三→ZS"
                    maxLength={50}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => { setShowCreate(false); setQuickName(''); setQuickPhone(''); setQuickGender(''); setQuickAge(''); }}
                className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={(!selectedSubject && !quickName && !quickPhone) || !newDate || !newProjectCode.trim() || !newVisitPoint || createMutation.isPending}
                className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {createMutation.isPending ? '创建中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入预约弹窗 */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[92vw] max-w-2xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" /> 导入预约表
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              支持 Excel (.xlsx/.xls) 或 CSV。表头需包含：<strong>手机号</strong> 或 <strong>受试者编号</strong>、<strong>预约日期</strong>（支持 <strong>YYYY-MM-DD</strong>、<strong>YYYY/M/D</strong>，也兼容<strong>测试日期</strong>/<strong>出生年月</strong>等日期列）、<strong>预约时间</strong>/<strong>时间段</strong>（可选）、<strong>访视目的</strong>（可选）、<strong>访视点</strong>（可选）、<strong>项目编号</strong>/<strong>项目名称</strong>（可选）。可选列：<strong>拼音首字母</strong>（列名「首字母」等）、<strong>联络员</strong>、<strong>SC号</strong>、<strong>RD号</strong>。若手机号/编号在系统中不存在，将自动补建受试者；如提供<strong>姓名</strong>/<strong>受试者姓名</strong>、<strong>性别</strong>、<strong>年龄</strong>会一并带入。导入时<strong>SC号/RD号</strong>非空则直接使用。
            </p>
            <p className="text-xs text-amber-700 mb-4">
              手机号请填写<strong>完整号码</strong>，带星号脱敏的号码无法匹配或补建受试者。
            </p>
            <p className="text-sm text-blue-600 mb-4">
              <a
                href="https://china-norm.feishu.cn/wiki/U2MIwuRLliLjwNkEybrcdtmMnPf?from=from_copylink"
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                下载导入示例模板
              </a>
            </p>
            <div className="space-y-4">
              <div
                onDragOver={handleImportDragOver}
                onDragLeave={handleImportDragLeave}
                onDrop={handleImportDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  importDragOver
                    ? 'border-emerald-400 bg-emerald-50/80'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/50'
                }`}
              >
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-2 text-slate-600">
                    <Upload className="w-5 h-5" />
                    <span className="font-medium">
                      {importDragOver ? '松开即可导入' : '点击选择文件或拖拽文件到此处'}
                    </span>
                  </span>
                </label>
                <p className="text-xs text-slate-500 mt-2">支持 .xlsx、.xls、.csv</p>
                {importFile && (
                  <p className="text-sm text-emerald-700 mt-2 font-medium">{importFile.name}</p>
                )}
              </div>
              {importPreview.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {Object.keys(importPreview[0]).map((k) => (
                          <th key={k} className="px-3 py-2 text-left font-medium text-slate-600">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {Object.entries(row).map(([k, v]) => (
                            <td key={k} className="px-3 py-2 text-slate-700">{formatPreviewCell(k, v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500">
                    共 {importPreview.length} 条（仅预览前 10 条）
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImport(false)
                  setImportFile(null)
                  setImportPreview([])
                  setImportMeta(null)
                  setImportDragOver(false)
                }}
                className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={() => importMutation.mutate()}
                disabled={importPreview.length === 0 || importMutation.isPending}
                className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {importMutation.isPending ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 预约列表：默认显示当天，可切换月份并点击任意日期查看 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">预约列表</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSelectQueueDate(todayStr)}
                className="text-sm text-slate-600 hover:text-slate-800"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => {
                  void Promise.all([
                    todayQueueQuery.refetch(),
                    appointmentCalendarQuery.refetch(),
                  ])
                }}
                className="text-sm text-emerald-600 hover:underline"
              >
                刷新
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => handleChangeMonth(-1)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="上个月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-base font-semibold text-slate-800">{formatMonthLabel(visibleMonth)}</div>
              <button
                type="button"
                onClick={() => handleChangeMonth(1)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="下个月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-1 py-0.5 text-center text-[11px] font-medium text-slate-500">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="min-h-14 rounded-lg bg-transparent" />
                }

                const isSelected = cell.date === queueDate
                const isToday = cell.date === todayStr
                const total = appointmentCountMap.get(cell.date) ?? 0

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => handleSelectQueueDate(cell.date)}
                    className={`min-h-14 rounded-lg border px-2 py-1.5 text-left transition ${
                      isSelected
                        ? 'border-blue-300 bg-blue-100 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm font-semibold leading-none ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {cell.day}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                        total > 0
                          ? isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                        }`}>
                          {total}项
                        </span>
                        {isToday && (
                          <span className={`text-[10px] leading-none ${isSelected ? 'text-blue-700' : 'text-emerald-600'}`}>
                            今
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="text-sm text-slate-600 shrink-0">
            当前日期：{queueDate}
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 sm:min-w-0 sm:flex-1 sm:max-w-md sm:justify-end">
            <label htmlFor="queue-project-filter" className="text-xs font-medium text-slate-600 sm:shrink-0">
              项目编号
            </label>
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                id="queue-project-filter"
                type="text"
                value={queueProjectFilter}
                onChange={(e) => {
                  setQueueProjectFilter(e.target.value)
                  setQueueListPage(1)
                }}
                placeholder="筛选，留空为全部"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        {todayQueueQuery.data?.data?.items?.length ? (
          <>
            <div className="overflow-x-auto max-h-[min(70vh,36rem)] min-h-[20rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">项目编号</th>
                    <th
                      className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap"
                      title="接待台工单执行今日队列签到后按项目生成（如 V1 首次分配 SC）"
                    >
                      SC号
                    </th>
                    <th
                      className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap"
                      title="接待台工单执行侧维护，与入组情况关联"
                    >
                      RD号
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">受试者姓名</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">拼音首字母</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">姓名</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">年龄</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">性别</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">手机号</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">联络员</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[6rem]">备注</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">访视点</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">时间信息</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">状态</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">入组情况</th>
                  </tr>
                </thead>
                <tbody>
                  {todayQueueQuery.data.data.items.map((item, idx) => (
                    <tr key={item.appointment_id ?? `subj-${item.subject_id}-${item.checkin_id ?? idx}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{item.project_code?.trim() ? item.project_code : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.sc_number?.trim() ? item.sc_number : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.rd_number?.trim() ? item.rd_number : '—'}</td>
                      <td className="px-3 py-2">{item.subject_name || '—'}</td>
                      <td className="px-3 py-2">{item.name_pinyin_initials?.trim() ? item.name_pinyin_initials : '—'}</td>
                      <td className="px-3 py-2">{item.subject_name || '—'}</td>
                      <td className="px-3 py-2">{item.age != null ? item.age : '—'}</td>
                      <td className="px-3 py-2">{formatGenderCell(item.gender)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.phone?.trim() ? item.phone : '—'}</td>
                      <td className="px-3 py-2 max-w-[8rem] break-words">{item.liaison?.trim() ? item.liaison : '—'}</td>
                      <td className="px-3 py-2 max-w-[10rem] text-xs text-slate-600 break-words">{item.notes?.trim() ? item.notes : '—'}</td>
                      <td className="px-3 py-2">{item.visit_point || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="space-y-1 text-xs text-slate-600 min-w-28">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">预约</span>
                            <span>{formatDetailTime(item.appointment_time)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">签入</span>
                            <span>{formatDetailTime(item.checkin_time)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">签出</span>
                            <span>{formatDetailTime(item.checkout_time)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{item.status === 'waiting' ? '待签到' : item.status === 'checked_in' ? '已签到' : item.status === 'in_progress' ? '执行中' : item.status === 'checked_out' ? '已签出' : item.status === 'no_show' ? '缺席' : item.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.enrollment_status?.trim() ? item.enrollment_status : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const total = todayQueueQuery.data?.data?.total ?? 0
              const totalPages = Math.max(1, Math.ceil(total / queueListPageSize))
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200 text-sm text-slate-600">
                  <span>
                    共 {total} 条，每页 {queueListPageSize} 条
                    {totalPages > 1 ? `，第 ${queueListPage}/${totalPages} 页` : ''}
                  </span>
                  {totalPages > 1 ? (
                    <div className="flex gap-2">
                      <button type="button" disabled={queueListPage <= 1} onClick={() => setQueueListPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50">上一页</button>
                      <button type="button" disabled={queueListPage >= totalPages} onClick={() => setQueueListPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50">下一页</button>
                    </div>
                  ) : null}
                </div>
              )
            })()}
          </>
        ) : (
          <div className="p-6 text-center text-slate-500">
            <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>{queueDate} 暂无预约，新建或导入后将在此显示</p>
          </div>
        )}
      </div>
    </div>
  )
}
