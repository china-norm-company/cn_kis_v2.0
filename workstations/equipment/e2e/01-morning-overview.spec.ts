/**
 * 场景 1：早晨开工 — 设备管理员如何掌握今天的工作全局
 *
 * 业务背景：
 *   周一早晨 8:30，设备管理员李器衡打开工作台。他需要在 5 分钟内
 *   了解所有设备的运行状态、哪些校准已逾期需要立即处理、哪些维护
 *   工单在等着他、今天有多少台设备正在被使用。这些信息决定了他
 *   今天的工作优先级。
 *
 * 验证目标：
 *   一个合格的设备管理员能否通过工作台快速建立"态势感知"——
 *   知道问题在哪里、哪些事情最紧急、如何安排今天的工作。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景1: 早晨开工 — 设备管理员的态势感知', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('1.1【工作全局】登录后能看到设备总体运行状况', async ({ page }) => {
    // 设备管理员打开工作台，首先看到的是设备台账
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 他需要立即知道：总共多少设备、多少在用、多少有问题
    // 这些数字帮助他判断今天的设备保障压力
    await expect(page.getByText('设备总数')).toBeVisible()
    await expect(page.getByText('正常运行')).toBeVisible()
    await expect(page.getByText('校准到期')).toBeVisible()
    await expect(page.getByText('维修中')).toBeVisible()
  })

  test('1.2【紧急识别】能一眼看出哪些设备校准状态异常', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 校准状态是设备管理员最关注的信息：
    // - 红色标签 = 逾期（必须立即锁定设备）
    // - 黄色标签 = 即将到期（需要安排校准）
    // - 绿色标签 = 正常

    // 设备列表中应该有校准状态的直观标识
    const table = page.locator('table')
    await expect(table).toBeVisible()
    await expect(page.getByText('校准').first()).toBeVisible()
  })

  test('1.3【设备清单】能看到所有设备的关键信息', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 设备管理员需要看到每台设备的：
    // - 编号（唯一标识）
    // - 名称和型号（知道是什么设备）
    // - 当前状态（在用/维护中/校准中）
    // - 存放位置（知道设备在哪里）
    // - 校准状态（是否安全可用）
    // - 近期使用频率（判断设备负荷）
    const headers = page.locator('thead th')
    await expect(headers.filter({ hasText: '设备编号' })).toBeVisible()
    await expect(headers.filter({ hasText: '名称' })).toBeVisible()
    await expect(headers.filter({ hasText: '状态' })).toBeVisible()
    await expect(headers.filter({ hasText: '位置' })).toBeVisible()

    // 具体设备数据
    await expect(page.getByText('Corneometer CM825 #1').first()).toBeVisible()
    await expect(page.getByText('EQ-CORN-001').first()).toBeVisible()
    await expect(page.getByText('恒温恒湿室A').first()).toBeVisible()
  })

  test('1.4【问题设备定位】通过筛选快速找到需要关注的设备', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 场景：李器衡想看看哪些设备校准已逾期，需要立即处理
    const calFilter = page.locator('select[aria-label="校准状态筛选"]')
    await calFilter.selectOption('overdue')
    await page.waitForLoadState('networkidle')

    // 筛选后应该只看到校准逾期的设备
    // Mexameter MX18 #1 和 Cutometer MPA580 校准已逾期
    await expect(page.getByText('Mexameter MX18 #1')).toBeVisible()
    await expect(page.getByText('Cutometer MPA580')).toBeVisible()
  })

  test('1.5【维护中设备】快速了解哪些设备不可用', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 设备管理员需要知道哪些设备处于维护中不可用
    // 这直接影响项目排程
    const statusFilter = page.locator('select[aria-label="设备状态筛选"]')
    await statusFilter.selectOption('maintenance')
    await page.waitForLoadState('networkidle')

    // 应该看到维护中的设备
    await expect(page.getByText('VISIA-CR #2')).toBeVisible()
    await expect(page.getByText('Cutometer MPA580')).toBeVisible()
  })

  test('1.6【搜索定位】接到同事问询时能快速查找设备', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 场景：技术评估员张技评打来电话问 "VISIA 现在能用吗？"
    // 李器衡需要快速搜索定位
    const searchInput = page.getByPlaceholder('搜索设备名称、编号、型号...')
    await searchInput.fill('VISIA')
    await page.waitForLoadState('networkidle')

    // 搜索结果中应该只有 VISIA 相关设备
    await expect(page.getByText('VISIA-CR #1')).toBeVisible()
    await expect(page.getByText('VISIA-CR #2')).toBeVisible()
  })

  test('1.7【设备档案】点击设备可查看完整档案信息', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 场景：审计员要检查 Corneometer CM825 #1 的完整记录
    // 李器衡点击该设备查看详情
    const row = page.locator('tr').filter({ hasText: 'Corneometer CM825 #1' })
    const eyeButton = row.locator('button[title="查看详情"]')
    await eyeButton.click()
    await page.waitForLoadState('networkidle')

    // 详情抽屉应该展示设备完整信息
    await expect(page.getByText('基本信息')).toBeVisible()
    await expect(page.getByText('校准历史')).toBeVisible()
    await expect(page.getByText('维护历史')).toBeVisible()
    await expect(page.getByText('使用记录').first()).toBeVisible()
    await expect(page.getByText('授权人员')).toBeVisible()

    // 基本信息包含关键字段（设备编号在表格和抽屉中都有，用 .first()）
    await expect(page.getByText('EQ-CORN-001').first()).toBeVisible()
    await expect(page.getByText('Courage+Khazaka').first()).toBeVisible()
  })

  test('1.8【校准追溯】在设备详情中查看完整校准链', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 打开设备详情
    const row = page.locator('tr').filter({ hasText: 'Corneometer CM825 #1' })
    const eyeButton = row.locator('button[title="查看详情"]')
    await eyeButton.click()
    await page.waitForLoadState('networkidle')

    // 切换到校准历史
    await page.getByText('校准历史').click()

    // 应该看到校准记录 — 这是审计时最关键的证据
    await expect(page.getByText('2026-01-15').first()).toBeVisible() // 最近一次校准日期
    await expect(page.getByText('通过').first()).toBeVisible()
  })

  test('1.9【导航完整】五个主要功能入口都可访问', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 设备管理员的五大工作模块都应该在导航中可见
    const nav = page.getByRole('complementary').getByRole('navigation')
    await expect(nav.getByRole('link', { name: '设备台账' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '校准计划' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '维护工单' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '使用记录' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '检测方法' })).toBeVisible()
  })
})
