/**
 * 唇部脱屑识别工具
 *
 * 功能复刻自 Function Development/Lip scaliness/lip_flaky_tool/
 * 后端 API: /api/v1/lip-scaliness/
 *
 * 功能：
 * - 单张图片识别：上传 → 识别 → 查看蓝色标注 + 对比图 + 脱屑占比
 * - 批量处理：多张上传 → 逐一识别 → 汇总表格 → ZIP/CSV 下载
 * - 内置编辑器：橡皮擦手动修正误识别区域，撤销/重做，缩放平移，保存前确认对比
 * - 人工修正记录：保存后标记为已人工修正，批量结果显示修正状态
 * - 修正记录下载：管理员可下载含「是否人工修正」列的完整 CSV
 */
import { useState, useRef, useEffect } from 'react'
import {
  Upload,
  Play,
  X,
  Download,
  Edit3,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  ArrowLeft,
  FileText,
  Image,
  Layers,
  ShieldCheck,
} from 'lucide-react'
import { useFeishuContext } from '@cn-kis/feishu-sdk'

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface ProcessResult {
  blue_b64: string
  comp_b64: string
  orig_b64: string
  peeling_pct: number
  filename: string
}

interface BatchRow extends ProcessResult {
  ok: boolean
  error?: string
  manuallyEdited?: boolean
  editedAt?: string
}

type TabType = 'single' | 'batch'
type ViewMode = 'overlay' | 'blue' | 'original'

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function severityLabel(pct: number): { label: string; color: string } {
  if (pct < 2) return { label: '轻度', color: '#16a34a' }
  if (pct < 5) return { label: '中度', color: '#d97706' }
  return { label: '重度', color: '#dc2626' }
}

function toDataUrl(b64: string): string {
  return `data:image/jpeg;base64,${b64}`
}

function nowStr(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

// ─── 编辑器 Modal ─────────────────────────────────────────────────────────────

interface EditorState {
  open: boolean
  filename: string
  blueUrl: string
  compUrl: string
  origUrl: string
  pctBefore: number
  resultIdx: number  // -1 = single, >=0 = batch index
}

interface ConfirmState {
  open: boolean
  beforeUrl: string
  afterUrl: string
  overlayUrl: string
  pctBefore: number
  pctAfter: number
  newBlueUrl: string
}

const EDITOR_INITIAL: EditorState = {
  open: false,
  filename: '',
  blueUrl: '',
  compUrl: '',
  origUrl: '',
  pctBefore: 0,
  resultIdx: -1,
}

const CONFIRM_INITIAL: ConfirmState = {
  open: false,
  beforeUrl: '',
  afterUrl: '',
  overlayUrl: '',
  pctBefore: 0,
  pctAfter: 0,
  newBlueUrl: '',
}

// ─── 编辑器组件 ───────────────────────────────────────────────────────────────

interface EditorProps {
  state: EditorState
  onClose: () => void
  onSave: (newBlueUrl: string, pct: number) => void
}

function ImageEditor({ state, onClose, onSave }: EditorProps) {
  const canvasBgRef = useRef<HTMLCanvasElement>(null)
  const canvasEditRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  type ToolMode = 'eraser' | 'brush'
  const [view, setView] = useState<ViewMode>('overlay')
  const [toolMode, setToolMode] = useState<ToolMode>('eraser')
  const [eraserSize, setEraserSize] = useState(30)
  const [brushSize, setBrushSize] = useState(20)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [currentPct, setCurrentPct] = useState(state.pctBefore)
  const [hasEdits, setHasEdits] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_INITIAL)
  const [historyStack, setHistoryStack] = useState<ImageData[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null)
  const painting = useRef(false)
  const needHistory = useRef(false)

  // 载入图像
  useEffect(() => {
    if (!state.open) return
    setView('overlay')
    setHasEdits(false)
    setCurrentPct(state.pctBefore)
    const img = new window.Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      setImgSize({ w, h })
      const bgCanvas = canvasBgRef.current
      const editCanvas = canvasEditRef.current
      if (!bgCanvas || !editCanvas) return
      bgCanvas.width = w
      bgCanvas.height = h
      editCanvas.width = w
      editCanvas.height = h
      const ctx = editCanvas.getContext('2d')!
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      const initData = ctx.getImageData(0, 0, w, h)
      setHistoryStack([initData])
      setHistIdx(0)
      fitZoom(w, h)
    }
    img.src = state.blueUrl
  }, [state.open, state.blueUrl])

  // 渲染背景
  useEffect(() => {
    renderBg()
  }, [view, imgSize])

  function renderBg() {
    const bgCanvas = canvasBgRef.current
    const editCanvas = canvasEditRef.current
    if (!bgCanvas || !editCanvas || !imgSize.w) return
    const ctx = bgCanvas.getContext('2d')!
    if (view === 'blue') {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height)
      editCanvas.style.opacity = '1'
      editCanvas.style.pointerEvents = 'auto'
      return
    }
    const url = state.origUrl || state.compUrl
    if (!url) return
    const img = new window.Image()
    img.onload = () => {
      ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height)
      if (state.origUrl) {
        ctx.drawImage(img, 0, 0, bgCanvas.width, bgCanvas.height)
      } else {
        ctx.drawImage(img, 0, 0, img.naturalWidth / 2, img.naturalHeight,
          0, 0, bgCanvas.width, bgCanvas.height)
      }
      editCanvas.style.opacity = view === 'overlay' ? '0.72' : '0'
      editCanvas.style.pointerEvents = view === 'overlay' ? 'auto' : 'none'
    }
    img.src = url
  }

  function fitZoom(w?: number, h?: number) {
    const bodyEl = document.getElementById('editor-body-inner')
    if (!bodyEl) return
    const bw = bodyEl.clientWidth - 40
    const bh = bodyEl.clientHeight - 40
    const iw = w || imgSize.w
    const ih = h || imgSize.h
    if (!iw || !ih) return
    const s = Math.min(bw / (iw * 2 + 12), bh / ih, 1)
    setScale(s)
    setPan({ x: 0, y: 0 })
  }

  function clientToCanvas(clientX: number, clientY: number) {
    const r = canvasEditRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale }
  }

  function paint(cx: number, cy: number) {
    const editCanvas = canvasEditRef.current
    if (!editCanvas) return
    const ctx = editCanvas.getContext('2d')!
    const size = toolMode === 'eraser' ? eraserSize : brushSize
    ctx.save()
    if (toolMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(cx, cy, size, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.fill()
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgba(0, 80, 255, 1)'
      const numBlobs = Math.max(4, Math.floor((size * size) / 18))
      for (let i = 0; i < numBlobs; i++) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * size * 0.9
        const bx = cx + Math.cos(angle) * r
        const by = cy + Math.sin(angle) * r
        const bw = 1.5 + Math.random() * 5
        const bh = bw * (0.4 + Math.random() * 0.8)
        const rot = Math.random() * Math.PI
        ctx.beginPath()
        ctx.ellipse(bx, by, bw, bh, rot, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  function recalcPct(): number {
    const editCanvas = canvasEditRef.current
    if (!editCanvas) return 0
    const ctx = editCanvas.getContext('2d')!
    const d = ctx.getImageData(0, 0, imgSize.w, imgSize.h).data
    let blue = 0
    const total = imgSize.w * imgSize.h
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 50 && d[i + 1] < 150 && d[i + 2] > 150 && d[i + 3] > 10) blue++
    }
    return +((blue / total) * 100).toFixed(2)
  }

  function pushHistory() {
    const editCanvas = canvasEditRef.current
    if (!editCanvas) return
    const ctx = editCanvas.getContext('2d')!
    const snap = ctx.getImageData(0, 0, imgSize.w, imgSize.h)
    setHistoryStack(prev => {
      const next = prev.slice(0, histIdx + 1)
      next.push(snap)
      if (next.length > 50) next.shift()
      setHistIdx(next.length - 1)
      return next
    })
  }

  function undo() {
    if (histIdx <= 0) return
    const newIdx = histIdx - 1
    const editCanvas = canvasEditRef.current
    if (!editCanvas) return
    editCanvas.getContext('2d')!.putImageData(historyStack[newIdx], 0, 0)
    setHistIdx(newIdx)
    setHasEdits(true)
    setCurrentPct(recalcPct())
  }

  function redo() {
    if (histIdx >= historyStack.length - 1) return
    const newIdx = histIdx + 1
    const editCanvas = canvasEditRef.current
    if (!editCanvas) return
    editCanvas.getContext('2d')!.putImageData(historyStack[newIdx], 0, 0)
    setHistIdx(newIdx)
    setHasEdits(true)
    setCurrentPct(recalcPct())
  }

  function reset() {
    if (!window.confirm('确定还原为原始识别结果吗？所有手动编辑将丢失。')) return
    const img = new window.Image()
    img.onload = () => {
      const editCanvas = canvasEditRef.current
      if (!editCanvas) return
      const ctx = editCanvas.getContext('2d')!
      ctx.clearRect(0, 0, imgSize.w, imgSize.h)
      ctx.drawImage(img, 0, 0)
      const initData = ctx.getImageData(0, 0, imgSize.w, imgSize.h)
      setHistoryStack([initData])
      setHistIdx(0)
      setHasEdits(false)
      setCurrentPct(state.pctBefore)
    }
    img.src = state.blueUrl
  }

  function handleSave() {
    const editCanvas = canvasEditRef.current
    const bgCanvas = canvasBgRef.current
    if (!editCanvas || !bgCanvas) return

    // 蓝色标注图（黑底）
    const offBlue = document.createElement('canvas')
    offBlue.width = imgSize.w
    offBlue.height = imgSize.h
    const octx = offBlue.getContext('2d')!
    octx.fillStyle = '#000'
    octx.fillRect(0, 0, imgSize.w, imgSize.h)
    octx.drawImage(editCanvas, 0, 0)
    const newBlueUrl = offBlue.toDataURL('image/jpeg', 0.95)

    // 叠加效果图
    const offOvl = document.createElement('canvas')
    offOvl.width = imgSize.w
    offOvl.height = imgSize.h
    const octx2 = offOvl.getContext('2d')!
    const bgSnap = bgCanvas.toDataURL('image/jpeg', 0.9)
    const bgImg = new window.Image()
    bgImg.onload = () => {
      octx2.drawImage(bgImg, 0, 0, imgSize.w, imgSize.h)
      octx2.globalAlpha = 0.72
      octx2.drawImage(editCanvas, 0, 0)
      octx2.globalAlpha = 1
      const overlayUrl = offOvl.toDataURL('image/jpeg', 0.92)
      const pctAfter = recalcPct()
      setConfirm({
        open: true,
        beforeUrl: state.blueUrl,
        afterUrl: newBlueUrl,
        overlayUrl,
        pctBefore: state.pctBefore,
        pctAfter,
        newBlueUrl,
      })
    }
    bgImg.src = bgSnap
  }

  // 确认后只保存到结果，不触发下载
  function doSave() {
    onSave(confirm.newBlueUrl, confirm.pctAfter)
    setConfirm(CONFIRM_INITIAL)
  }

  // 键盘快捷键
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!state.open) return
      if (e.code === 'Space') { setSpaceDown(true); e.preventDefault() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo() }
      if (!e.ctrlKey && !e.metaKey && e.key === 'e') setToolMode('eraser')
      if (!e.ctrlKey && !e.metaKey && e.key === 'b') setToolMode('brush')
    }
    function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [state.open, histIdx, historyStack])

  if (!state.open) return null

  const delta = (confirm.pctAfter - confirm.pctBefore).toFixed(2)

  return (
    <>
      {/* 编辑器主体 */}
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
        {/* 工具栏 */}
        <div className="flex-shrink-0 h-14 bg-slate-800 border-b border-slate-700 flex items-center gap-2 px-4 flex-wrap">
          <span className="text-slate-100 font-semibold text-sm truncate max-w-48">{state.filename}</span>
          <div className="w-px h-6 bg-slate-600 mx-1" />

          <div className="w-px h-6 bg-slate-600 mx-1" />

          {/* 工具切换 */}
          <button
            onClick={() => setToolMode('eraser')}
            title="橡皮擦：清除误标注区域（快捷键 E）"
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              toolMode === 'eraser' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🧹 橡皮擦
          </button>
          <button
            onClick={() => setToolMode('brush')}
            title="画笔：手动增加脱屑标注（快捷键 B）"
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              toolMode === 'brush' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🖊 画笔
          </button>
          <span className="text-slate-400 text-xs">{toolMode === 'eraser' ? '橡皮擦' : '画笔'}大小</span>
          <input
            type="range" min={5} max={120}
            value={toolMode === 'eraser' ? eraserSize : brushSize}
            onChange={e => toolMode === 'eraser' ? setEraserSize(+e.target.value) : setBrushSize(+e.target.value)}
            className="w-20 accent-blue-500"
          />
          <span className="text-slate-100 text-xs font-bold w-7">
            {toolMode === 'eraser' ? eraserSize : brushSize}px
          </span>
          <div className="w-px h-6 bg-slate-600 mx-1" />

          {/* 撤销/重做/重置 */}
          <button onClick={undo} disabled={histIdx <= 0} title="撤销 Ctrl+Z"
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40">
            <RotateCcw className="w-3 h-3" />撤销
          </button>
          <button onClick={redo} disabled={histIdx >= historyStack.length - 1} title="重做 Ctrl+Y"
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40">
            <RotateCw className="w-3 h-3" />重做
          </button>
          <button onClick={reset}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600">
            🔄 重置
          </button>
          <div className="w-px h-6 bg-slate-600 mx-1" />

          {/* 缩放 */}
          <button onClick={() => setScale(s => Math.max(s - 0.2, 0.1))}
            className="w-7 h-7 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center justify-center">
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="text-slate-400 text-xs w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(s + 0.2, 8))}
            className="w-7 h-7 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center justify-center">
            <ZoomIn className="w-3 h-3" />
          </button>
          <button onClick={() => fitZoom()}
            className="w-7 h-7 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center justify-center" title="适应窗口">
            <Maximize2 className="w-3 h-3" />
          </button>
          <div className="w-px h-6 bg-slate-600 mx-1" />

          {/* 保存/关闭 */}
          <button onClick={handleSave}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-green-600 text-white hover:bg-green-700 font-medium">
            <Save className="w-3 h-3" />保存修正
          </button>
          <button onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-red-600 text-white hover:bg-red-700 font-medium ml-auto">
            <X className="w-3 h-3" />关闭
          </button>
        </div>

        {/* 画布区域 */}
        <div
          id="editor-body-inner"
          className="flex-1 overflow-hidden relative bg-slate-950"
          onWheel={e => {
            e.preventDefault()
            setScale(s => Math.min(Math.max(s + (e.deltaY > 0 ? -0.12 : 0.12), 0.1), 8))
          }}
          onMouseDown={e => {
            if (spaceDown) setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
          }}
          onMouseMove={e => {
            if (spaceDown && panStart) setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
          }}
          onMouseUp={() => setPanStart(null)}
        >
          <div
            ref={wrapRef}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginLeft: imgSize.w ? -((imgSize.w * 2 + 12) / 2) : 0,
              marginTop: imgSize.h ? -(imgSize.h / 2) : 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              userSelect: 'none',
            }}
          >
            {/* 左侧：原图参考（只读） */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                position: 'absolute', top: -22, left: 0,
                color: '#94a3b8', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                background: 'rgba(15,23,42,0.85)', padding: '2px 8px', borderRadius: 4,
              }}>
                原图（参考）
              </div>
              {state.origUrl && imgSize.w > 0 && (
                <img
                  src={state.origUrl}
                  style={{ display: 'block', width: imgSize.w, height: imgSize.h, borderRadius: 4 }}
                  draggable={false}
                />
              )}
            </div>

            {/* 右侧：蓝色叠加（可编辑） */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                position: 'absolute', top: -22, left: 0,
                color: '#60a5fa', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                background: 'rgba(15,23,42,0.85)', padding: '2px 8px', borderRadius: 4,
              }}>
                蓝色叠加（可编辑）
              </div>
            <canvas ref={canvasBgRef} style={{ display: 'block', borderRadius: 4 }} />
            <canvas
              ref={canvasEditRef}
              style={{ position: 'absolute', top: 0, left: 0, borderRadius: 4, opacity: 0.85, cursor: spaceDown ? 'grab' : toolMode === 'brush' ? 'cell' : 'crosshair' }}
              onMouseDown={e => {
                if (spaceDown) return
                e.preventDefault()
                painting.current = true
                needHistory.current = true
                const { x, y } = clientToCanvas(e.clientX, e.clientY)
                paint(x, y)
              }}
              onMouseMove={e => {
                if (!painting.current) return
                const { x, y } = clientToCanvas(e.clientX, e.clientY)
                paint(x, y)
              }}
              onMouseUp={() => {
                if (!painting.current) return
                painting.current = false
                if (needHistory.current) {
                  pushHistory()
                  needHistory.current = false
                  setHasEdits(true)
                  setCurrentPct(recalcPct())
                }
              }}
              onMouseLeave={() => {
                if (!painting.current) return
                painting.current = false
                if (needHistory.current) {
                  pushHistory()
                  needHistory.current = false
                  setHasEdits(true)
                  setCurrentPct(recalcPct())
                }
              }}
            />
            </div>{/* 右侧面板结束 */}
          </div>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-800/90 text-slate-400 text-xs px-3 py-1.5 rounded pointer-events-none whitespace-nowrap">
            🖱 滚轮缩放 · 空格拖动 · {toolMode === 'eraser' ? '🧹 橡皮擦清除标注（E）' : '🖊 画笔新增蓝色标注（B）'}
          </div>
        </div>

        {/* 状态栏 */}
        <div className="flex-shrink-0 h-8 bg-slate-950 border-t border-slate-800 flex items-center gap-4 px-4 text-xs text-slate-500">
          <span>脱屑占比：<span className="text-blue-400 font-semibold">{currentPct}%</span></span>
          {hasEdits && <span className="text-amber-500">⚠ 已手动编辑（未保存）</span>}
          <span className="text-slate-600">|</span>
          <span>当前工具：<span className={toolMode === 'brush' ? 'text-orange-400 font-semibold' : 'text-slate-300 font-semibold'}>{toolMode === 'eraser' ? '🧹 橡皮擦' : '🖊 画笔'}</span></span>
          <span className="ml-auto">E 橡皮擦 · B 画笔 · Ctrl+Z 撤销 · Ctrl+Y 重做 · 滚轮缩放</span>
        </div>
      </div>

      {/* 确认保存 Modal */}
      {confirm.open && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-7 shadow-2xl">
            <h2 className="text-lg font-bold mb-1">📋 确认人工修正</h2>
            <p className="text-sm text-slate-500 mb-5">请检查修改效果，确认无误后保存。保存后将标记为「已人工修正」并返回批量结果页面。</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="border rounded-xl overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold bg-slate-50 border-b">🔵 修改前（原始识别）</div>
                <img src={confirm.beforeUrl} alt="修改前" className="w-full block" />
              </div>
              <div className="border rounded-xl overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold bg-green-50 border-b text-green-700">✏️ 修改后</div>
                <img src={confirm.afterUrl} alt="修改后" className="w-full block" />
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden mb-5">
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b bg-slate-50">修改后叠加效果（原图 + 标注）</div>
              <img src={confirm.overlayUrl} alt="叠加效果" className="w-full block" />
            </div>

            <div className="flex gap-3 mb-6 flex-wrap">
              <div className="flex-1 min-w-28 bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-600 font-medium">修改前脱屑占比</div>
                <div className="text-2xl font-bold text-blue-600">{confirm.pctBefore}%</div>
              </div>
              <div className={`flex-1 min-w-28 rounded-xl p-3 text-center border ${
                confirm.pctAfter < confirm.pctBefore
                  ? 'bg-green-50 border-green-200 text-green-600'
                  : 'bg-amber-50 border-amber-200 text-amber-600'
              }`}>
                <div className="text-xs font-medium">修改后脱屑占比</div>
                <div className="text-2xl font-bold">{confirm.pctAfter}%</div>
              </div>
              <div className={`flex-1 min-w-28 rounded-xl p-3 text-center border ${
                +delta < 0
                  ? 'bg-green-50 border-green-200 text-green-600'
                  : 'bg-amber-50 border-amber-200 text-amber-600'
              }`}>
                <div className="text-xs font-medium">变化量</div>
                <div className="text-2xl font-bold">{+delta > 0 ? '+' : ''}{delta}%</div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm(CONFIRM_INITIAL)}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-slate-50">
                <ArrowLeft className="w-4 h-4" />返回继续编辑
              </button>
              <button onClick={doSave}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                <Save className="w-4 h-4" />确认保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export default function LipScalinessPage() {
  const ctx = useFeishuContext()
  const isAdmin = ctx.isAdmin

  const [tab, setTab] = useState<TabType>('single')

  // 单张模式
  const [singleFile, setSingleFile] = useState<File | null>(null)
  const [singleLoading, setSingleLoading] = useState(false)
  const [singleResult, setSingleResult] = useState<ProcessResult | null>(null)

  // 批量模式
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchLabel, setBatchLabel] = useState('')
  const [batchResults, setBatchResults] = useState<BatchRow[]>([])

  // 编辑器
  const [editor, setEditor] = useState<EditorState>(EDITOR_INITIAL)

  // 拖拽
  const [dragOverSingle, setDragOverSingle] = useState(false)
  const [dragOverBatch, setDragOverBatch] = useState(false)

  // ── 单张处理 ────────────────────────────────────────────────────────────────

  async function runSingle() {
    if (!singleFile) return
    setSingleLoading(true)
    setSingleResult(null)
    try {
      const fd = new FormData()
      fd.append('file', singleFile)
      const res = await fetch('/api/v1/lip-scaliness/process', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.code !== 0) {
        alert(`识别失败：${json.msg || '未知错误'}`)
        return
      }
      setSingleResult(json.data)
    } catch {
      alert('请求失败，请检查后端服务是否运行')
    } finally {
      setSingleLoading(false)
    }
  }

  // ── 批量处理 ────────────────────────────────────────────────────────────────

  async function runBatch() {
    if (!batchFiles.length) return
    setBatchRunning(true)
    setBatchResults([])
    const rows: BatchRow[] = []
    for (let i = 0; i < batchFiles.length; i++) {
      const f = batchFiles[i]
      setBatchProgress(Math.round((i / batchFiles.length) * 100))
      setBatchLabel(`处理中 ${i + 1}/${batchFiles.length}：${f.name}`)
      const fd = new FormData()
      fd.append('file', f)
      try {
        const res = await fetch('/api/v1/lip-scaliness/process', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.code !== 0) {
          rows.push({ filename: f.name, ok: false, error: json.msg || '识别失败', blue_b64: '', comp_b64: '', orig_b64: '', peeling_pct: 0, manuallyEdited: false })
        } else {
          rows.push({ ...json.data, ok: true, manuallyEdited: false })
        }
      } catch {
        rows.push({ filename: f.name, ok: false, error: '网络错误', blue_b64: '', comp_b64: '', orig_b64: '', peeling_pct: 0, manuallyEdited: false })
      }
      setBatchResults([...rows])
    }
    setBatchProgress(100)
    setBatchLabel(`全部完成！共 ${batchFiles.length} 张`)
    setBatchRunning(false)
  }

  function downloadCSV() {
    const ok = batchResults.filter(r => r.ok)
    let csv = '文件名,脱屑面积占比(%),是否人工修正,修正时间\n'
    ok.forEach(r => {
      csv += `${r.filename},${r.peeling_pct},${r.manuallyEdited ? '是' : '否'},${r.manuallyEdited ? (r.editedAt || '') : ''}\n`
    })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'report.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // 修正记录下载（仅管理员）：仅包含已人工修正的行
  function downloadCorrectionReport() {
    const corrected = batchResults.filter(r => r.ok && r.manuallyEdited)
    if (!corrected.length) { alert('当前批次中没有人工修正记录'); return }
    let csv = '文件名,修正后脱屑占比(%),是否人工修正,修正时间\n'
    corrected.forEach(r => {
      csv += `${r.filename},${r.peeling_pct},是,${r.editedAt || ''}\n`
    })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `correction_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadZip() {
    if (!batchFiles.length) return
    const fd = new FormData()
    batchFiles.forEach(f => fd.append('files', f))
    const res = await fetch('/api/v1/lip-scaliness/batch', { method: 'POST', body: fd })
    if (!res.ok) { alert('打包失败'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'lip_flaky_results.zip'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── 编辑器回调 ──────────────────────────────────────────────────────────────

  function openEditor(r: ProcessResult, idx: number) {
    setEditor({
      open: true,
      filename: r.filename,
      blueUrl: toDataUrl(r.blue_b64),
      compUrl: toDataUrl(r.comp_b64),
      origUrl: toDataUrl(r.orig_b64),
      pctBefore: r.peeling_pct,
      resultIdx: idx,
    })
  }

  function handleEditorSave(newBlueUrl: string, pct: number) {
    const idx = editor.resultIdx
    if (idx === -1 && singleResult) {
      setSingleResult({ ...singleResult, blue_b64: newBlueUrl.split(',')[1], peeling_pct: pct })
    } else if (idx >= 0) {
      setBatchResults(prev => prev.map((r, i) =>
        i === idx
          ? { ...r, blue_b64: newBlueUrl.split(',')[1], peeling_pct: pct, manuallyEdited: true, editedAt: nowStr() }
          : r
      ))
    }
    setEditor(EDITOR_INITIAL)
    // 保存完成后切到批量结果页
    if (tab !== 'batch' && idx >= 0) setTab('batch')
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  const okBatch = batchResults.filter(r => r.ok)
  const avgPct = okBatch.length
    ? (okBatch.reduce((s, r) => s + r.peeling_pct, 0) / okBatch.length).toFixed(2)
    : '—'
  const editedCount = batchResults.filter(r => r.ok && r.manuallyEdited).length

  return (
    <div className="flex flex-col h-full">
      {/* 页头 */}
      <div className="px-6 pt-6 pb-3 flex-shrink-0">
        <h2 className="text-xl font-bold text-slate-800">唇部脱屑标记分析</h2>
        <p className="mt-1 text-sm text-slate-500">
          上传标准正面唇部照片，自动识别脱屑区域并计算面积占比，支持人工修正标注
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit mb-6">
          {(['single', 'batch'] as TabType[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'single' ? '单张处理' : '批量处理'}
            </button>
          ))}
        </div>

        {/* 单张处理 */}
        {tab === 'single' && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-500" />上传图片
              </h3>
              <label
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-10 cursor-pointer transition-all ${
                  dragOverSingle
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverSingle(true) }}
                onDragLeave={() => setDragOverSingle(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOverSingle(false)
                  const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
                  if (f) setSingleFile(f)
                }}
              >
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setSingleFile(f) }} />
                <div className="text-4xl mb-3">🖼️</div>
                <p className="font-medium text-slate-700">
                  {singleFile ? singleFile.name : '点击选择图片，或拖拽到此处'}
                </p>
                <p className="text-sm text-slate-400 mt-1">支持 JPG / PNG / BMP，建议使用标准正面唇部照片</p>
              </label>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={runSingle}
                  disabled={!singleFile || singleLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  {singleLoading ? '识别中…' : '开始识别'}
                </button>
                <button
                  onClick={() => { setSingleFile(null); setSingleResult(null) }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium hover:bg-slate-50"
                >
                  <X className="w-4 h-4" />清除
                </button>
              </div>
              {singleLoading && (
                <div className="mt-4">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">识别中，请稍候…</p>
                </div>
              )}
            </div>

            {singleResult && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h3 className="font-semibold text-slate-800 mb-4">
                  📊 识别结果 — {singleResult.filename}
                </h3>
                <div className="flex gap-4 mb-5 flex-wrap">
                  <div className="flex-1 min-w-36 bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-blue-600">脱屑面积占比</div>
                    <div className="text-3xl font-bold text-blue-600 leading-snug">
                      {singleResult.peeling_pct}<span className="text-base font-normal"> %</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-36 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="text-xs font-medium" style={{ color: severityLabel(singleResult.peeling_pct).color }}>
                      脱屑程度
                    </div>
                    <div className="text-2xl font-bold leading-snug" style={{ color: severityLabel(singleResult.peeling_pct).color }}>
                      {severityLabel(singleResult.peeling_pct).label}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">&lt;2% 轻度 · 2–5% 中度 · &gt;5% 重度</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b flex items-center justify-between">
                      <span className="text-sm font-medium">蓝色标注图（黑底）</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditor(singleResult, -1)}
                          className="flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-100"
                        >
                          <Edit3 className="w-3 h-3" />人工修正
                        </button>
                        <a
                          href={toDataUrl(singleResult.blue_b64)}
                          download={singleResult.filename.replace(/\.[^.]+$/, '') + '_flaky_blue.jpg'}
                          className="flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-100"
                        >
                          <Download className="w-3 h-3" />下载
                        </a>
                      </div>
                    </div>
                    <img
                      src={toDataUrl(singleResult.blue_b64)}
                      alt="脱屑标注"
                      className="w-full block cursor-zoom-in"
                      onClick={() => openEditor(singleResult, -1)}
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b flex items-center justify-between">
                      <span className="text-sm font-medium">对比图（原图 + 叠加）</span>
                      <a
                        href={toDataUrl(singleResult.comp_b64)}
                        download={singleResult.filename.replace(/\.[^.]+$/, '') + '_comparison.jpg'}
                        className="flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-100"
                      >
                        <Download className="w-3 h-3" />下载
                      </a>
                    </div>
                    <img
                      src={toDataUrl(singleResult.comp_b64)}
                      alt="对比图"
                      className="w-full block cursor-zoom-in"
                      onClick={() => openEditor(singleResult, -1)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 批量处理 */}
        {tab === 'batch' && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-500" />上传多张图片
              </h3>
              <label
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-10 cursor-pointer transition-all ${
                  dragOverBatch
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverBatch(true) }}
                onDragLeave={() => setDragOverBatch(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOverBatch(false)
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
                  setBatchFiles(prev => {
                    const existing = new Set(prev.map(f => f.name))
                    return [...prev, ...files.filter(f => !existing.has(f.name))]
                  })
                }}
              >
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || [])
                    setBatchFiles(prev => {
                      const existing = new Set(prev.map(f => f.name))
                      return [...prev, ...files.filter(f => !existing.has(f.name))]
                    })
                  }}
                />
                <div className="text-4xl mb-3">📁</div>
                <p className="font-medium text-slate-700">点击选择多张图片，或拖拽到此处</p>
                <p className="text-sm text-slate-400 mt-1">可一次选中多张，支持 JPG / PNG / BMP</p>
              </label>

              {/* 文件标签列表 */}
              {batchFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {batchFiles.map((f, i) => (
                    <span key={f.name} className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1 rounded-full">
                      🖼️ {f.name}
                      <button onClick={() => setBatchFiles(prev => prev.filter((_, j) => j !== i))}
                        className="ml-1 hover:text-red-500">✕</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={runBatch}
                  disabled={!batchFiles.length || batchRunning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  {batchRunning ? '处理中…' : '开始批量处理'}
                </button>
                <button
                  onClick={() => { setBatchFiles([]); setBatchResults([]) }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium hover:bg-slate-50"
                >
                  <X className="w-4 h-4" />清除
                </button>
              </div>

              {(batchRunning || batchProgress > 0) && (
                <div className="mt-4">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{batchLabel}</p>
                </div>
              )}
            </div>

            {batchResults.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      📋 批量结果
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {okBatch.length}/{batchResults.length} 成功 · 平均脱屑 {avgPct}%
                      </span>
                    </h3>
                    {editedCount > 0 && (
                      <p className="mt-0.5 text-xs text-amber-600 flex items-center gap-1">
                        <Edit3 className="w-3 h-3" />
                        {editedCount} 张已人工修正
                      </p>
                    )}
                  </div>
                  {!batchRunning && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={downloadZip}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                        <Download className="w-4 h-4" />下载全部 (ZIP)
                      </button>
                      <button onClick={downloadCSV}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-slate-50">
                        <FileText className="w-4 h-4" />下载报告 (CSV)
                      </button>
                      {/* 修正记录下载：仅管理员可见 */}
                      {isAdmin && (
                        <button
                          onClick={downloadCorrectionReport}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100"
                          title="仅管理员可见：下载包含人工修正记录的 CSV"
                        >
                          <ShieldCheck className="w-4 h-4" />修正记录下载
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2.5 font-semibold border-b-2 border-slate-200">文件名</th>
                        <th className="text-left px-3 py-2.5 font-semibold border-b-2 border-slate-200">状态</th>
                        <th className="text-left px-3 py-2.5 font-semibold border-b-2 border-slate-200">脱屑占比</th>
                        <th className="text-left px-3 py-2.5 font-semibold border-b-2 border-slate-200">人工修正</th>
                        <th className="text-left px-3 py-2.5 font-semibold border-b-2 border-slate-200">预览</th>
                        <th className="text-left px-3 py-2.5 font-semibold border-b-2 border-slate-200">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResults.map((r, idx) => (
                        <tr key={idx} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors ${r.manuallyEdited ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-3 py-2.5 text-slate-700">{r.filename}</td>
                          <td className="px-3 py-2.5">
                            {r.ok
                              ? <span className="text-green-600 font-semibold">✓ 完成</span>
                              : <span className="text-red-600 font-semibold">✕ {r.error}</span>
                            }
                          </td>
                          <td className="px-3 py-2.5">
                            {r.ok && (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.min(r.peeling_pct * 6, 100)}%` }} />
                                </div>
                                <span>{r.peeling_pct}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.ok && (
                              r.manuallyEdited
                                ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                                      <Edit3 className="w-3 h-3" />已修正
                                    </span>
                                    {r.editedAt && <div className="text-xs text-slate-400 mt-0.5">{r.editedAt}</div>}
                                  </div>
                                )
                                : <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.ok && (
                              <div className="flex gap-2">
                                <img src={toDataUrl(r.blue_b64)} alt="蓝色标注"
                                  className="w-12 h-8 object-cover rounded border cursor-pointer hover:ring-2 hover:ring-blue-400"
                                  onClick={() => openEditor(r, idx)} />
                                <img src={toDataUrl(r.comp_b64)} alt="对比图"
                                  className="w-12 h-8 object-cover rounded border cursor-pointer hover:ring-2 hover:ring-blue-400"
                                  onClick={() => openEditor(r, idx)} />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.ok && (
                              <button
                                onClick={() => openEditor(r, idx)}
                                className="flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-slate-100"
                              >
                                <Edit3 className="w-3 h-3" />人工修正
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑器 Modal */}
      <ImageEditor
        state={editor}
        onClose={() => setEditor(EDITOR_INITIAL)}
        onSave={handleEditorSave}
      />
    </div>
  )
}
