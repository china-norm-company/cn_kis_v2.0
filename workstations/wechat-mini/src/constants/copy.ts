/**
 * 仅引用 subject-core 的 copy 子模块，避免从主入口拉取整包（易在微信侧触发初始化/分包异常）。
 * 研究台列名对齐：noAdverseLabel 覆盖为「是否发生任何不良情况」。
 */
import { PAGE_COPY as basePageCopy } from '@cn-kis/subject-core/constants/copy'

const diary = basePageCopy.diary ?? {}

export const PAGE_COPY = {
  ...basePageCopy,
  diary: {
    ...diary,
    noAdverseLabel: '是否发生任何不良情况',
  },
}
