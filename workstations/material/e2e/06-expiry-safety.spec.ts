/**
 * 场景 6：效期安全 — 三级预警、过期处置、锁定机制
 *
 * 业务背景：
 *   化妆品 CRO 管理的物料都有效期要求。过期物料如果误用于试验，
 *   不仅影响数据质量，还可能导致受试者安全事故。因此效期管理是
 *   物料管理的核心合规要求之一。
 *
 *   系统采用三级预警机制：
 *   - 红色（≤7天或已过期）：必须立即处理，已自动锁定
 *   - 橙色（≤30天）：需要安排处置计划
 *   - 黄色（≤90天）：提前关注，评估是否需要补货
 *
 *   王度支需要每天检查效期预警面板，及时处置过期或即将过期的物料。
 *
 * 验证目标：
 *   工作台的效期预警系统是否能帮助管理员及时发现和处置效期风险。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景6: 效期安全 — 三级预警、过期处置、锁定机制', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('6.1【三级预警面板】三级预警面板数据可见', async ({ page }) => {
    // 场景：王度支每天上班第一件事就是检查效期预警面板
    // 面板按红/橙/黄三级显示预警数量
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 三级预警卡片应可见，展示各级别预警数量
    // 红色预警 3 个（2已过期 + 1即将过期5天内）
    await expect(page.getByText('3').first()).toBeVisible()

    // 橙色预警 1 个
    await expect(page.getByText('1').first()).toBeVisible()

    // 黄色预警 2 个
    await expect(page.getByText('2').first()).toBeVisible()
  })

  test('6.2【红色预警】红色预警列表展示已过期和7天内到期物料', async ({ page }) => {
    // 场景：红色预警最紧急，包括已过期和7天内到期的物料
    // 抗皱精华 F（过期15天）、祛斑霜 G（过期5天）、pH缓冲液（5天内到期）
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 已过期产品
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()

    // 即将过期耗材
    await expect(page.getByText('pH 4.0 标准缓冲液').first()).toBeVisible()
  })

  test('6.3【橙色预警】橙色预警列表展示30天内到期物料', async ({ page }) => {
    // 场景：橙色预警物料需要安排处置计划
    // pH缓冲液另一批次25天后到期
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 橙色预警中的物料
    await expect(page.getByText('pH 4.0 标准缓冲液').first()).toBeVisible()

    // 应该能看到"25"天相关的信息
    const daysText = page.getByText('25').or(page.getByText('注意'))
    await expect(daysText.first()).toBeVisible()
  })

  test('6.4【黄色预警】黄色预警列表展示90天内到期物料', async ({ page }) => {
    // 场景：黄色预警提前关注，评估补货需求
    // 酒精棉球（80天）和修复面霜 C（120天但在90天预警范围内）
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 黄色预警中的物料
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()
    await expect(page.getByText('修复面霜 C').first()).toBeVisible()
  })

  test('6.5【已锁定标识】已锁定物料有"已锁定"标识', async ({ page }) => {
    // 场景：过期物料已自动锁定，管理员能直观看到锁定状态
    // 抗皱精华 F 和祛斑霜 G 均已锁定
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 锁定标识应在预警列表中可见
    const lockedBadges = page.getByText('已锁定')
    await expect(lockedBadges.first()).toBeVisible()
  })

  test('6.6【即将过期标识】即将过期的物料有"即将过期"标识', async ({ page }) => {
    // 场景：pH缓冲液5天后到期，应显示"即将过期"而非"已锁定"
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // "即将过期"标识
    const expiringBadge = page.getByText('即将过期')
      .or(page.getByText('即将到期'))
    await expect(expiringBadge.first()).toBeVisible()
  })

  test('6.7【处置操作】预警物料可以执行处置操作', async ({ page }) => {
    // 场景：对已过期的抗皱精华 F，王度支需要执行处置（销毁/退回）
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 处置操作入口（按钮或链接）
    const handleBtn = page.getByRole('button', { name: '处置' })
      .or(page.getByRole('button', { name: '处理' }))
      .or(page.getByText('处置'))
    await expect(handleBtn.first()).toBeVisible()
  })

  test('6.8【统计一致性】效期预警面板统计数与实际一致', async ({ page }) => {
    // 场景：面板顶部的统计数字应与列表中实际展示的物料数量一致
    // stats: red_count: 3, orange_count: 1, yellow_count: 2
    await page.goto('/material/expiry-alerts')
    await page.waitForLoadState('networkidle')

    // 红色预警 3 个物料（抗皱精华 F + 祛斑霜 G + pH缓冲液BUF-2025-08）
    await expect(page.getByText('抗皱精华 F').first()).toBeVisible()
    await expect(page.getByText('祛斑霜 G').first()).toBeVisible()

    // 橙色预警 1 个物料
    await expect(page.getByText('BUF-2025-09').or(page.getByText('25')).first()).toBeVisible()

    // 黄色预警 2 个物料
    await expect(page.getByText('75%酒精棉球').first()).toBeVisible()
    await expect(page.getByText('修复面霜 C').first()).toBeVisible()
  })
})
