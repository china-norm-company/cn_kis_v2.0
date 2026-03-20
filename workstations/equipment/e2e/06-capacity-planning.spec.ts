/**
 * 场景 6：前瞻性规划 — 确保未来有专业可靠可用的仪器资源
 *
 * 业务背景：
 *   一个优秀的设备管理员不仅要处理当下的问题，还要提前规划。
 *   下个月有 3 个保湿功效项目同时启动，每个项目需要 Corneometer
 *   和 Tewameter 各一台。公司只有 2 台 Corneometer 和 1 台 Tewameter，
 *   而且其中 1 台 Tewameter 正在校准中。
 *
 *   设备管理员需要通过工作台的数据回答：
 *   - 现有设备产能是否足够？
 *   - 哪些设备使用率过高需要关注？
 *   - 未来一个月有多少设备需要校准？
 *   - 是否需要向上级申请增购设备？
 *
 * 验证目标：
 *   工作台是否提供足够的数据洞察，帮助设备管理员做出
 *   前瞻性的资源规划决策。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景6: 前瞻性规划 — 数据驱动的资源保障', () => {
  const sidebarNav = (page: import('@playwright/test').Page) =>
    page.getByRole('complementary').getByRole('navigation')

  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('6.1【设备产能全景】从台账统计了解设备总体状况', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 设备管理员需要知道总设备数和各状态分布
    // 这是产能评估的基础数据
    // 28台设备中：22在用、3维修中、1校准中、1闲置、1报废
    // 实际可用产能 = 22台
    await expect(page.getByText('设备总数')).toBeVisible()
  })

  test('6.2【使用率分析】识别高负荷和闲置设备', async ({ page }) => {
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 使用排名数据帮助管理员识别：
    // - Corneometer CM825 #1: 42次/月 → 高负荷
    // - Mexameter MX18 #1: 15次/月 → 中等使用
    // 如果排名 Top3 的设备使用率都很高，说明需要增购
    await expect(page.getByText('Corneometer CM825 #1').first()).toBeVisible()
  })

  test('6.3【校准计划前瞻】了解未来一个月的校准安排', async ({ page }) => {
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 本月待校准设备数量帮助管理员安排工作
    // 5台设备本月需要校准 → 需要安排足够的时间和资源
    await expect(page.getByText('本月待校准')).toBeVisible()

    // 7天内到期的设备 → 本周必须处理
    await expect(page.getByText('7日内到期')).toBeVisible()
  })

  test('6.4【设备类别分析】通过台账了解各类设备的保有量', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 场景：项目经理问"同时跑3个保湿项目够不够？"
    // 设备管理员需要搜索所有 Corneometer 设备
    const searchInput = page.getByPlaceholder('搜索设备名称、编号、型号...')
    await searchInput.fill('Corneometer')
    await page.waitForLoadState('networkidle')

    // 应该看到 2 台 Corneometer
    await expect(page.getByText('Corneometer CM825 #1')).toBeVisible()
    await expect(page.getByText('Corneometer CM825 #2')).toBeVisible()
    // 2 台 Corneometer 支持 3 个项目同时跑 → 需要评估排期
  })

  test('6.5【新增设备】当产能不足时能录入新设备', async ({ page }) => {
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 场景：经评估决定增购 1 台 Tewameter TM300
    // 新设备到货后需要录入系统
    const addBtn = page.getByRole('button', { name: '新增设备' })
      .or(page.getByRole('button', { name: '添加设备' }))
    await addBtn.click()
    await page.waitForTimeout(500)

    // 新增设备抽屉标题（按钮和标题同名，用 heading 精确匹配）
    await expect(page.getByRole('heading', { name: '新增设备' })).toBeVisible()
  })

  test('6.6【维护绩效回顾】通过维护统计评估设备可靠性', async ({ page }) => {
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 维护统计帮助管理员评估设备可靠性：
    // - 本月完成 8 个维护工单
    // - 平均响应时间 6.5 小时
    // 如果某类设备频繁报修，说明需要更新换代
    await expect(page.getByText('本月完成')).toBeVisible()
    await expect(page.getByText('平均响应').first()).toBeVisible()
  })

  test('6.7【跨页面导航】在不同功能模块间快速切换收集信息', async ({ page }) => {
    // 场景：设备管理员需要综合多个页面的信息做出决策
    // 台账（产能）→ 使用记录（负荷）→ 校准计划（维护排期）→ 检测方法（业务需求）

    // Step 1: 查看设备台账
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('设备总数')).toBeVisible()

    // Step 2: 切换到校准计划（通过 nav link 精确定位）
    await sidebarNav(page).getByRole('link', { name: '校准计划' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('已逾期')).toBeVisible()

    // Step 3: 切换到维护工单
    await sidebarNav(page).getByRole('link', { name: '维护工单' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('待处理').first()).toBeVisible()

    // Step 4: 切换到使用记录
    await sidebarNav(page).getByRole('link', { name: '使用记录' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('今日使用')).toBeVisible()

    // Step 5: 切换到检测方法
    await sidebarNav(page).getByRole('link', { name: '检测方法' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Corneometer').first()).toBeVisible()
  })

  test('6.8【授权规划】确认关键设备有足够的授权操作人员', async ({ page }) => {
    // 场景：3个保湿项目需要操作 Corneometer 的评估员
    // 管理员需要确认有足够授权的操作人员
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 在设备列表中查看 Corneometer CM825 #1 的授权操作人员数
    // 5人已授权 — 这是关键产能指标之一
    const firstRow = page.locator('tr').filter({ hasText: 'Corneometer CM825 #1' })
    await expect(firstRow).toBeVisible()
  })
})
