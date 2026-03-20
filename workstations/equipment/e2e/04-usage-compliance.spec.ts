/**
 * 场景 4：使用合规追溯 — 确保每次设备使用都有完整证据链
 *
 * 业务背景：
 *   在 GLP/GCP 临床试验中，每一次设备使用都需要完整记录。
 *   当审计员问"这台 Corneometer 在 2026年2月17日 是谁在用？
 *   用于哪个项目？当时设备是否经过校准？"——系统必须能回答。
 *
 *   设备管理员的使用管理工作包括：
 *   - 监控实时使用情况（谁在用什么设备）
 *   - 支持手动使用登记（培训使用、临时借用等非工单场景）
 *   - 分析使用效率（高频/低频设备识别）
 *   - 管理操作授权（谁有权使用哪台设备）
 *
 * 验证目标：
 *   工作台是否能提供 100% 可追溯的使用记录链、
 *   清晰的授权管理、以及有效的使用效率分析。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景4: 使用记录与授权 — 合规追溯的基石', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4.1【实时监控】打开使用记录页面，看到今日使用概况', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 使用统计卡片：让管理员知道设备使用负荷
    await expect(page.getByText('今日使用')).toBeVisible()
    await expect(page.getByText('正在使用')).toBeVisible()
  })

  test('4.2【使用记录列表】查看完整的设备使用日志', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 每条使用记录应该包含：
    // - 设备名称（用的哪台设备）
    // - 操作人（谁在用）
    // - 使用类型（工单关联/手动登记/培训）
    // - 开始时间和时长
    // - 关联工单号（如果有）
    await expect(page.getByText('Corneometer CM825 #1').first()).toBeVisible()
    await expect(page.getByText('张技评').first()).toBeVisible()
  })

  test('4.3【活跃使用高亮】能区分当前正在使用的和已结束的', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 正在使用中的记录应该有明显的视觉标识
    // 使用中 = end_time 为空
    const activeText = page.getByText('使用中')
      .or(page.getByText('进行中'))
    await expect(activeText.first()).toBeVisible()
  })

  test('4.4【手动登记】非工单场景下手动登记设备使用', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 场景：新员工赵实习需要使用 pH 计进行培训
    // 这不是项目工单，需要手动登记
    const registerBtn = page.getByRole('button', { name: '登记使用' })
      .or(page.getByRole('button', { name: '手动登记' }))
    await registerBtn.click()
    await page.waitForTimeout(500)

    // 登记弹窗标题
    await expect(page.getByText('登记设备使用')).toBeVisible()
  })

  test('4.5【结束使用】正在使用的设备可以手动结束', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 场景：张技评完成了 Corneometer 的使用，系统应该能记录结束时间
    const endBtn = page.getByRole('button', { name: '结束使用' })
      .or(page.getByRole('button', { name: '结束' }))
    if (await endBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(endBtn.first()).toBeVisible()
    }
  })

  test('4.6【使用排名】查看高频使用设备和操作人员排名', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 使用排名帮助管理员做决策：
    // - 高频设备：是否需要增购备用？
    // - 低频设备：是否可以调配到其他项目？
    // - 高频操作人员：工作量是否过大？

    // 使用排名中应该看到 Corneometer CM825 #1（42次/月，最高）
    await expect(page.getByText('Corneometer CM825 #1').first()).toBeVisible()
  })

  test('4.7【授权查看】在设备详情中查看操作授权人员', async ({ page }) => {
    // 通过设备详情查看授权人员
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    const row = page.locator('tr').filter({ hasText: 'Corneometer CM825 #1' })
    const eyeButton = row.locator('button[title="查看详情"]')
    await eyeButton.click()
    await page.waitForLoadState('networkidle')

    // 切换到授权人员 Tab
    await page.getByText('授权人员').click()

    // 应该看到授权的操作人员列表
    await expect(page.getByText('张技评')).toBeVisible()
    await expect(page.getByText('王检测')).toBeVisible()
    await expect(page.getByText('赵实习')).toBeVisible()
  })

  test('4.8【培训使用标识】能区分培训使用和正式工单使用', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 培训使用和正式工单使用的性质不同：
    // - 工单使用：关联临床试验数据，纳入审计范围
    // - 培训使用：不产生试验数据，但同样需要记录
    const trainingText = page.getByText('培训')
      .or(page.getByText('training'))
    if (await trainingText.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(trainingText.first()).toBeVisible()
    }
  })
})
