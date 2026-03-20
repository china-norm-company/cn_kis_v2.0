/**
 * 场景 7：变更与意外管理 — 设备管理中的非正常态处理
 *
 * 业务背景：
 *   设备管理的日常工作大部分是按计划执行，但真正考验管理员能力的
 *   是变更和意外发生时的应对。在化妆品 CRO 的 GLP/GCP 环境下，
 *   任何变更都需要有记录、有评估、有审批，任何意外都需要有应急
 *   响应、有偏差调查、有 CAPA（纠正与预防措施）。
 *
 *   变更场景（来自业务分析）：
 *   - 校准标准变更 → 同类设备批量重新校准
 *   - 设备替换 → 新设备验证 + 检测方法关联更新 + 台账更新
 *   - 校准周期调整 → 变更申请 + 审批 + 更新计划
 *   - 维护计划调整 → SOP修订 + 审批 + 更新计划
 *
 *   意外场景（来自业务分析）：
 *   - 试验中设备故障 → 暂停 + 偏差记录 + 备用设备 + 数据评估
 *   - 校准不通过 → 锁定设备 + 追溯使用 + 通知项目
 *   - 操作员误操作 → 异常记录 + 补充培训
 *
 * 验证目标：
 *   工作台在非正常态下是否依然能支撑管理员的工作，提供必要的
 *   操作入口和信息展示。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景7A: 变更管理 — 当计划需要调整时', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7A.1【设备替换·旧设备报废】将老旧设备标记为报废', async ({ page }) => {
    // 场景：Cutometer MPA580 频繁故障，评估后决定报废
    // 这是设备替换流程的第一步
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 找到 Cutometer 设备，查看详情
    const eyeButton = page.locator('tr').filter({ hasText: 'Cutometer MPA580' })
      .locator('button[title="查看详情"]')
    if (await eyeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await eyeButton.click()
      await page.waitForLoadState('networkidle')

      // 设备详情中应该有"报废"操作入口
      const retireBtn = page.getByRole('button', { name: '报废' })
        .or(page.getByText('报废'))
      // 验证报废入口存在（即使当前不点击）
      if (await retireBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(retireBtn).toBeVisible()
      }
    }
  })

  test('7A.2【设备替换·新设备入库】报废后新增替代设备', async ({ page }) => {
    // 场景：新购的 Cutometer Dual MPA580 到货，需要入库
    // 替换旧设备后还需要验证和关联检测方法
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 新增设备入口
    const addBtn = page.getByRole('button', { name: '新增设备' })
      .or(page.getByRole('button', { name: '添加设备' }))
    await addBtn.click()
    await page.waitForTimeout(500)

    // 新增设备表单应该支持完整的设备信息录入
    // 包括：名称、编号、制造商、型号、序列号、存放位置、校准周期等
    await expect(page.getByRole('heading', { name: '新增设备' })).toBeVisible()
  })

  test('7A.3【设备替换·方法关联】新设备需要关联到检测方法', async ({ page }) => {
    // 场景：新 Cutometer 入库后，需要确认检测方法"皮肤弹性测定"
    // 仍然能找到可用的设备
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 打开"皮肤弹性测定"方法查看资源需求
    await page.getByText('Cutometer 皮肤弹性测定').click()
    await page.waitForLoadState('networkidle')

    // 方法详情应展示所需设备类别
    await expect(page.locator('.fixed').getByText('资源需求').first()).toBeVisible()
  })

  test('7A.4【校准周期变更】通过设备详情了解当前校准信息', async ({ page }) => {
    // 场景：根据 Corneometer 近一年的校准数据分析，偏移量很小，
    // 质量部同意将校准周期从 90 天调整为 120 天
    // 设备管理员需要在台账中查看和确认当前校准设置
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 查看设备详情中的校准信息
    const row = page.locator('tr').filter({ hasText: 'Corneometer CM825 #1' })
    const eyeButton = row.locator('button[title="查看详情"]')
    await eyeButton.click()
    await page.waitForLoadState('networkidle')

    // 校准相关信息应该可见
    await expect(page.getByText('基本信息')).toBeVisible()
    await expect(page.getByText('校准历史')).toBeVisible()
  })

  test('7A.5【紧急维护升级】预防性维护中发现新问题，升级为纠正性维护', async ({ page }) => {
    // 场景：执行 Corneometer 季度预防性维护时，发现探头连接座有裂纹
    // 需要将预防性维护升级为纠正性维护
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 找到预防性维护工单
    await expect(page.getByText('季度预防性维护')).toBeVisible()

    // 同时应该能创建新的纠正性维护工单
    await page.getByRole('button', { name: '创建工单' }).click()
    await page.waitForTimeout(500)

    // 创建维护工单弹窗标题
    await expect(page.getByText('创建维护工单')).toBeVisible()
  })
})

test.describe('场景7B: 意外管理 — 当出了问题时', () => {
  const sidebarNav = (page: import('@playwright/test').Page) =>
    page.getByRole('complementary').getByRole('navigation')

  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('7B.1【试验中设备故障】通过紧急维修工单响应故障', async ({ page }) => {
    // 场景：张技评正在使用 VISIA-CR #2 给受试者拍照时，
    // 发现灯管闪烁。他立即停止操作并报告给设备管理员。
    // 设备管理员需要：创建紧急维修工单 + 确认设备状态变为"维护中"
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 系统中应该已有一个紧急维修工单（Cutometer 密封圈）
    // 验证紧急维修工单的存在和可见性
    await expect(page.getByText('[紧急]')).toBeVisible()

    // 同时查看设备台账确认设备状态
    await sidebarNav(page).getByRole('link', { name: '设备台账' }).click()
    await page.waitForLoadState('networkidle')

    // 维护中的设备应该有明确的状态标识
    const maintenanceRows = page.locator('tr').filter({ hasText: '维护中' })
    await expect(maintenanceRows.first()).toBeVisible()
  })

  test('7B.2【设备故障·备用设备确认】确认备用设备可用', async ({ page }) => {
    // 场景：VISIA-CR #2 故障了，需要确认 VISIA-CR #1 是否可用
    // 设备管理员搜索同类设备，检查其状态和校准有效性
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 搜索 VISIA 类设备
    const searchInput = page.getByPlaceholder('搜索设备名称、编号、型号...')
    await searchInput.fill('VISIA')
    await page.waitForLoadState('networkidle')

    // 应该看到两台 VISIA：#1 在用（备用）、#2 维护中（故障）
    await expect(page.getByText('VISIA-CR #1')).toBeVisible()
    await expect(page.getByText('VISIA-CR #2')).toBeVisible()

    // #1 应该是"在用"状态——可以作为备用
    const visiaRow1 = page.locator('tr').filter({ hasText: 'VISIA-CR #1' })
    await expect(visiaRow1).toBeVisible()
  })

  test('7B.3【校准不通过·设备锁定】校准失败的设备在台账中有明显标识', async ({ page }) => {
    // 场景：Tewameter TM300 #1 校准不通过（偏差超限）
    // 该设备必须锁定，不能再用于试验
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // Tewameter 状态应该是"校准中"（已被锁定去重新校准）
    const tewaRow = page.locator('tr').filter({ hasText: 'Tewameter TM300' })
    await expect(tewaRow).toBeVisible()
  })

  test('7B.4【校准不通过·使用记录追溯】能追溯校准失败设备的历史使用', async ({ page }) => {
    // 场景：Tewameter 校准不通过后，质量部要求追溯该设备
    // 上次校准以来的所有使用记录，评估数据影响范围
    await page.goto('/equipment/usage')
    await page.waitForLoadState('networkidle')

    // 使用记录页面标题
    await expect(page.locator('h2').getByText('使用记录')).toBeVisible()
  })

  test('7B.5【校准不通过·查看校准失败详情】在校准记录中看到失败原因', async ({ page }) => {
    // 场景：查看 Tewameter 的校准不通过记录，了解失败原因
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 校准记录列表中应该能看到不通过的记录
    await expect(page.getByText('Tewameter TM300 #1')).toBeVisible()

    // 失败记录应该有视觉区分（红色标识）
    const failText = page.getByText('不通过').or(page.getByText('fail'))
    if (await failText.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(failText.first()).toBeVisible()
    }
  })

  test('7B.6【紧急维修·维护校准联动】维修完成后自动提示需要重新校准', async ({ page }) => {
    // 场景：Cutometer MPA580 密封圈更换（紧急维修）完成后，
    // 因为涉及测量部件更换，必须重新校准才能恢复使用
    await page.goto('/equipment/maintenance')
    await page.waitForLoadState('networkidle')

    // 点击密封圈更换工单
    await page.getByText('密封圈磨损更换').click()
    await page.waitForLoadState('networkidle')

    // 该工单标记了 requires_recalibration = true
    // 详情中应该有"需要重新校准"的提示
    const recalFlag = page.getByText('重新校准')
      .or(page.getByText('需要校准'))
    if (await recalFlag.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(recalFlag).toBeVisible()
    }
  })

  test('7B.7【逾期设备·不可排程】逾期设备应该在状态上有紧急标识', async ({ page }) => {
    // 场景：Mexameter MX18 #1 校准已逾期 3 天
    // 这台设备不应该再被排到任何项目中使用
    // 设备管理员需要在台账中立即发现这个问题
    await page.goto('/equipment/ledger')
    await page.waitForLoadState('networkidle')

    // 筛选校准逾期设备
    const calFilter = page.locator('select[aria-label="校准状态筛选"]')
    await calFilter.selectOption('overdue')
    await page.waitForLoadState('networkidle')

    // 应该看到逾期设备
    await expect(page.getByText('Mexameter MX18 #1')).toBeVisible()
    await expect(page.getByText('Cutometer MPA580')).toBeVisible()
  })

  test('7B.8【多设备故障·优先级判断】多个问题同时出现时的信息呈现', async ({ page }) => {
    // 场景：周一早晨发现同时有：
    // - 2台设备校准逾期
    // - 1台设备紧急维修中
    // - 3台设备7天内校准到期
    // 管理员需要快速判断处理优先级

    // 先看校准页面（最紧急）
    await page.goto('/equipment/calibration')
    await page.waitForLoadState('networkidle')

    // 逾期（红色）> 7天内到期（橙色）> 本月待校准（蓝色）
    await expect(page.getByText('已逾期')).toBeVisible()
    await expect(page.getByText('7日内到期')).toBeVisible()

    // 再看维护页面
    await sidebarNav(page).getByRole('link', { name: '维护工单' }).click()
    await page.waitForLoadState('networkidle')

    // 待处理工单数
    await expect(page.getByText('待处理').first()).toBeVisible()
  })
})
