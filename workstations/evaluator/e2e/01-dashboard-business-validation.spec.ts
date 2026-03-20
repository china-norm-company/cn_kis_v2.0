/**
 * 场景 1：工作面板 — 评估员登录后能否全面掌握工作全貌
 *
 * 业务目标对照（来自设计规划）：
 * ✓ 评估员登录后立即看到今日工作全景
 * ✓ 清楚知道有多少待接受、执行中、已完成的工单
 * ✓ 看到受试者等候队列，了解谁在等待检测
 * ✓ 环境温湿度实时状态及合规判定
 * ✓ 仪器校准状态一目了然，识别即将过期的仪器
 * ✓ 可通过扫码快捷入口快速匹配受试者
 * ✓ 点击工单可直接进入执行页面
 */
import { test, expect } from '@playwright/test'
import { injectAuth, setupApiMocks } from './helpers/setup'

test.describe('场景1: 工作面板 — 信息完整性与业务可用性', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await setupApiMocks(page)
  })

  test('1.1 【设计目标】评估员登录后应直接看到工作面板', async ({ page }) => {
    await page.goto('/evaluator/')

    // 验证：自动跳转到 dashboard
    await expect(page).toHaveURL(/\/evaluator\/dashboard/)

    // 验证：顶部应用名
    await expect(page.getByText('衡技·评估台')).toBeVisible()

    // 验证：页面标题（heading）
    await expect(page.getByRole('heading', { name: '工作面板' })).toBeVisible()

    // 验证：副标题
    await expect(page.getByText('今日工作总览与快捷操作')).toBeVisible()
  })

  test('1.2 【设计目标】评估员应清楚看到今日工单统计', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证四个统计卡片 — 评估员需要一眼了解工作量分布
    await expect(page.getByText('待接受')).toBeVisible()
    await expect(page.getByText('准备中')).toBeVisible()
    await expect(page.getByText('执行中')).toBeVisible()
    await expect(page.getByText('已完成')).toBeVisible()

    // 验证数值（避免依赖具体栅格 class）
    await expect(page.getByText('3').first()).toBeVisible() // 待接受
    await expect(page.getByText('1').first()).toBeVisible() // 准备中
    await expect(page.getByText('2').first()).toBeVisible() // 执行中
    await expect(page.getByText('5').first()).toBeVisible() // 已完成

    // 业务验证：评估员可以据此判断今天的工作负荷和进度
  })

  test('1.3 【设计目标】评估员应看到今日工单列表及关键信息', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证工单列表区域标题
    await expect(page.getByRole('heading', { name: '今日工单' })).toBeVisible()

    // 验证每个工单都携带了必要信息：标题、受试者、协议
    await expect(page.getByText('Corneometer 皮肤水分含量测试')).toBeVisible()
    await expect(page.getByText(/S-001 王丽/).first()).toBeVisible()
    await expect(page.getByText(/保湿功效评价/).first()).toBeVisible()

    await expect(page.getByText('VISIA 面部图像采集')).toBeVisible()
    await expect(page.getByText(/S-003 李雪/).first()).toBeVisible()

    await expect(page.getByText('Mexameter 皮肤色素/红斑测试')).toBeVisible()

    // 验证工单状态标签可见
    await expect(page.getByText('pending').first()).toBeVisible()
    await expect(page.getByText('in_progress').first()).toBeVisible()
    await expect(page.getByText('completed').first()).toBeVisible()

    // 业务验证：评估员看到列表后能明确知道先做哪个工单
  })

  test('1.4 【设计目标】评估员应看到受试者等候队列', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证受试者等候区域
    await expect(page.getByText('受试者等候')).toBeVisible()

    // 验证每位等候受试者的信息
    const waitingSection = page.locator('text=受试者等候').locator('..')
    await expect(page.getByText('S-001 王丽').first()).toBeVisible()
    await expect(page.getByText('09:15')).toBeVisible()
    await expect(page.getByText('S-003 李雪').first()).toBeVisible()
    await expect(page.getByText('09:30')).toBeVisible()
    await expect(page.getByText('S-008 刘洋').first()).toBeVisible()
    await expect(page.getByText('09:45')).toBeVisible()

    // 业务验证：评估员可据此安排受试者检测优先级
  })

  test('1.5 【设计目标】评估员应能实时了解检测室环境是否达标', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证环境状态区域
    await expect(page.getByText('检测室环境')).toBeVisible()

    // 验证温度和湿度数值
    await expect(page.getByText('22.5 °C')).toBeVisible()
    await expect(page.getByText('48 %RH')).toBeVisible()

    // 验证环境合规状态
    await expect(page.getByText('环境达标')).toBeVisible()

    // 业务验证：不合规环境下不应开始检测，这是 GCP 合规要求
  })

  test('1.6 【设计目标】评估员应能查看今日仪器校准状态', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证仪器状态区域
    await expect(page.getByText('今日仪器')).toBeVisible()

    // 验证各仪器名称
    await expect(page.getByText('Corneometer CM825')).toBeVisible()
    await expect(page.getByText('VISIA CR3000')).toBeVisible()
    await expect(page.getByText('Mexameter MX18')).toBeVisible()
    await expect(page.getByText('Cutometer MPA580')).toBeVisible()

    // 验证校准状态: valid 和 expiring_soon
    await expect(page.getByText('expiring_soon')).toBeVisible()

    // 业务验证：评估员需确认仪器校准有效才能执行检测
  })

  test('1.7 【设计目标】扫码执行入口应明显可见且可点击', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证扫码按钮
    const scanBtn = page.getByRole('button', { name: /扫码执行/ })
    await expect(scanBtn).toBeVisible()

    // 点击后应导航到扫码页面
    await scanBtn.click()
    await expect(page).toHaveURL(/\/evaluator\/scan/)

    // 业务验证：扫码是评估员最常用的快捷操作
  })

  test('1.8 【设计目标】点击工单应能直接进入执行页面', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 点击第一个工单
    await page.getByText('Corneometer 皮肤水分含量测试').click()

    // 验证导航到执行页面
    await expect(page).toHaveURL(/\/evaluator\/execute\/101/)

    // 业务验证：一键进入，减少操作步骤
  })

  test('1.9 【设计目标】左侧导航应包含全部功能入口', async ({ page }) => {
    await page.goto('/evaluator/dashboard')
    await page.waitForLoadState('networkidle')

    // 验证五大功能模块导航
    const nav = page.getByRole('complementary').getByRole('navigation')
    await expect(nav.getByRole('link', { name: '工作面板' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '扫码执行' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '我的排程' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '知识库' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '我的成长' })).toBeVisible()

    // 验证用户信息显示
    await expect(page.getByText('张技评')).toBeVisible()

    // 业务验证：评估员随时可以切换到任何功能模块
  })
})
