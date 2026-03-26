/** 双签名单行高亮排查：仅在开发构建输出，控制台过滤「WitnessStaffListFocus」 */

const PREFIX = '[WitnessStaffListFocus]'

export function witnessStaffFocusLog(phase: string, payload?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  if (payload && Object.keys(payload).length > 0) {
    console.debug(PREFIX, phase, payload)
  } else {
    console.debug(PREFIX, phase)
  }
}
