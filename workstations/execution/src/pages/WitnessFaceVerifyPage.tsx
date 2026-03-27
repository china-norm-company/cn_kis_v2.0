import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { setExecutionPostLoginHashForOAuth } from '@cn-kis/feishu-sdk'
import { protocolApi } from '@cn-kis/api-client'
import { Button } from '@cn-kis/ui-kit'
import { CheckCircle2, Pen, ShieldCheck } from 'lucide-react'
import WitnessStaffInlineSignaturePad, {
  exportSignatureCanvasPng,
  type WitnessStaffSignaturePadHandle,
} from '../components/WitnessStaffInlineSignaturePad'
import { persistConsentListFocusProtocolId } from '../utils/consentListFocusStorage'
import { persistWitnessStaffListFocusId } from '../utils/witnessStaffListFocusStorage'
import { witnessStaffFocusLog } from '../utils/witnessStaffListFocusDebug'

const POLL_MS = 3000

type IdentityProviderState = {
  sdk_ready?: boolean
  h5_config_id_set?: boolean
  sub_ak_set?: boolean
  sub_sk_set?: boolean
  role_trn_set?: boolean
  callback_token_set?: boolean
}

/**
 * 邮件链路：
 * - project：人脸 → 项目签名授权（无档案签名时本页内嵌手写板）→ 同意/拒绝 → 结束
 * - profile：人脸 → 档案手写签名登记 → 结束
 */
type MailFlowStep =
  | 'loading'
  | 'face'
  /** 联调 WITNESS_FACE_DEV_BYPASS：模拟核验成功后、进入授权/签名前的中间页 */
  | 'face_completed'
  | 'authorize'
  | 'signature_register'
  | 'done_profile'
  | 'done_agreed'
  | 'done_refused'

function formatIdentityProviderGap(st: IdentityProviderState | null | undefined): string | null {
  if (!st || st.sdk_ready) return null
  const miss: string[] = []
  if (!st.sub_ak_set || !st.sub_sk_set) miss.push('VOLC_SUB_ACCESSKEY、VOLC_SUB_SECRETKEY')
  if (!st.role_trn_set) miss.push('VOLC_CERT_ROLE_TRN')
  if (!st.h5_config_id_set) miss.push('IDENTITY_VERIFY_H5_CONFIG_ID')
  if (miss.length === 0) {
    return '火山实名依赖的配置项已填写，但 SDK 仍判定未就绪（可检查子账号权限、STS 与网络）。'
  }
  return `管理员需在运行后端的机器上配置：${miss.join('、')}（与小程序实名 L2 相同）。可将仓库内 deploy/.env.volcengine.plan-a.example 复制为 deploy/.env.volcengine.plan-a 并填入火山控制台真实值，重启 Django。`
}

/**
 * 邮件链接「立即进行授权」：
 * 1）火山引擎 H5 人脸核身（公开页，无登录态）
 * 2）人脸通过后展示「授权申请」：同意/拒绝本项目使用签名信息
 * 3）知情签署测试不在此页进行：须前往执行台知情管理 → 扫「知情测试」二维码 → 微信内按节点完成（与正式端一致）
 */
export default function WitnessFaceVerifyPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [witnessFaceDevBypass, setWitnessFaceDevBypass] = useState(false)
  const [mailStep, setMailStep] = useState<MailFlowStep>('loading')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [idCard, setIdCard] = useState('')
  const [phone, setPhone] = useState('')
  const [idPhoneReadOnly, setIdPhoneReadOnly] = useState(false)
  const [legacyPlaceholder, setLegacyPlaceholder] = useState(false)
  const [identityProviderState, setIdentityProviderState] = useState<IdentityProviderState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [phase, setPhase] = useState<'form' | 'polling'>('form')
  const [protocolCode, setProtocolCode] = useState('')
  const [protocolTitle, setProtocolTitle] = useState('')
  /** project 邮件：用于知情管理列表深链高亮 `#/consent?focusProtocolId=` */
  const [resolvedProtocolId, setResolvedProtocolId] = useState<number | null>(null)
  /** profile / project 邮件：双签名单深链 `#/consent/witness-staff?focusWitnessStaffId=` */
  const [resolvedWitnessStaffId, setResolvedWitnessStaffId] = useState<number | null>(null)
  /** 档案/项目邮件目标邮箱（resolve 返回 ws.email）；仅 @china-norm.com 展示完成后的执行台快捷跳转 */
  const [witnessTargetEmail, setWitnessTargetEmail] = useState('')
  /** project 邮件：双签档案是否已上传手写签名（同意授权前置条件） */
  const [hasStaffSignature, setHasStaffSignature] = useState(false)
  const [signatureRefreshBusy, setSignatureRefreshBusy] = useState(false)
  /** resolve 返回：profile=名单核验邮件；project=项目授权邮件 */
  const [tokenScope, setTokenScope] = useState<'profile' | 'project'>('project')
  const [registerSubmitting, setRegisterSubmitting] = useState(false)
  const sigPadRef = useRef<WitnessStaffSignaturePadHandle | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const allowExecutionQuickLinks = useMemo(
    () => witnessTargetEmail.trim().toLowerCase().endsWith('@china-norm.com'),
    [witnessTargetEmail],
  )

  const forceNavigateByHash = useCallback((hashPath: string) => {
    if (typeof window === 'undefined') return
    const base = import.meta.env.BASE_URL || '/execution/'
    const normalized = hashPath.startsWith('#') ? hashPath : `#${hashPath}`
    const url = `${window.location.origin}${base}${normalized}`
    if (import.meta.env.DEV) {
      console.error('[WitnessVerifyNav]', 'fallback location.assign', {
        url,
        currentHref: window.location.href,
        currentHash: window.location.hash,
      })
    }
    window.location.assign(url)
  }, [])

  /** 写入下次飞书 OAuth 的 state，换票后回 localhost 也能恢复列表深链（避免 127.0.0.1 与 localhost 不同源丢 sessionStorage） */
  useEffect(() => {
    if (mailStep !== 'done_agreed' || resolvedProtocolId == null || !allowExecutionQuickLinks) return
    setExecutionPostLoginHashForOAuth(`#/consent?focusProtocolId=${resolvedProtocolId}`)
  }, [mailStep, resolvedProtocolId, allowExecutionQuickLinks])

  useEffect(() => {
    if (mailStep !== 'done_profile' || resolvedWitnessStaffId == null || !allowExecutionQuickLinks) return
    setExecutionPostLoginHashForOAuth(`#/consent/witness-staff?focusWitnessStaffId=${resolvedWitnessStaffId}`)
  }, [mailStep, resolvedWitnessStaffId, allowExecutionQuickLinks])

  /**
   * 公开核验页不在 AppLayout 内：仅用 react-router navigate 切到知情/双签时，未登录态下父级只渲染 loginFallback、不挂 Outlet，
   * Hash 偶发仍停在 #/witness-verify，OAuth 换票后无法恢复深链。改为与邮件 `<a>` 一致用 location.assign 同步浏览器 hash。
   */
  const goToConsentManagement = useCallback(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      console.error('[WitnessVerifyNav]', 'click goToConsentManagement', {
        resolvedProtocolId,
        href: window.location.href,
        hash: window.location.hash,
      })
    }
    if (resolvedProtocolId != null) {
      persistConsentListFocusProtocolId(resolvedProtocolId)
      const targetHash = `#/consent?focusProtocolId=${resolvedProtocolId}`
      setExecutionPostLoginHashForOAuth(targetHash)
      witnessStaffFocusLog('nav→知情管理(项目)', { resolvedProtocolId })
      forceNavigateByHash(targetHash)
    } else {
      const targetHash = '#/consent'
      setExecutionPostLoginHashForOAuth(targetHash)
      forceNavigateByHash(targetHash)
    }
  }, [resolvedProtocolId, forceNavigateByHash])

  const goToWitnessStaffList = useCallback(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      console.error('[WitnessVerifyNav]', 'click goToWitnessStaffList', {
        resolvedWitnessStaffId,
        href: window.location.href,
        hash: window.location.hash,
      })
    }
    if (resolvedWitnessStaffId != null) {
      persistWitnessStaffListFocusId(resolvedWitnessStaffId)
      const targetHash = `#/consent/witness-staff?focusWitnessStaffId=${resolvedWitnessStaffId}`
      setExecutionPostLoginHashForOAuth(targetHash)
      witnessStaffFocusLog('nav→双签名单', { resolvedWitnessStaffId })
      forceNavigateByHash(targetHash)
    } else {
      const targetHash = '#/consent/witness-staff'
      setExecutionPostLoginHashForOAuth(targetHash)
      forceNavigateByHash(targetHash)
    }
  }, [resolvedWitnessStaffId, forceNavigateByHash])

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPoll()
  }, [])

  const applyResolveData = useCallback(
    (d: {
      name?: string
      id_card_no?: string
      phone?: string
      has_id_card_and_phone?: boolean
      identity_provider_state?: IdentityProviderState
      witness_face_dev_bypass?: boolean
      face_verification_effective?: boolean
      legacy_placeholder_face_record?: boolean
      protocol_code?: string
      protocol_title?: string
      protocol_id?: number | null
      signature_auth_decision?: string | null
      staff_signature_on_file?: boolean
      token_scope?: 'profile' | 'project'
      staff_signature_registered?: boolean
      witness_staff_id?: number
      email?: string
    }) => {
      setWitnessFaceDevBypass(!!d.witness_face_dev_bypass)
      setWitnessTargetEmail(String(d.email ?? '').trim())
      setIdentityProviderState(d.identity_provider_state ?? null)
      setName(String(d.name || ''))
      setIdCard(String(d.id_card_no || ''))
      setPhone(String(d.phone || ''))
      const locked =
        typeof d.has_id_card_and_phone === 'boolean'
          ? d.has_id_card_and_phone
          : !!(String(d.id_card_no || '').trim() && String(d.phone || '').trim())
      setIdPhoneReadOnly(locked)
      const effective = !!d.face_verification_effective
      setLegacyPlaceholder(!!d.legacy_placeholder_face_record)
      setProtocolCode(String(d.protocol_code || '').trim())
      setProtocolTitle(String(d.protocol_title || '').trim())
      setResolvedProtocolId(
        d.protocol_id != null && Number(d.protocol_id) > 0 ? Number(d.protocol_id) : null,
      )
      const wsId =
        d.witness_staff_id != null && Number(d.witness_staff_id) > 0 ? Number(d.witness_staff_id) : null
      setResolvedWitnessStaffId(wsId)
      witnessStaffFocusLog('resolve→state', {
        token_scope: d.token_scope,
        witness_staff_id_raw: d.witness_staff_id,
        resolvedWitnessStaffId: wsId,
      })

      const scope: 'profile' | 'project' = d.token_scope === 'profile' ? 'profile' : 'project'
      setTokenScope(scope)

      if (scope === 'profile') {
        setHasStaffSignature(false)
        const reg = !!d.staff_signature_registered
        if (effective) {
          if (reg) setMailStep('done_profile')
          else setMailStep('signature_register')
        } else {
          setMailStep('face')
        }
        return
      }

      setHasStaffSignature(!!d.staff_signature_on_file)
      const sig = (d.signature_auth_decision || '').trim().toLowerCase()
      if (effective) {
        if (sig === 'agreed') {
          setMailStep('done_agreed')
        } else if (sig === 'refused') {
          setMailStep('done_refused')
        } else {
          setMailStep('authorize')
        }
      } else {
        setMailStep('face')
      }
    },
    [],
  )

  const loadToken = useCallback(async () => {
    if (!token.trim()) {
      setErr('缺少授权参数，请从邮件链接重新打开')
      setMailStep('face')
      return
    }
    try {
      const res = await protocolApi.resolveWitnessAuthToken(token)
      const d = res.data
      if (d && typeof d === 'object' && 'name' in d) {
        const raw = d as {
          face_verification_effective?: boolean
          identity_verified?: boolean
          face_verified_at?: string | null
        }
        const effective =
          typeof raw.face_verification_effective === 'boolean'
            ? raw.face_verification_effective
            : !!(raw.identity_verified && raw.face_verified_at)
        applyResolveData({
          ...d,
          face_verification_effective: !!effective,
        })
      } else {
        setErr('无法解析授权信息')
        setMailStep('face')
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { msg?: string } }; message?: string }
      setErr(ax.response?.data?.msg || ax.message || '链接无效或已过期')
      setMailStep('face')
    }
  }, [token, applyResolveData])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setErr(null)
      setMailStep('loading')
      await loadToken()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadToken])

  const canStart = useMemo(() => {
    if (!token.trim()) return false
    if (idPhoneReadOnly) return true
    return idCard.trim().length > 0 && phone.trim().length > 0
  }, [token, idPhoneReadOnly, idCard, phone])

  const pollOnce = async () => {
    try {
      const res = await protocolApi.getWitnessFaceVerificationResult(token)
      const d = res.data
      if (!d || typeof d !== 'object') return
      if (d.status === 'verified') {
        stopPoll()
        setPhase('form')
        setErr(null)
        await loadToken()
        return
      }
      if (d.status === 'failed') {
        stopPoll()
        setPhase('form')
        setErr(d.msg || '核验未通过或链接已失效')
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { msg?: string } }; message?: string }
      setErr(ax.response?.data?.msg || ax.message || '查询失败')
    }
  }

  const onStartFace = async () => {
    if (!token || !canStart) return
    setSubmitting(true)
    setErr(null)
    try {
      const res = await protocolApi.startWitnessFaceVerification({
        token,
        ...(idPhoneReadOnly
          ? {}
          : {
              id_card_no: idCard.trim(),
              phone: phone.trim(),
            }),
      })
      const d = res.data
      if (res.code !== 200 || !d || typeof d !== 'object') {
        setErr(res.msg || '发起失败')
        return
      }
      if (d.already_verified) {
        await loadToken()
        return
      }
      if (d.dev_bypass) {
        setPhase('form')
        setErr(null)
        setMailStep('face_completed')
        return
      }
      const url = d.verify_url?.trim()
      if (!url) {
        setErr('未返回核验地址，请稍后重试')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      setPhase('polling')
      stopPoll()
      pollRef.current = setInterval(() => void pollOnce(), POLL_MS)
      void pollOnce()
    } catch (e: unknown) {
      const ax = e as {
        response?: {
          data?: {
            msg?: string
            code?: number
            data?: IdentityProviderState
          }
        }
        message?: string
      }
      const code = ax.response?.data?.code
      const msg = ax.response?.data?.msg
      const diag = ax.response?.data?.data
      if (diag && typeof diag === 'object') setIdentityProviderState(diag)
      const gap = formatIdentityProviderGap(diag)
      if (code === 503) {
        setErr([msg || '实名核身服务不可用', gap].filter(Boolean).join(' '))
      } else {
        setErr(msg || ax.message || '发起失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const continueAfterFaceDevComplete = async () => {
    if (!token.trim()) return
    setLoading(true)
    setErr(null)
    try {
      await loadToken()
    } finally {
      setLoading(false)
    }
  }

  const onSubmitStaffSignature = async () => {
    if (!token.trim()) return
    const canvas = sigPadRef.current?.getCanvas() ?? null
    const dataUrl = exportSignatureCanvasPng(canvas)
    if (!dataUrl) {
      setErr('请先手写签名')
      return
    }
    setRegisterSubmitting(true)
    setErr(null)
    try {
      const res = await protocolApi.registerWitnessStaffSignature({ token, image_base64: dataUrl })
      if (res.code !== 200) {
        setErr(res.msg || '提交失败')
        return
      }
      await loadToken()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { msg?: string } }; message?: string }
      setErr(ax.response?.data?.msg || ax.message || '提交失败')
    } finally {
      setRegisterSubmitting(false)
    }
  }

  const onAuthorize = async (decision: 'agree' | 'refuse') => {
    if (!token.trim()) return
    if (decision === 'agree' && !hasStaffSignature) {
      setErr('请先完成手写签名登记')
      return
    }
    setAuthSubmitting(true)
    setErr(null)
    try {
      const res = await protocolApi.witnessSignatureAuthorize({ token, decision })
      if (res.code !== 200) {
        setErr(res.msg || '提交失败')
        return
      }
      if (decision === 'agree') {
        setMailStep('done_agreed')
      } else {
        setMailStep('done_refused')
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { msg?: string } }; message?: string }
      setErr(ax.response?.data?.msg || ax.message || '提交失败')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const fieldClass = (readOnly: boolean) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-800 ${
      readOnly
        ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
        : 'border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'
    }`

  const showFaceBlock = mailStep === 'face' && !loading
  const faceSubline =
    tokenScope === 'profile'
      ? '请确认身份信息后完成人脸核验，随后进行手写签名登记'
      : '请确认身份信息后进入火山引擎在线人脸核验'

  const refreshSignatureStatus = async () => {
    if (!token.trim()) return
    setSignatureRefreshBusy(true)
    setErr(null)
    try {
      await loadToken()
    } finally {
      setSignatureRefreshBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-8 px-4 pb-12">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
        {mailStep === 'authorize' ? (
          <div className="flex items-center justify-center gap-2 text-slate-800 mb-1">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <h1 className="text-lg font-semibold">授权申请</h1>
          </div>
        ) : mailStep === 'signature_register' ? (
          <div className="flex items-center justify-center gap-2 text-slate-800 mb-1">
            <Pen className="w-6 h-6 text-indigo-600" />
            <h1 className="text-lg font-semibold">手写签名登记</h1>
          </div>
        ) : mailStep === 'done_profile' ? (
          <div className="flex items-center justify-center gap-2 text-slate-800 mb-1">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h1 className="text-lg font-semibold">登记完成</h1>
          </div>
        ) : mailStep === 'face_completed' ? (
          <div className="flex items-center justify-center gap-2 text-slate-800 mb-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <h1 className="text-lg font-semibold">人脸核验完成</h1>
          </div>
        ) : mailStep === 'done_agreed' || mailStep === 'done_refused' ? null : (
          <>
            <div className="flex items-center justify-center gap-2 text-slate-800 mb-1">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
              <h1 className="text-lg font-semibold">人脸识别</h1>
            </div>
          </>
        )}

        {mailStep !== 'authorize' &&
        mailStep !== 'done_agreed' &&
        mailStep !== 'done_refused' &&
        mailStep !== 'signature_register' &&
        mailStep !== 'done_profile' &&
        mailStep !== 'face_completed' ? (
          <p className="text-center text-sm text-slate-500 mb-6">{faceSubline}</p>
        ) : mailStep === 'face_completed' ? (
          <p className="text-center text-sm text-slate-500 mb-6">
            {tokenScope === 'profile'
              ? '本地联调已模拟完成人脸核验。点击下方进入手写签名登记。'
              : '本地联调已模拟完成人脸核验。点击下方进入项目签名授权。'}
          </p>
        ) : mailStep === 'authorize' ? (
          <p className="text-center text-sm text-slate-500 mb-6">请确认是否同意本项目使用您的签名信息</p>
        ) : mailStep === 'signature_register' ? (
          <p className="text-center text-sm text-slate-500 mb-6">请在下方手写区域内签名，提交后将同步至双签工作人员名单</p>
        ) : mailStep === 'done_profile' ? (
          <p className="text-center text-sm text-slate-500 mb-6">您的签名已保存至档案，可关闭本页</p>
        ) : null}

        {loading ? (
          <p className="text-center text-slate-400 text-sm">加载中…</p>
        ) : mailStep === 'authorize' ? (
          <div className="space-y-5">
            <p className="text-sm text-slate-700 leading-relaxed">
              同意授权后，以下项目将使用您的签名信息：
            </p>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm space-y-2">
              <div>
                <span className="text-slate-500">项目编号：</span>
                <span className="text-slate-900 font-medium">{protocolCode || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">项目名称：</span>
                <span className="text-slate-900">{protocolTitle || '—'}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              说明：此步骤仅确认<strong>签名授权</strong>。知情文档的阅读、勾选与签署测试请在执行台「知情管理」扫描
              <strong> 知情测试二维码 </strong>
              后，在微信内按节点顺序完成（与受试者正式端一致），请勿与本页混淆。
            </p>
            {!hasStaffSignature ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 space-y-3">
                <div className="space-y-1">
                  <p className="font-medium">尚未登记手写签名</p>
                  <p className="text-[13px] leading-relaxed text-amber-950/95">
                    同意授权前须先完成手写签名。请在下方书写，提交后将同步至双签工作人员名单。
                  </p>
                </div>
                <WitnessStaffInlineSignaturePad ref={sigPadRef} disabled={registerSubmitting} busy={registerSubmitting} />
                <Button
                  variant="primary"
                  className="w-full h-11"
                  disabled={registerSubmitting}
                  onClick={() => void onSubmitStaffSignature()}
                >
                  {registerSubmitting ? '提交中…' : '提交签名'}
                </Button>
                <p className="text-[11px] text-amber-900/85 leading-relaxed">
                  若已在执行台「双签工作人员名单」中登记，可
                  <button
                    type="button"
                    disabled={signatureRefreshBusy}
                    onClick={() => void refreshSignatureStatus()}
                    className="font-medium text-indigo-700 hover:underline disabled:opacity-50 mx-0.5"
                  >
                    {signatureRefreshBusy ? '刷新中…' : '刷新签名状态'}
                  </button>
                  后再同意授权。
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-sm text-emerald-900">
                手写签名已登记，请确认是否同意本项目使用您的签名信息。
              </div>
            )}
            {err ? (
              <div className="rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-sm p-3">{err}</div>
            ) : null}
            <div className="flex flex-col gap-3 pt-1">
              <button
                type="button"
                disabled={authSubmitting || !hasStaffSignature}
                onClick={() => void onAuthorize('agree')}
                className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium py-3.5 hover:bg-indigo-700 disabled:opacity-50"
              >
                {authSubmitting ? '提交中…' : '同意授权'}
              </button>
              <button
                type="button"
                disabled={authSubmitting}
                onClick={() => void onAuthorize('refuse')}
                className="w-full rounded-xl bg-rose-600 text-white text-sm font-medium py-3.5 hover:bg-rose-700 disabled:opacity-50"
              >
                拒绝授权
              </button>
            </div>
          </div>
        ) : mailStep === 'signature_register' ? (
          <div className="space-y-4">
            {err ? (
              <div className="rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-sm p-3">{err}</div>
            ) : null}
            <WitnessStaffInlineSignaturePad ref={sigPadRef} disabled={registerSubmitting} busy={registerSubmitting} />
            <Button
              variant="primary"
              className="w-full h-11"
              disabled={registerSubmitting}
              onClick={() => void onSubmitStaffSignature()}
            >
              {registerSubmitting ? '提交中…' : '提交签名'}
            </Button>
          </div>
        ) : mailStep === 'done_profile' ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 text-sm p-4 text-center">
              <p className="font-medium">手写签名已保存</p>
              <p className="mt-2 leading-relaxed">执行台「双签工作人员名单」中将展示签名图片与登记时间。</p>
            </div>
            {allowExecutionQuickLinks ? (
              <>
                <button
                  type="button"
                  onClick={() => void goToWitnessStaffList()}
                  className="block w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  打开双签工作人员名单
                </button>
                <p className="text-center text-[11px] leading-relaxed text-slate-500">
                  请使用已登录维周·执行台账号的浏览器打开；若未立即看到最新签名，请在该页使用刷新。
                </p>
              </>
            ) : null}
          </div>
        ) : mailStep === 'done_agreed' ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 text-sm p-4 text-center">
              <p className="font-medium">授权已确认</p>
              <p className="mt-2 leading-relaxed">
                本项目可在合规流程中使用您的签名信息。项目侧「知情配置状态」与工作人员认证签名结果，请在执行台
                <strong> 知情管理 </strong>
                的<strong> 项目列表 </strong>
                中查看（含「认证签名」「知情配置状态」等列）。
              </p>
            </div>
            {allowExecutionQuickLinks ? (
              <>
                <button
                  type="button"
                  onClick={() => void goToConsentManagement()}
                  className="block w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {resolvedProtocolId != null ? '打开知情管理（定位到本项目）' : '打开知情管理'}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-slate-500">
                  请使用已登录维周·执行台账号的浏览器打开；若未登录，请先登录后再从侧栏进入「知情管理」。
                </p>
              </>
            ) : null}
          </div>
        ) : mailStep === 'done_refused' ? (
          <div className="rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-sm p-4 text-center">
            您已拒绝授权，本项目将无法使用您的签名信息。可关闭本页。
          </div>
        ) : mailStep === 'face_completed' ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-950 text-sm p-4">
              <p className="font-medium">联调：已写入人脸核验结果</p>
              <p className="mt-2 text-[13px] leading-relaxed text-emerald-900/90">
                未调用火山引擎真实核身。正式环境请关闭 <code className="text-xs bg-white/80 px-1 rounded">WITNESS_FACE_DEV_BYPASS</code>
                并完成真实核验。
              </p>
            </div>
            {err ? (
              <div className="rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-sm p-3">{err}</div>
            ) : null}
            <Button
              variant="primary"
              className="w-full h-11"
              disabled={loading}
              onClick={() => void continueAfterFaceDevComplete()}
            >
              {loading ? '加载中…' : tokenScope === 'profile' ? '进入手写签名登记' : '进入项目签名授权'}
            </Button>
          </div>
        ) : showFaceBlock ? (
          <>
            {err ? (
              <div className="mb-4 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-sm p-3">{err}</div>
            ) : null}
            {legacyPlaceholder ? (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 text-amber-900 text-sm p-3">
                检测到此前为系统<strong>占位流程</strong>记录，尚未完成真实人脸核验。请点击下方「开始人脸核验」完成火山引擎在线核身。
              </div>
            ) : null}
            {witnessFaceDevBypass ? (
              <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-950 text-sm p-3">
                <strong className="font-medium">联调模式：</strong>
                已开启 WITNESS_FACE_DEV_BYPASS，点击「开始人脸核验（联调）」将<strong>跳过火山</strong>
                ，先进入<strong>人脸核验完成</strong>页，再进入
                {tokenScope === 'profile' ? (
                  <strong>手写签名登记</strong>
                ) : (
                  <strong>项目签名授权</strong>
                )}
                。
                {tokenScope === 'project' ? (
                  <> 知情签署测试请使用执行台知情管理中的<strong>扫码</strong>入口。</>
                ) : null}
              </div>
            ) : null}
            {formatIdentityProviderGap(identityProviderState) ? (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-sm p-3">
                <strong className="font-medium">实名服务未就绪：</strong>
                {formatIdentityProviderGap(identityProviderState)}
              </div>
            ) : null}
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-500">姓名</span>
                <input readOnly value={name} className={fieldClass(true)} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">身份证</span>
                <input
                  readOnly={idPhoneReadOnly}
                  value={idCard}
                  onChange={(e) => {
                    setErr(null)
                    setIdCard(e.target.value)
                  }}
                  placeholder={idPhoneReadOnly ? '' : '请输入身份证号'}
                  autoComplete="off"
                  className={fieldClass(idPhoneReadOnly)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">手机号</span>
                <input
                  readOnly={idPhoneReadOnly}
                  value={phone}
                  onChange={(e) => {
                    setErr(null)
                    setPhone(e.target.value)
                  }}
                  placeholder={idPhoneReadOnly ? '' : '请输入11位手机号'}
                  inputMode="numeric"
                  autoComplete="tel"
                  className={fieldClass(idPhoneReadOnly)}
                />
              </label>
            </div>
            {!idPhoneReadOnly && !err ? (
              <p className="text-[11px] text-amber-700 mt-2">
                系统档案中暂无身份证或手机号，请本人填写；提交核身后将保存至执行台双签工作人员档案。
              </p>
            ) : null}

            {phase === 'polling' ? (
              <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-900 text-sm p-4">
                已在新窗口打开核验页面。请按页面提示完成身份证与人脸核验，完成后回到本页将自动进入<strong>签名授权</strong>步骤（也可手动刷新）。
              </div>
            ) : null}

            <Button
              variant="primary"
              className="w-full mt-6 h-11"
              disabled={submitting || !token || !canStart || phase === 'polling'}
              onClick={() => void onStartFace()}
            >
              {submitting
                ? '正在发起…'
                : phase === 'polling'
                  ? '核验进行中…'
                  : witnessFaceDevBypass
                    ? '开始人脸核验（联调）'
                    : '开始人脸核验'}
            </Button>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-4">
              说明：在线实名用于保障试验过程合规；人脸核身由火山引擎提供（与受试者小程序实名 L2
              相同服务）。本机构不单独留存您在核身页采集的面部图像，个人信息按最小必要原则处理。
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
