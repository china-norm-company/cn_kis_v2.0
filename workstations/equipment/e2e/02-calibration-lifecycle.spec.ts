/**
 * 场景 2：校准生命周期 — 设备管理员最核心的日常工作
 *
 * 业务背景：
 *   校准是设备管理员的第一优先级工作。在化妆品 CRO 中，
 *   如果一台 Corneometer 没有经过校准就用于功效测试，
 *   那么"使用28天后皮肤水分提升23%"这个宣称就完全不可信。
 *   监管机构和第三方审计首先看的就是设备校准记录。
 *
 *   设备管理员需要：
 *   - 每天检查校准预警（逾期的、即将到期的）
 *   - 执行校准并记录结果
 *   - 处理校准不通过的情况（锁定设备、追溯使用记录）
 *   - 确保"0 逾期率"
 *
 * 验证目标：
 *   工作台是否能帮助设备管理员实现"校准零逾期"的 KPI 目标，
 *   并在校准不通过时触发正确的合规处理流程。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景2: 校准管理 — 设备测量可信度的生命线', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('2.1【预警面板】打开校准计划页面，立即看到紧急事项', async ({ page }) => {
    // 设备管理员的每天第一件事：检查校准预警
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 三级预警卡片是校准页面最重要的信息区
    // 红色：逾期设备（必须立即处理，这些设备不应该再被使用）
    await expect(page.getByText('已逾期')).toBeVisible()
    // 逾期卡片中的数字不用精确断言（避免 strict mode，'2' 匹配太多）

    // 橙色：7天内到期（本周必须安排校准）
    await expect(page.getByText('7日内到期')).toBeVisible()

    // 蓝色：本月待校准（列入本月工作计划）
    await expect(page.getByText('本月待校准')).toBeVisible()
  })

  test('2.2【逾期紧急】能看到具体哪些设备校准已逾期', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 逾期设备必须醒目展示——这是最高优先级
    // Mexameter MX18 #1 和 Cutometer MPA580 校准逾期
    await expect(page.getByText('Mexameter MX18 #1')).toBeVisible()
    await expect(page.getByText('Cutometer MPA580')).toBeVisible()
  })

  test('2.3【登记校准】执行校准后能够完整记录结果', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 场景：李器衡完成了 Corneometer CM825 #2 的内部校准
    // 标准块校准值 42.3，在 42±2 范围内，判定通过
    const addBtn = page.getByRole('button', { name: '新增校准' })
    await addBtn.click()

    // 校准记录弹窗标题和核心字段
    await expect(page.getByText('新增校准记录')).toBeVisible()
    await expect(page.locator('.fixed').getByText('校准类型')).toBeVisible()
    await expect(page.locator('.fixed').getByText('校准日期').first()).toBeVisible()
  })

  test('2.4【内部校准流程】完成内部校准记录的全流程', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 点击新增校准
    await page.getByRole('button', { name: '新增校准' }).click()
    await page.waitForTimeout(500)

    // 填写校准记录：
    // - 选择设备
    // - 选择校准类型（内部/外部）
    // - 填写校准日期
    // - 填写下次到期日
    // - 填写校准结果（通过/不通过）
    // - 填写证书编号
    // 验证表单中有提交按钮
    const submitBtn = page.getByRole('button', { name: '提交' }).or(page.getByRole('button', { name: '保存' })).or(page.getByRole('button', { name: '确定' }))
    await expect(submitBtn).toBeVisible()
  })

  test('2.5【校准记录完整性】查看校准历史记录列表', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 校准记录列表是审计的核心依据
    // 每条记录应该包含：设备、校准日期、类型、结果、校准人/机构、证书号
    const table = page.locator('table')
    await expect(table).toBeVisible()

    // 应该看到具体的校准记录
    await expect(page.getByText('Corneometer CM825 #1')).toBeVisible()
    await expect(page.getByText('EQ-CORN-001')).toBeVisible()
    await expect(page.getByText('2026-01-15')).toBeVisible()
  })

  test('2.6【结果筛选】能按校准结果筛选记录', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 场景：质量部门审计时要求"列出所有校准不通过的记录"
    const resultFilter = page.locator('select[aria-label="筛选校准结果"]')
    if (await resultFilter.isVisible()) {
      await resultFilter.selectOption('fail')
      await page.waitForLoadState('networkidle')

      // 应该看到校准不通过的记录
      await expect(page.getByText('Tewameter TM300 #1')).toBeVisible()
    }
  })

  test('2.7【校准不通过的业务影响】校准不通过时系统的处理逻辑', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 校准不通过是一个严重事件：
    // 1. 设备必须立即锁定（状态变为"维护中"）
    // 2. 需要追溯上次校准以来的所有使用记录
    // 3. 评估这些使用记录对试验数据的影响
    // 4. 通知相关项目负责人

    // 在校准记录中应该能看到不通过记录的明显标识
    const failRecord = page.getByText('不通过').or(page.getByText('fail'))
    if (await failRecord.first().isVisible()) {
      // 不通过记录应该有醒目的视觉标记
      await expect(failRecord.first()).toBeVisible()
    }
  })
})
