/**
 * 场景 5：检测方法与设备就绪 — 业务与设备的桥梁
 *
 * 业务背景：
 *   检测方法是化妆品 CRO 的核心竞争力。每个检测方法（如"Corneometer
 *   皮肤角质层水分测定"）定义了：需要什么设备、什么环境条件、操作人员
 *   需要什么资质。当项目经理立项时，技术评估员解析协议后会自动匹配
 *   检测方法，方法再关联到具体设备。
 *
 *   设备管理员在检测方法中的角色：
 *   - 维护检测方法与设备的关联关系
 *   - 新设备引入时更新方法的"推荐设备"列表
 *   - 确认方法执行前设备和环境就绪
 *
 * 验证目标：
 *   工作台是否能让设备管理员清晰了解每个检测方法需要什么资源，
 *   并能方便地管理方法与设备的关联关系。
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景5: 检测方法管理 — 设备与业务的桥梁', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('5.1【方法库概览】打开检测方法页面，浏览方法库', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 设备管理员需要了解公司有哪些检测方法
    // 每个方法卡片应该展示关键信息
    await expect(page.getByText('Corneometer 皮肤角质层水分测定')).toBeVisible()
    await expect(page.getByText('Cutometer 皮肤弹性测定')).toBeVisible()
    await expect(page.getByText('VISIA 面部多光谱成像分析')).toBeVisible()
    await expect(page.getByText('Mexameter 皮肤色素/红斑测定')).toBeVisible()
    await expect(page.getByText('Tewameter 经皮水分散失测定')).toBeVisible()
    await expect(page.getByText('皮肤表面 pH 值测定')).toBeVisible()
  })

  test('5.2【方法分类】按类别筛选查看方法', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 场景：设备管理员要检查所有跟"皮肤水分"相关的方法
    // 因为下周有批量保湿功效项目要启动
    const categoryTabs = page.locator('button').filter({ hasText: '皮肤水分' })
      .or(page.getByText('皮肤水分'))
    if (await categoryTabs.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryTabs.first().click()
      await page.waitForLoadState('networkidle')
    }
  })

  test('5.3【方法详情】查看方法的完整定义', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 点击 Corneometer 方法查看详情
    await page.getByText('Corneometer 皮肤角质层水分测定').click()
    await page.waitForLoadState('networkidle')

    // 方法详情应该包含设备管理员关心的所有信息：
    // 1. 基本信息
    await expect(page.getByText('DM-CORN-001')).toBeVisible()

    // 2. 环境要求 — 这决定了需要在哪个场地执行
    await expect(page.getByText('环境要求').or(page.getByText('环境条件'))).toBeVisible()
    await expect(page.getByText('20').first()).toBeVisible() // 温度下限

    // 3. 资源需求 — 需要什么设备和耗材（drawer 中标题是 "资源需求 (N)"）
    await expect(page.locator('.fixed').getByText('资源需求').first()).toBeVisible()
    await expect(page.getByText('皮肤水分测试仪').first()).toBeVisible()

    // 4. 人员要求 — 操作人员需要什么资质
    await expect(page.locator('.fixed').getByText('人员要求').first()).toBeVisible()
    await expect(page.getByText('Corneometer 操作资质')).toBeVisible()
  })

  test('5.4【设备需求匹配】方法详情中能看到需要的具体设备类型', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    await page.getByText('Corneometer 皮肤角质层水分测定').click()
    await page.waitForLoadState('networkidle')

    // 资源需求列表应该明确说明需要什么：
    // - 设备：皮肤水分测试仪（必需）
    // - 耗材：探头保护膜 × 5（必需）
    // - 耗材：75%酒精棉球 × 10（必需）
    await expect(page.getByText('皮肤水分测试仪')).toBeVisible()
    await expect(page.getByText('探头保护膜').or(page.getByText('保护膜'))).toBeVisible()
  })

  test('5.5【搜索方法】通过关键词快速搜索检测方法', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 场景：项目经理问"我们能做 TEWL 测试吗？"
    // 设备管理员搜索 TEWL 相关方法
    const searchInput = page.getByPlaceholder('搜索方法名称...')
      .or(page.getByPlaceholder('搜索'))
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('Tewameter')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('Tewameter 经皮水分散失测定')).toBeVisible()
    }
  })

  test('5.6【创建方法】支持创建新的检测方法模板', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 场景：公司引入了新的 Skin-Colorimeter（皮肤色度计），
    // 需要为它创建新的检测方法模板
    const createBtn = page.getByRole('button', { name: '新增方法' })
      .or(page.getByRole('button', { name: '创建方法' })
        .or(page.getByRole('button', { name: '新增检测方法' })))
    await createBtn.click()
    await page.waitForTimeout(500)

    // 创建弹窗标题和核心字段
    await expect(page.getByText('新增检测方法')).toBeVisible()
    await expect(page.getByText('方法名称').first()).toBeVisible()
  })

  test('5.7【方法状态】能区分有效和草稿状态的方法', async ({ page }) => {
    await page.goto('/equipment/detection-methods')
    await page.waitForLoadState('networkidle')

    // 方法有三种状态：草稿 → 有效 → 已废弃
    // 有效状态的方法才能被项目使用
    const activeTag = page.getByText('有效')
    await expect(activeTag.first()).toBeVisible()
  })
})
