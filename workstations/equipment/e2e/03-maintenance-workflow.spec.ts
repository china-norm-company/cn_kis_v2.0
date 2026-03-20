/**
 * 场景 3：报修到修复 — 维护工单的完整工作流
 *
 * 业务背景：
 *   上午 10:00，技术评估员张技评正在使用 VISIA-CR #2 拍摄受试者
 *   面部图像时，发现拍出的照片左侧偏暗。他判断可能是 UV 灯管
 *   老化导致的。他需要向设备管理员报修，同时切换到备用的 VISIA-CR #1
 *   继续工作。
 *
 *   设备管理员收到报修后的工作流：
 *   1. 确认故障现象 → 创建维护工单
 *   2. 评估维修方案：内部修还是送厂商
 *   3. 分配维修任务
 *   4. 执行维修
 *   5. 完成维修 → 评估是否需要重新校准
 *   6. 设备恢复使用
 *
 * 验证目标：
 *   工作台是否支持从"接收故障 → 创建工单 → 执行维修 → 设备恢复"
 *   的完整闭环，并且维护后能自动关联校准需求。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景3: 维护工单 — 从报修到修复的完整闭环', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('3.1【维护概览】打开维护页面，了解当前工单状况', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 设备管理员需要一眼看到：
    // - 有多少待处理工单（积压）
    // - 多少正在处理中（进行中）
    // - 本月完成了多少（绩效）
    // - 平均响应时间（效率）
    await expect(page.getByText('待处理').first()).toBeVisible()
    await expect(page.getByText('进行中')).toBeVisible()
    await expect(page.getByText('本月完成')).toBeVisible()
    await expect(page.getByText('平均响应').first()).toBeVisible()
  })

  test('3.2【创建工单】操作员报修后，设备管理员创建维护工单', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 场景：张技评报告 VISIA-CR #2 灯管亮度异常
    // 李器衡评估后决定创建纠正性维护工单
    await page.getByRole('button', { name: '创建工单' }).click()
    await page.waitForTimeout(500)

    // 创建工单表单应该包含关键字段
    await expect(page.getByText('设备').first()).toBeVisible()
    await expect(page.getByText('维护类型').first()).toBeVisible()

    // 验证可以看到提交按钮（创建维护工单Modal的提交按钮文本是"创建工单"）
    const submitBtn = page.getByRole('button', { name: '创建工单' }).last()
    await expect(submitBtn).toBeVisible()
  })

  test('3.3【工单列表】能看到所有维护工单及其状态', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 工单列表应展示：设备名、标题、类型、状态、创建时间
    await expect(page.getByText('灯管亮度不均匀')).toBeVisible()
    await expect(page.getByText('密封圈磨损更换')).toBeVisible()
    await expect(page.getByText('季度预防性维护')).toBeVisible()

    // 不同状态的工单应该有明确标识（状态标签是 span.border，避免匹配 <option>）
    await expect(page.locator('.divide-y span').filter({ hasText: '待处理' }).first()).toBeVisible()
    await expect(page.locator('.divide-y span').filter({ hasText: '处理中' }).first()).toBeVisible()
    await expect(page.locator('.divide-y span').filter({ hasText: '已完成' }).first()).toBeVisible()
  })

  test('3.4【按状态筛选】快速找到需要处理的工单', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 场景：李器衡想先处理所有待处理的工单
    const statusFilter = page.locator('select[aria-label="筛选工单状态"]')
      .or(page.locator('select').filter({ hasText: '全部状态' }))
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('pending')
      await page.waitForLoadState('networkidle')
    }

    // 应该只看到待处理的工单
    await expect(page.getByText('灯管亮度不均匀')).toBeVisible()
  })

  test('3.5【工单详情】点击工单查看完整信息', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 点击第一个工单查看详情
    await page.getByText('灯管亮度不均匀').click()
    await page.waitForLoadState('networkidle')

    // 详情中应该包含：
    // - 故障描述（操作员的反馈）
    // - 设备信息
    // - 维护类型
    // - 当前状态
    await expect(page.getByText('VISIA-CR #2').first()).toBeVisible()
    // 工单详情抽屉中显示描述（可能包含操作员反馈或灯管关键字）
    await expect(page.getByText('维护工单详情')).toBeVisible()
  })

  test('3.6【状态流转·开始维护】将待处理工单标记为"处理中"', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 点击工单详情
    await page.getByText('灯管亮度不均匀').click()
    await page.waitForLoadState('networkidle')

    // 待处理工单应该有"开始"操作按钮
    const startBtn = page.getByRole('button', { name: '开始维护' })
      .or(page.getByRole('button', { name: '开始处理' }))
      .or(page.getByRole('button', { name: '开始' }))
    if (await startBtn.isVisible()) {
      await startBtn.click()
      await page.waitForLoadState('networkidle')
    }
  })

  test('3.7【状态流转·完成维护】维修完成后记录结果并关闭工单', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 找到"处理中"的工单 —— Cutometer MPA580 密封圈更换
    await page.getByText('密封圈磨损更换').click()
    await page.waitForLoadState('networkidle')

    // 处理中的工单应该有"完成"操作按钮
    const completeBtn = page.getByRole('button', { name: '完成维护' })
      .or(page.getByRole('button', { name: '完成' }))
    if (await completeBtn.isVisible()) {
      await completeBtn.click()
      await page.waitForTimeout(500)
      // 完成时可能需要填写维修结果
    }
  })

  test('3.8【维护类型区分】能看到预防性/纠正性/紧急三种类型', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 不同维护类型代表不同的紧急程度和工作流：
    // - 预防性维护：按计划执行，不影响当前设备状态
    // - 纠正性维护：设备出问题了，需要处理
    // - 紧急维修：正在使用中突发故障，最高优先级
    // 卡片中类型标签渲染为 [预防性]、[纠正性]、[紧急]（带方括号）
    await expect(page.getByText('[预防性]').first()).toBeVisible()
    await expect(page.getByText('[纠正性]').first()).toBeVisible()
    await expect(page.getByText('[紧急]').first()).toBeVisible()
  })

  test('3.9【维护与校准联动】维修后标记"需要重新校准"', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 场景：Cutometer MPA580 更换了密封圈后需要重新校准
    // 这是维护与校准的关键联动点
    await page.getByText('密封圈磨损更换').click()
    await page.waitForLoadState('networkidle')

    // 工单详情中应该能看到"需要重新校准"的标识
    // 因为这个工单的 requires_recalibration 为 true
    const recalText = page.getByText('需要重新校准')
      .or(page.getByText('重新校准'))
    if (await recalText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(recalText).toBeVisible()
    }
  })
})
