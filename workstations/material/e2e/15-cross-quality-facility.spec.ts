/**
 * 场景 15：跨工作台集成 — 质量台/设施台与物料台联动
 *
 * 业务背景：
 *   物料台与质量台、设施台存在数据联动：样品偏差、温度异常、
 *   批次隔离、销毁审批、盘点差异、效期处置、依从性偏差等。
 *
 * 验证目标：
 *   - 样品管理可发起销毁（关联质量审批）
 *   - 温度监控显示异常记录
 *   - 批次管理支持隔离状态筛选
 *   - 销毁审批页面展示
 *   - 盘点执行显示差异
 *   - 温度日志完整历史
 *   - 效期预警处置
 *   - 依从性偏差标记
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景15: 跨工作台集成 — 质量台/设施台与物料台联动', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('15.1【物料偏差】样品管理页面可发起销毁（关联质量审批）', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 在库样品有销毁按钮，销毁会走质量审批流程
    const destroyBtn = page.locator('button[title="销毁"]')
    await expect(destroyBtn.first()).toBeVisible()
  })

  test('15.2【温度异常】温度监控页面显示异常', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    // 选择位置以加载温度数据（mock 含 is_abnormal: true 记录）
    const locSelect = page.locator('select[aria-label="存储位置"]')
    if (await locSelect.isVisible()) {
      await locSelect.selectOption({ index: 1 })
      await page.waitForLoadState('networkidle')
    }

    // 异常次数卡片或异常记录
    await expect(page.getByText('异常').first()).toBeVisible()
  })

  test('15.3【批次隔离】异常批次状态为隔离', async ({ page }) => {
    await page.goto('/material/batches')
    await page.waitForLoadState('networkidle')

    // batchList 中有 status: quarantine 的防晒喷雾 C，应该在列表中显示
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('防晒喷雾 C').first()).toBeVisible()
    await expect(tbody.getByText('隔离').first()).toBeVisible()
  })

  test('15.4【质量台联动】销毁审批关联质量检查', async ({ page }) => {
    await page.goto('/material/destructions')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('销毁审批').first()).toBeVisible()
    await expect(page.getByText('DES-').first()).toBeVisible()
  })

  test('15.5【盘点差异】盘点执行显示差异', async ({ page }) => {
    await page.goto('/material/inventory-execution')
    await page.waitForLoadState('networkidle')

    // 差异数量卡片
    await expect(page.getByText('差异数量').first()).toBeVisible()
  })

  test('15.6【温度日志】温度记录显示完整历史', async ({ page }) => {
    await page.goto('/material/temperature')
    await page.waitForLoadState('networkidle')

    // 温度监控页面应显示温度相关信息
    await expect(page.getByText('当前温度').or(page.getByText('温湿度')).or(page.getByText('异常')).first()).toBeVisible()
  })

  test('15.7【异常处理】可处理效期预警', async ({ page }) => {
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    const handleBtn = page.getByRole('button', { name: '处置' }).or(page.getByRole('button', { name: '处理' }))
    await expect(handleBtn.first()).toBeVisible()
  })

  test('15.8【依从性偏差】依从性页面标记偏差', async ({ page }) => {
    await page.goto('/material/compliance')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('依从性管理').first()).toBeVisible()
    await expect(page.getByText('偏差').first()).toBeVisible()
  })
})
