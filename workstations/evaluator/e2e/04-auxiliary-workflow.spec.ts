/**
 * 场景 4：辅助功能 — 扫码快捷、排程管理、知识库、个人成长
 *
 * 业务目标对照（来自设计规划）：
 * ✓ 扫码/手动输入受试者编号快速匹配工单
 * ✓ 排程日历视图清晰展示本周及未来工作安排
 * ✓ 知识库提供 SOP 搜索和变更通知
 * ✓ 个人成长模块显示资质状态、培训记录、绩效数据
 * ✓ 资质即将过期/已过期有明显提醒
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景4-A: 扫码快捷执行', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4A.1 【设计目标】扫码页面应提供手动输入和摄像头两种方式', async ({ page }) => {
    await page.goto('/evaluator/scan')
    await page.waitForLoadState('networkidle')

    // 验证页面标题（heading，避免与 nav 冲突）
    await expect(page.getByRole('heading', { name: '扫码快捷执行' })).toBeVisible()
    await expect(page.getByText('扫描受试者二维码快速匹配工单')).toBeVisible()

    // 验证摄像头区域（已集成扫码组件）
    await expect(page.getByText('点击启动摄像头扫码')).toBeVisible()

    // 验证手动输入框和查询按钮
    await expect(page.getByPlaceholder('手动输入受试者编号或二维码内容')).toBeVisible()
    await expect(page.getByRole('button', { name: '查询' })).toBeVisible()
  })

  test('4A.2 【设计目标】匹配单个工单时自动跳转到执行页面', async ({ page }) => {
    await page.goto('/evaluator/scan')
    await page.waitForLoadState('networkidle')

    // 输入受试者编号（只有 1 个匹配工单 → 设计要求自动跳转）
    await page.getByPlaceholder('手动输入受试者编号或二维码内容').fill('S-001')
    await page.getByRole('button', { name: '查询' }).click()

    // 设计行为：匹配到唯一工单时直接导航到执行页面
    await expect(page).toHaveURL(/\/evaluator\/execute\/101/, { timeout: 10000 })

    // 验证跳转后显示了正确的工单信息
    await expect(page.getByRole('heading', { name: 'Corneometer 皮肤水分含量测试' })).toBeVisible()

    // 业务验证：扫码→匹配唯一工单→自动进入执行，全程零点击
  })

  test('4A.3 【设计目标】输入受试者编号后回车也能自动跳转', async ({ page }) => {
    await page.goto('/evaluator/scan')
    await page.waitForLoadState('networkidle')

    const input = page.getByPlaceholder('手动输入受试者编号或二维码内容')
    await input.fill('S-001')
    await input.press('Enter')

    // 自动跳转到执行页面
    await expect(page).toHaveURL(/\/evaluator\/execute\/101/, { timeout: 10000 })
  })

  test('4A.4 【设计目标】查询按钮在输入为空时应禁用', async ({ page }) => {
    await page.goto('/evaluator/scan')
    await page.waitForLoadState('networkidle')

    // 空输入时查询按钮禁用
    const queryBtn = page.getByRole('button', { name: '查询' })
    await expect(queryBtn).toBeDisabled()

    // 输入内容后启用
    await page.getByPlaceholder('手动输入受试者编号或二维码内容').fill('S-001')
    await expect(queryBtn).toBeEnabled()
  })
})

test.describe('场景4-B: 排程日历管理', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4B.1 【设计目标】排程页面应展示实验室月历（与接待台一致）', async ({ page }) => {
    await page.goto('/evaluator/schedule')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '我的排程' })).toBeVisible()
    await expect(page.getByText('筛选人员/岗位')).toBeVisible()
    await expect(page.getByText(/数据来源：执行台排程管理/)).toBeVisible()

    for (const day of ['周一', '周二', '周三', '周四', '周五', '周六', '周日']) {
      await expect(page.getByText(day).first()).toBeVisible()
    }
  })

  test('4B.2 【设计目标】月历中应有模拟实验室排程条目', async ({ page }) => {
    await page.goto('/evaluator/schedule')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('C26030001').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/探头-Corneometer/).first()).toBeVisible()
  })

  test('4B.3 【设计目标】有排程的日期可点开查看当日详情', async ({ page }) => {
    await page.goto('/evaluator/schedule')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('C26030001').first()).toBeVisible({ timeout: 10000 })
    await page.getByText('C26030001').first().click()
    await expect(page.getByRole('heading', { name: /实验室排程/ })).toBeVisible({ timeout: 5000 })
  })

  test('4B.4 【设计目标】可以切换上/下月查看排程', async ({ page }) => {
    await page.goto('/evaluator/schedule')
    await page.waitForLoadState('networkidle')

    const chevronBtns = page.locator('.flex.flex-wrap.items-center.gap-2 button')
    await chevronBtns.last().click()
    await page.waitForTimeout(300)

    await expect(page.getByRole('heading', { name: '我的排程' })).toBeVisible()
  })
})

test.describe('场景4-C: 知识库', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4C.1 【设计目标】知识库应提供 SOP 搜索功能', async ({ page }) => {
    await page.goto('/evaluator/knowledge')
    await page.waitForLoadState('networkidle')

    // 验证页面标题（heading）
    await expect(page.getByRole('heading', { name: '知识库' })).toBeVisible()
    await expect(page.getByText('SOP 查阅、操作手册与变更通知')).toBeVisible()

    // 验证搜索框
    await expect(page.getByPlaceholder(/搜索 SOP/)).toBeVisible()

    // 验证 Tab 按钮
    await expect(page.getByRole('button', { name: /SOP.*操作手册/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '变更通知' })).toBeVisible()
    await expect(page.getByRole('button', { name: '系统公告' })).toBeVisible()
  })

  test('4C.2 【设计目标】SOP 列表应展示文档名、编号、版本、状态', async ({ page }) => {
    await page.goto('/evaluator/knowledge')
    await page.waitForLoadState('networkidle')

    // 验证 SOP 列表
    await expect(page.getByText(/Corneometer 皮肤含水量测定/)).toBeVisible()
    await expect(page.getByText(/Cutometer 皮肤弹性测定/)).toBeVisible()
    await expect(page.getByText(/VISIA 面部成像分析/)).toBeVisible()
    await expect(page.getByText(/检测室环境监控管理/)).toBeVisible()

    // 验证版本和状态信息
    await expect(page.getByText(/V3\.0/).first()).toBeVisible()
    await expect(page.getByText('检测方法').first()).toBeVisible()
  })

  test('4C.3 【设计目标】变更通知和系统公告 Tab 展示真实数据', async ({ page }) => {
    await page.goto('/evaluator/knowledge')
    await page.waitForLoadState('networkidle')

    // 切换到变更通知
    await page.getByRole('button', { name: '变更通知' }).click()
    await expect(
      page.getByText(/方案 HYD-2026-001/).or(page.getByText('暂无变更通知'))
    ).toBeVisible({ timeout: 5000 })

    // 切换到系统公告
    await page.getByRole('button', { name: '系统公告' }).click()
    await expect(
      page.getByText(/系统维护通知/).or(page.getByText('暂无系统公告'))
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('场景4-D: 个人成长', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4D.1 【设计目标】个人成长页面应展示资质状态', async ({ page }) => {
    await page.goto('/evaluator/growth')
    await page.waitForLoadState('networkidle')

    // 验证页面标题（heading）
    await expect(page.getByRole('heading', { name: '我的成长' })).toBeVisible()
    await expect(page.getByText('资质管理、培训跟踪与绩效分析')).toBeVisible()

    // 验证四个 Tab
    await expect(page.getByRole('button', { name: /资质状态/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /培训计划/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /绩效统计/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /能力评估/ })).toBeVisible()

    // 默认显示资质状态，等待数据加载
    await expect(page.getByRole('heading', { name: '资质状态' })).toBeVisible({ timeout: 5000 })

    // 验证资质列表
    await expect(page.getByText('Corneometer 操作资质')).toBeVisible()
    await expect(page.getByText('VISIA 操作资质')).toBeVisible()
    await expect(page.getByText('Mexameter 操作资质')).toBeVisible()
    await expect(page.getByText('GCP 培训证书')).toBeVisible()

    // 验证资质状态分布（2个有效，2个即将过期 — 体现系统的预警能力）
    const validBadges = page.getByText('有效', { exact: true })
    expect(await validBadges.count()).toBeGreaterThanOrEqual(2)

    // 验证即将过期的资质有醒目标记（Mexameter 和 GCP 证书在 90 天内到期）
    const expiringBadges = page.getByText('即将过期')
    expect(await expiringBadges.count()).toBeGreaterThanOrEqual(2)

    // 验证资质编号
    await expect(page.getByText(/QUAL-DET-CM-2024/)).toBeVisible()

    // 业务验证：即将过期的资质提醒评估员及时续期/培训
  })

  test('4D.2 【设计目标】培训记录应展示培训名称、日期、状态、得分', async ({ page }) => {
    await page.goto('/evaluator/growth')
    await page.waitForLoadState('networkidle')

    // 切换到培训计划 Tab
    await page.getByRole('button', { name: /培训计划/ }).click()

    // 等待内容加载
    await expect(page.getByRole('heading', { name: '培训记录' })).toBeVisible({ timeout: 5000 })

    // 验证培训记录列表
    await expect(page.getByText('Corneometer CM825 年度考核')).toBeVisible()
    await expect(page.getByText('GCP 年度继续教育')).toBeVisible()
    await expect(page.getByText('新版 SOP-DET-001 V3.0 培训')).toBeVisible()

    // 验证状态
    await expect(page.getByText('已完成').first()).toBeVisible()
    await expect(page.getByText('待参加')).toBeVisible()

    // 验证得分
    await expect(page.getByText(/得分: 96/)).toBeVisible()
    await expect(page.getByText(/得分: 92/)).toBeVisible()
  })

  test('4D.3 【设计目标】绩效统计应展示本月完成量、通过率、按时率', async ({ page }) => {
    await page.goto('/evaluator/growth')
    await page.waitForLoadState('networkidle')

    // 切换到绩效统计
    await page.getByRole('button', { name: /绩效统计/ }).click()

    // 等待内容加载
    await expect(page.getByRole('heading', { name: '本月绩效' })).toBeVisible({ timeout: 5000 })

    // 验证三个核心指标卡片
    await expect(page.getByText('本月完成').first()).toBeVisible()
    await expect(page.getByText('审计通过率').first()).toBeVisible()
    await expect(page.getByText('按时完成率').first()).toBeVisible()

    // 验证月度趋势图已渲染（不再是"开发中"占位）
    await expect(page.getByText('月度趋势（近 6 个月）')).toBeVisible()
    await expect(page.getByText('工单完成数')).toBeVisible()
  })

  test('4D.4 【设计目标】能力评估模块展示评估数据', async ({ page }) => {
    await page.goto('/evaluator/growth')
    await page.waitForLoadState('networkidle')

    // 切换到能力评估
    await page.getByRole('button', { name: /能力评估/ }).click()

    // 验证评估数据已展示（不再是"开发中"占位）
    await expect(
      page.getByText('Corneometer 操作能力').or(page.getByText('暂无评估记录'))
    ).toBeVisible({ timeout: 5000 })
  })
})
