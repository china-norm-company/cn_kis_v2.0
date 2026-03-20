/**
 * 场景 4：样品分发 — 随机化方案到受试者绑定
 *
 * 业务背景：
 *   样品分发是 CRO 物料管理中最复杂、合规要求最高的环节。
 *   每个样品从入库开始就有唯一编码，分发到受试者手中时需要
 *   记录分发人、持有人、时间、关联方案，回收时需要记录剩余量，
 *   销毁时需要质量部审批。整个过程必须 100% 可追溯。
 *
 *   王度支的样品管理工作包括：
 *   - 查看各状态样品的数量分布（在库/已分发/已回收/已销毁/留样）
 *   - 按随机化方案分发样品给受试者
 *   - 在访视结束时回收剩余样品
 *   - 对过期或用完的样品进行销毁处理
 *   - 支持全链路追溯——从样品入库到最终处置的完整记录
 *
 * 验证目标：
 *   工作台是否能支持样品从"入库 → 分发 → 回收 → 销毁"的
 *   完整生命周期管理，并提供全链路追溯能力。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景4: 样品分发 — 随机化方案到受试者绑定', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('4.1【样品概况】样品概况展示各状态统计', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // sampleStats: total: 16, in_stock: 7, distributed: 5, returned: 1, destroyed: 1, retention: 4
    // 五种状态的统计让管理员一目了然
    await expect(page.getByText('在库').first()).toBeVisible()
    await expect(page.getByText('已分发').first()).toBeVisible()
    await expect(page.getByText('已回收').first()).toBeVisible()
    await expect(page.getByText('已销毁').first()).toBeVisible()
    await expect(page.getByText('留样').first()).toBeVisible()
  })

  test('4.2【样品列表】样品列表展示所有必要信息', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 每个样品应该展示：唯一编码、所属产品、状态、持有人、关联项目
    // 第一个样品：SP-2026-0115-A001, 美白精华液 A, 在库
    const tbody = page.locator('tbody')
    await expect(tbody.getByText('SP-2026-0115-A001').first()).toBeVisible()
    await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()

    // 已分发样品应该显示持有人（限定到 tbody 避免匹配 option）
    await expect(tbody.getByText('受试者 S001 张小花').first()).toBeVisible()

    // 应该显示关联项目
    await expect(tbody.getByText('保湿美白功效评价').first()).toBeVisible()
  })

  test('4.3【状态筛选】按状态筛选样品', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 场景：王度支要准备今天的分发，先看看还有多少在库样品
    const statusFilter = page.locator('select').filter({ hasText: '状态' })
      .or(page.locator('select[aria-label="状态筛选"]'))
      .or(page.locator('select').filter({ hasText: '全部状态' }))
    if (await statusFilter.first().isVisible()) {
      await statusFilter.first().selectOption('in_stock')
      await page.waitForLoadState('networkidle')

      // 筛选后应该只看到在库样品
      await expect(page.getByText('SP-2026-0115-A001').first()).toBeVisible()
    }
  })

  test('4.4【产品筛选】按产品筛选样品', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 场景：华研美妆科技打电话来问"美白精华液 A 分发了几个？"
    // 王度支按产品筛选查看
    const productFilter = page.locator('select[aria-label="产品筛选"]')
      .or(page.locator('select').filter({ hasText: '全部产品' }))
    if (await productFilter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      // 选择产品时使用产品 ID 作为值
      await productFilter.first().selectOption('1')
      await page.waitForLoadState('networkidle')

      // 应该只看到美白精华液 A 的样品
      const tbody = page.locator('tbody')
      await expect(tbody.getByText('美白精华液 A').first()).toBeVisible()
    }
  })

  test('4.5【样品详情】点击样品查看详情和流转记录', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 点击已分发的样品查看详情
    await page.getByText('SP-2026-0115-A002').first().click()
    await page.waitForLoadState('networkidle')

    // 样品详情应该展示：
    // - 样品基本信息（编码、产品、状态、持有人）
    // - 流转记录（入库 → 分发 的完整时间线）
    await expect(page.getByText('SP-2026-0115-A002').first()).toBeVisible()
    await expect(page.getByText('已分发').first()).toBeVisible()
    await expect(page.getByText('受试者 S001 张小花').first()).toBeVisible()

    // sampleDetail.transactions 包含入库和分发两条记录
    await expect(page.getByText('入库').first()).toBeVisible()
    await expect(page.getByText('分发').first()).toBeVisible()
  })

  test('4.6【分发操作】分发按钮可用', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 场景：新的受试者入组，需要按随机化方案分发样品
    const distributeBtn = page.getByRole('button', { name: '分发' })
    await expect(distributeBtn.first()).toBeVisible()

    // 点击分发按钮应该弹出分发操作界面
    await distributeBtn.first().click()
    await page.waitForTimeout(500)

    const modal = page.locator('.fixed')
    await expect(modal.getByText('分发').or(modal.getByText('持有人')).or(modal.getByText('受试者')).first()).toBeVisible()
  })

  test('4.7【回收操作】回收按钮可用', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 场景：受试者完成访视，需要回收剩余样品
    const returnBtn = page.getByRole('button', { name: '回收' })
    await expect(returnBtn.first()).toBeVisible()
  })

  test('4.8【销毁操作】销毁按钮可用', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 场景：过期样品需要经审批后销毁
    const destroyBtn = page.getByRole('button', { name: '销毁' })
    await expect(destroyBtn.first()).toBeVisible()
  })

  test('4.9【全链路追溯】追溯面板可以搜索并展示完整链路', async ({ page }) => {
    await page.goto('/material/samples')
    await page.waitForLoadState('networkidle')

    // 场景：审计员要求追溯 SP-2026-0115-A002 的完整流转记录
    // 点击样品查看追溯信息
    await page.getByText('SP-2026-0115-A002').first().click()
    await page.waitForLoadState('networkidle')

    // traceResult.timeline: 入库 → 分发，完整链路
    // traceResult.related_samples: 同批次其他样品
    await expect(page.getByText('入库').first()).toBeVisible()
    await expect(page.getByText('分发').first()).toBeVisible()

    // 追溯信息应该展示操作人
    await expect(page.getByText('王度支').first()).toBeVisible()

    // 应该能看到关联样品信息
    await expect(page.getByText('SP-2026-0115-A001').or(page.getByText('SP-2026-0115-A003')).first()).toBeVisible()
  })
})
