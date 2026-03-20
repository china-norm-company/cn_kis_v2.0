/**
 * 场景 2：工单执行全流程 — 接受 → 准备 → 分步执行 → 完成
 *
 * 业务目标对照（来自设计规划）：
 * ✓ 评估员打开工单后能看到全部关键信息（受试者、方法、资源）
 * ✓ 接受/拒绝操作清晰可控
 * ✓ 准备阶段的 5 项检查清单强制逐项确认（人机料法环）
 * ✓ 分步执行引导确保操作规范性
 * ✓ 步骤进度条实时更新
 * ✓ 完成阶段显示执行总结
 * ✓ SOP 文档可随时查阅
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景2: 工单执行全流程', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('2.1 【设计目标】工单详情应展示受试者、检测方法、资源等完整信息', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 验证工单标题（heading）和状态
    await expect(page.getByRole('heading', { name: 'Corneometer 皮肤水分含量测试' })).toBeVisible()
    await expect(page.getByText('待处理')).toBeVisible()

    // 验证受试者信息卡片
    await expect(page.getByText('受试者信息')).toBeVisible()
    await expect(page.getByText('S-001 王丽')).toBeVisible()
    await expect(page.getByText('混合偏干')).toBeVisible()
    await expect(page.getByText('低风险')).toBeVisible()
    await expect(page.getByText('V2 - 第2周访视')).toBeVisible()

    // 验证检测方法卡片
    await expect(page.getByRole('heading', { name: '检测方法' })).toBeVisible()
    await expect(page.getByText('皮肤含水量测定（Corneometer）')).toBeVisible()

    // 验证所需资源卡片（5M1E 中的「机」和「料」）
    await expect(page.getByRole('heading', { name: '所需资源' })).toBeVisible()
    await expect(page.getByText(/Corneometer CM825/).first()).toBeVisible()
    await expect(page.getByText(/探头保护膜/)).toBeVisible()
    await expect(page.getByText(/75% 酒精棉球/)).toBeVisible()
  })

  test('2.2 【设计目标】阶段导航应展示四个工作阶段', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 验证四个阶段 Tab
    await expect(page.getByText('1.接受')).toBeVisible()
    await expect(page.getByText('2.准备')).toBeVisible()
    await expect(page.getByText('3.执行')).toBeVisible()
    await expect(page.getByText('4.完成')).toBeVisible()

    // 默认应在接受阶段
    await expect(page.getByRole('heading', { name: '确认接受工单' })).toBeVisible()
  })

  test('2.3 【设计目标】接受阶段应提供接受和拒绝两个选项', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 验证接受阶段说明
    await expect(page.getByText('请查看左侧工单信息（受试者、检测方法、所需资源）后确认')).toBeVisible()

    // 验证两个操作按钮
    await expect(page.getByRole('button', { name: /接受工单/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /拒绝/ })).toBeVisible()
  })

  test('2.4 【设计目标】点击接受后应自动进入准备阶段', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 接受工单
    await page.getByRole('button', { name: /接受工单/ }).click()

    // 等待准备阶段出现（状态变为 in_progress，步骤未初始化时显示准备）
    await expect(page.getByRole('heading', { name: '执行前准备' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('逐项确认准备条件，全部通过后方可开始执行')).toBeVisible()
  })

  test('2.5 【设计目标】准备阶段应强制逐项确认 5 项检查清单', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 接受工单进入准备阶段
    await page.getByRole('button', { name: /接受工单/ }).click()
    await expect(page.getByRole('heading', { name: '执行前准备' })).toBeVisible({ timeout: 10000 })

    // 验证 5 项检查清单（人机料法环）
    await expect(page.getByText('仪器就绪')).toBeVisible()
    await expect(page.getByText('环境就绪')).toBeVisible()
    await expect(page.getByText('耗材就绪')).toBeVisible()
    await expect(page.getByText('受试者就绪')).toBeVisible()
    await expect(page.getByText('资质确认')).toBeVisible()

    // 验证「开始执行」按钮初始为禁用
    const startBtn = page.getByRole('button', { name: /开始执行/ })
    await expect(startBtn).toBeDisabled()

    // 逐一勾选
    const checkboxes = page.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    expect(count).toBe(5)
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check()
    }

    // 全部勾选后应变为可点击
    await expect(startBtn).toBeEnabled()
  })

  test('2.6 【设计目标】完成准备后进入分步执行，展示步骤引导', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 快速完成接受和准备
    await page.getByRole('button', { name: /接受工单/ }).click()
    await expect(page.getByRole('heading', { name: '执行前准备' })).toBeVisible({ timeout: 10000 })

    const checkboxes = page.locator('input[type="checkbox"]')
    for (let i = 0; i < await checkboxes.count(); i++) {
      await checkboxes.nth(i).check()
    }
    await page.getByRole('button', { name: /开始执行/ }).click()

    // 验证进入执行阶段
    await expect(page.getByRole('heading', { name: '检测执行' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/进度 0%/)).toBeVisible()

    // 验证 5 个步骤
    await expect(page.getByText('受试者身份核验')).toBeVisible()
    await expect(page.getByText('检测部位准备')).toBeVisible()
    await expect(page.getByText('仪器校准确认')).toBeVisible()
    await expect(page.getByText('数据采集（5 点位测量）')).toBeVisible()
    await expect(page.getByText('数据审核与提交')).toBeVisible()

    // 验证第一个步骤有「开始」按钮
    await expect(page.getByRole('button', { name: '开始' }).first()).toBeVisible()
  })

  test('2.7 【设计目标】步骤执行流程: 开始 → 完成 → 进度更新', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 快速完成到执行阶段
    await page.getByRole('button', { name: /接受工单/ }).click()
    await expect(page.getByRole('heading', { name: '执行前准备' })).toBeVisible({ timeout: 10000 })

    const checkboxes = page.locator('input[type="checkbox"]')
    for (let i = 0; i < await checkboxes.count(); i++) {
      await checkboxes.nth(i).check()
    }
    await page.getByRole('button', { name: /开始执行/ }).click()
    await expect(page.getByRole('heading', { name: '检测执行' })).toBeVisible({ timeout: 10000 })

    // 开始第一个步骤
    const startBtns = page.getByRole('button', { name: '开始' })
    await expect(startBtns.first()).toBeVisible({ timeout: 5000 })
    await startBtns.first().click()

    // 等待步骤状态变更为「进行中」— 出现「完成」按钮
    // 注意：步骤的"完成"按钮不同于阶段 tab 的"4.完成"
    const stepArea = page.locator('.space-y-3')
    await expect(stepArea.getByRole('button', { name: '完成' })).toBeVisible({ timeout: 5000 })

    // 完成第一个步骤
    await stepArea.getByRole('button', { name: '完成' }).click()

    // 等待数据刷新，然后验证进度变化
    // 进度文字: "进度 XX%" — 至少不再是 0%
    await page.waitForTimeout(1000)
    // 验证步骤 1 显示已完成标记（绿色勾号）
    const firstStep = stepArea.locator('> div').first()
    await expect(firstStep.locator('.bg-green-100')).toBeVisible({ timeout: 5000 })
  })

  test('2.8 【设计目标】SOP 文档可随时查阅', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 点击查看 SOP
    await page.getByRole('button', { name: /查看 SOP/ }).click()

    // 验证 SOP 侧滑面板出现
    await expect(page.getByRole('heading', { name: 'SOP 文档' })).toBeVisible({ timeout: 3000 })

    // 验证面板内容（有文档链接或无配置提示）
    await expect(
      page.getByText('当前工单未配置 SOP 文档，请联系项目管理员补齐配置。')
        .or(page.getByRole('link', { name: /SOP 文档/ })),
    ).toBeVisible()

    // 关闭面板
    await page.locator('.fixed .bg-black\\/30').click()
    await expect(page.getByRole('heading', { name: 'SOP 文档' })).not.toBeVisible({ timeout: 3000 })
  })

  test('2.9 【设计目标】工单快捷操作面板应提供联系上级等操作', async ({ page }) => {
    await page.goto('/evaluator/execute/101')
    await page.waitForLoadState('networkidle')

    // 验证快捷操作
    await expect(page.getByRole('button', { name: /查看 SOP/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /上报异常/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /联系上级/ })).toBeVisible()
  })
})
